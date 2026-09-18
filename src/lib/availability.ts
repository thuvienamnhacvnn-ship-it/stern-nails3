import 'server-only';

import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  BERLIN,
  addMinutes,
  isoDate,
  localWeekday,
  minutesIntoLocalDay,
  startOfLocalDay,
  zonedPartsToUtc,
  parseIsoDate,
} from './time';

/**
 * Which times are actually free.
 *
 * Availability is computed on the server, from the rota, the time off, the
 * service duration, the turnaround buffer, the bookings already taken and the
 * holds somebody else is sitting on. The browser is never asked and never
 * believed: a slot the client thinks is free still has to survive the conflict
 * check inside the confirming transaction.
 *
 * A slot is described by its start instant and the member of staff who would do
 * it. When the customer said "Egal", every qualified member of staff is tried
 * and the slot appears if any one of them is free — the choice of who is only
 * fixed at hold time.
 */

export type Slot = {
  /** ISO instant. */
  startsAt: string;
  /** Local `14:00`, precomputed so the client never re-derives a zone. */
  label: string;
  /** Staff who could take it. */
  staffIds: string[];
};

export type ServiceTiming = {
  serviceId: string;
  /** Service + variant + add-ons, before the buffer. */
  durationMinutes: number;
  /** Resources the service consumes, if any. */
  resourceIds: string[];
};

/** The granularity the studio offers appointments on. */
const SLOT_STEP_MINUTES = 30;

type Interval = { start: number; end: number }; // epoch ms

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Everything already committed on a day, per member of staff and per resource.
 *
 * Bookings in a live state and holds that have not expired both block. A
 * cancelled booking does not, and neither does a hold whose deadline has
 * passed — which is what makes an abandoned checkout give the slot back without
 * anybody sweeping anything.
 */
async function loadBusy(dayStart: Date, dayEnd: Date, now: Date) {
  const liveStatuses = ['held', 'pending_payment', 'confirmed', 'completed'] as const;

  const bookings = await db
    .select({
      id: schema.booking.id,
      staffId: schema.booking.staffId,
      resourceId: schema.booking.resourceId,
      startsAt: schema.booking.startsAt,
      endsAt: schema.booking.endsAt,
    })
    .from(schema.booking)
    .where(
      and(
        inArray(schema.booking.status, [...liveStatuses]),
        lt(schema.booking.startsAt, dayEnd),
        gt(schema.booking.endsAt, dayStart),
      ),
    );

  const holds = await db
    .select({
      bookingId: schema.bookingHold.bookingId,
      staffId: schema.bookingHold.staffId,
      resourceId: schema.bookingHold.resourceId,
      startsAt: schema.bookingHold.startsAt,
      endsAt: schema.bookingHold.endsAt,
    })
    .from(schema.bookingHold)
    .where(
      and(
        isNull(schema.bookingHold.releasedAt),
        gt(schema.bookingHold.expiresAt, now),
        lt(schema.bookingHold.startsAt, dayEnd),
        gt(schema.bookingHold.endsAt, dayStart),
      ),
    );

  const offs = await db
    .select({
      staffId: schema.timeOff.staffId,
      startsAt: schema.timeOff.startsAt,
      endsAt: schema.timeOff.endsAt,
    })
    .from(schema.timeOff)
    .where(and(lt(schema.timeOff.startsAt, dayEnd), gt(schema.timeOff.endsAt, dayStart)));

  const byStaff = new Map<string, Interval[]>();
  const byResource = new Map<string, Interval[]>();
  /** Studio-wide closures: a time-off row with no staff. */
  const studioClosed: Interval[] = [];

  const push = (map: Map<string, Interval[]>, key: string | null, interval: Interval) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(interval);
    else map.set(key, [interval]);
  };

  for (const row of [...bookings, ...holds]) {
    if (!row.startsAt || !row.endsAt) continue;
    const interval = { start: row.startsAt.getTime(), end: row.endsAt.getTime() };
    push(byStaff, row.staffId, interval);
    push(byResource, row.resourceId, interval);
  }
  for (const off of offs) {
    const interval = { start: off.startsAt.getTime(), end: off.endsAt.getTime() };
    if (off.staffId) push(byStaff, off.staffId, interval);
    else studioClosed.push(interval);
  }

  return { byStaff, byResource, studioClosed };
}

/**
 * The working windows of one member of staff on one local day, as instants.
 *
 * The rota is stored as minutes from local midnight, so it survives the clock
 * change: "09:00 to 18:00" is nine in the morning on both sides of the last
 * Sunday in March, even though the two days are different numbers of hours
 * long.
 */
function windowsFor(
  rota: { weekday: number; startMinute: number; endMinute: number }[],
  date: { year: number; month: number; day: number },
  weekday: number,
): Interval[] {
  return rota
    .filter((r) => r.weekday === weekday)
    .map((r) => ({
      start: zonedPartsToUtc({ ...date, hour: Math.floor(r.startMinute / 60), minute: r.startMinute % 60 }, BERLIN).getTime(),
      end: zonedPartsToUtc({ ...date, hour: Math.floor(r.endMinute / 60), minute: r.endMinute % 60 }, BERLIN).getTime(),
    }));
}

export type AvailabilityInput = {
  /** `2026-10-15`, local. */
  date: string;
  timing: ServiceTiming;
  /** Null means "Egal": try everyone qualified. */
  staffId?: string | null;
  /** Injected in tests so a fixed day can be checked. */
  now?: Date;
};

export type AvailabilityResult = {
  date: string;
  slots: Slot[];
  /** The first later day with anything free — what the empty state offers. */
  nextAvailableDate: string | null;
};

export async function availability(input: AvailabilityInput): Promise<AvailabilityResult> {
  const settings = await db.select().from(schema.businessSettings).limit(1);
  const config = settings[0];
  const buffer = config?.bufferMinutes ?? 10;
  const minNotice = config?.minNoticeMinutes ?? 120;
  const horizon = config?.bookingHorizonDays ?? 90;
  const now = input.now ?? new Date();

  const slots = await slotsForDay({ ...input, now }, { buffer, minNotice });

  /*
   * Only look for the next free day when today has nothing, and stop after two
   * weeks. The empty state needs one date to offer, not an exhaustive search
   * of the whole horizon.
   */
  let nextAvailableDate: string | null = null;
  if (slots.length === 0) {
    const parsed = parseIsoDate(input.date);
    if (parsed) {
      for (let ahead = 1; ahead <= Math.min(14, horizon); ahead += 1) {
        const probe = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + ahead));
        const candidate = `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, '0')}-${String(probe.getUTCDate()).padStart(2, '0')}`;
        const found = await slotsForDay({ ...input, date: candidate, now }, { buffer, minNotice });
        if (found.length > 0) {
          nextAvailableDate = candidate;
          break;
        }
      }
    }
  }

  return { date: input.date, slots, nextAvailableDate };
}

async function slotsForDay(
  input: AvailabilityInput & { now: Date },
  config: { buffer: number; minNotice: number },
): Promise<Slot[]> {
  const date = parseIsoDate(input.date);
  if (!date) return [];

  const dayStart = startOfLocalDay(date, BERLIN);
  const dayEnd = addMinutes(dayStart, 24 * 60 + 120); // a little past midnight, for late finishes
  const weekday = localWeekday(dayStart, BERLIN);

  // Who may perform this service at all.
  const qualified = await db
    .select({ staffId: schema.staffService.staffId })
    .from(schema.staffService)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.staffService.staffId))
    .where(and(eq(schema.staffService.serviceId, input.timing.serviceId), eq(schema.staff.active, true)));

  let staffIds = qualified.map((q) => q.staffId);
  if (input.staffId) staffIds = staffIds.filter((id) => id === input.staffId);
  if (staffIds.length === 0) return [];

  const rota = await db
    .select({
      staffId: schema.workSchedule.staffId,
      weekday: schema.workSchedule.weekday,
      startMinute: schema.workSchedule.startMinute,
      endMinute: schema.workSchedule.endMinute,
    })
    .from(schema.workSchedule)
    .where(inArray(schema.workSchedule.staffId, staffIds));

  const busy = await loadBusy(dayStart, dayEnd, input.now);

  // The appointment occupies its own duration; the buffer after it must also be
  // free, so a 60-minute service on a 10-minute buffer blocks 70 minutes.
  const occupancy = input.timing.durationMinutes + config.buffer;
  const earliest = input.now.getTime() + config.minNotice * 60000;

  const found = new Map<number, Set<string>>();

  for (const staffId of staffIds) {
    const windows = windowsFor(
      rota.filter((r) => r.staffId === staffId),
      date,
      weekday,
    );
    for (const window of windows) {
      /*
       * Slots start on the half hour within the window. The last one that fits
       * is the one whose service — not its buffer — ends by closing time: a
       * 17:30 start on a 60-minute service at an 18:30 close is fine even
       * though the turnaround runs past the door being locked.
       */
      const step = SLOT_STEP_MINUTES * 60000;
      const firstStart = Math.ceil(window.start / step) * step;
      for (let start = firstStart; start + input.timing.durationMinutes * 60000 <= window.end; start += step) {
        if (start < earliest) continue;

        const candidate = { start, end: start + occupancy * 60000 };
        const serviceOnly = { start, end: start + input.timing.durationMinutes * 60000 };

        if (busy.studioClosed.some((i) => overlaps(serviceOnly, i))) continue;
        if ((busy.byStaff.get(staffId) ?? []).some((i) => overlaps(candidate, i))) continue;

        // Resources are shared across staff, so a free stylist with no free
        // pedicure spa is still not a free slot.
        const resourceBlocked = input.timing.resourceIds.some((resourceId) =>
          (busy.byResource.get(resourceId) ?? []).some((i) => overlaps(candidate, i)),
        );
        if (resourceBlocked) continue;

        const set = found.get(start);
        if (set) set.add(staffId);
        else found.set(start, new Set([staffId]));
      }
    }
  }

  return [...found.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, ids]) => {
      const instant = new Date(start);
      const minutes = minutesIntoLocalDay(instant, BERLIN);
      return {
        startsAt: instant.toISOString(),
        label: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        staffIds: [...ids],
      };
    });
}

/**
 * The conflict check that runs inside the confirming transaction.
 *
 * `availability` is advisory — it describes the world as it was when the page
 * rendered. This is the check that decides, and it is deliberately narrow: does
 * anything live overlap this exact staff/resource window, ignoring the booking
 * being confirmed itself. Two customers racing for 14:00 both pass the first
 * check and only one passes this one.
 */
export async function hasConflict(
  tx: typeof db,
  input: {
    staffId: string;
    resourceIds: string[];
    startsAt: Date;
    endsAt: Date;
    ignoreBookingId?: string;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const liveStatuses = ['held', 'pending_payment', 'confirmed', 'completed'] as const;

  const clash = await tx
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(
      and(
        inArray(schema.booking.status, [...liveStatuses]),
        lt(schema.booking.startsAt, input.endsAt),
        gt(schema.booking.endsAt, input.startsAt),
        input.ignoreBookingId ? sql`${schema.booking.id} <> ${input.ignoreBookingId}` : undefined,
        input.resourceIds.length > 0
          ? or(
              eq(schema.booking.staffId, input.staffId),
              inArray(schema.booking.resourceId, input.resourceIds),
            )
          : eq(schema.booking.staffId, input.staffId),
      ),
    )
    .limit(1);
  if (clash.length > 0) return true;

  const heldElsewhere = await tx
    .select({ id: schema.bookingHold.id })
    .from(schema.bookingHold)
    .where(
      and(
        isNull(schema.bookingHold.releasedAt),
        gt(schema.bookingHold.expiresAt, now),
        lt(schema.bookingHold.startsAt, input.endsAt),
        gt(schema.bookingHold.endsAt, input.startsAt),
        input.ignoreBookingId ? sql`${schema.bookingHold.bookingId} <> ${input.ignoreBookingId}` : undefined,
        input.resourceIds.length > 0
          ? or(
              eq(schema.bookingHold.staffId, input.staffId),
              inArray(schema.bookingHold.resourceId, input.resourceIds),
            )
          : eq(schema.bookingHold.staffId, input.staffId),
      ),
    )
    .limit(1);

  return heldElsewhere.length > 0;
}

/** The day key for a slot, used to group and to build calendar links. */
export function slotDate(startsAt: Date): string {
  return isoDate(startsAt, BERLIN);
}
