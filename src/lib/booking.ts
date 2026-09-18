import 'server-only';

import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { hasConflict } from './availability';
import { bookingReference, hashToken, randomToken } from './crypto';
import { sumCents } from './money';
import { addMinutes, buildIcs, formatLongDate, formatTime } from './time';
import { queueEmail } from './notify';
import { audit } from './audit';
import { env } from './env';
import type { Locale } from './i18n';

/**
 * The booking lifecycle.
 *
 * draft ──hold──▶ held ──▶ pending_payment ──▶ confirmed ──▶ completed
 *   │               │             │                │
 *   └───────────────┴─────────────┴────────────────┴──▶ cancelled
 *                                                   └──▶ no_show
 *
 * Transitions go through `transition()` so that an impossible one — reviving a
 * cancelled booking, confirming a draft that never held a slot — fails loudly
 * here rather than quietly halfway through a handler.
 *
 * Two invariants are worth stating plainly, because most of the care in this
 * file is spent on them:
 *
 *  - The price comes from the service record, in this process, every time.
 *    Nothing the browser sends about money is read.
 *  - Confirmation is a transaction that re-checks for conflicts. Passing the
 *    availability view is not a reservation; winning the conflict check is.
 */

export type BookingStatus = (typeof schema.bookingStatus.enumValues)[number];

const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  draft: ['held', 'cancelled'],
  held: ['pending_payment', 'confirmed', 'draft', 'cancelled'],
  pending_payment: ['confirmed', 'cancelled', 'held'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
};

export class BookingError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'BookingError';
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new BookingError('invalid_transition', `Booking cannot go from ${from} to ${to}`);
  }
}

/* --------------------------------------------------------------- pricing */

export type DraftSelection = {
  serviceSlug: string;
  variantSlug?: string | null;
  addOnSlugs?: string[];
  lookSlug?: string | null;
};

export type PricedSelection = {
  serviceId: string;
  lookId: string | null;
  durationMinutes: number;
  /** Null when anything in the basket is still price-on-request. */
  totalCents: number | null;
  resourceIds: string[];
  items: {
    kind: 'service' | 'variant' | 'add_on';
    serviceId?: string;
    variantId?: string;
    addOnId?: string;
    nameDe: string;
    nameEn: string;
    durationMinutes: number;
    priceCents: number | null;
    sortOrder: number;
  }[];
};

/**
 * Turns a set of slugs into what it costs and how long it takes.
 *
 * Only published services and their own variants and permitted add-ons are
 * accepted: a slug that names a draft service, or an add-on the studio has not
 * allowed on that service, is rejected rather than silently dropped, so a
 * tampered request fails instead of quietly booking something cheaper.
 */
export async function priceSelection(selection: DraftSelection): Promise<PricedSelection> {
  const [service] = await db
    .select()
    .from(schema.service)
    .where(and(eq(schema.service.slug, selection.serviceSlug), eq(schema.service.published, true)))
    .limit(1);
  if (!service) throw new BookingError('unknown_service');

  const variants = await db
    .select()
    .from(schema.serviceVariant)
    .where(eq(schema.serviceVariant.serviceId, service.id))
    .orderBy(asc(schema.serviceVariant.sortOrder));

  const variant = selection.variantSlug
    ? variants.find((v) => v.slug === selection.variantSlug)
    : variants.find((v) => v.isDefault) ?? variants[0];
  if (selection.variantSlug && !variant) throw new BookingError('unknown_variant');

  const wantedAddOns = selection.addOnSlugs ?? [];
  const permitted = wantedAddOns.length
    ? await db
        .select({ addOn: schema.addOn })
        .from(schema.serviceAddOn)
        .innerJoin(schema.addOn, eq(schema.addOn.id, schema.serviceAddOn.addOnId))
        .where(
          and(
            eq(schema.serviceAddOn.serviceId, service.id),
            eq(schema.addOn.published, true),
            inArray(schema.addOn.slug, wantedAddOns),
          ),
        )
    : [];
  if (permitted.length !== wantedAddOns.length) throw new BookingError('incompatible_add_on');

  const resources = await db
    .select({ resourceId: schema.serviceResource.resourceId })
    .from(schema.serviceResource)
    .where(eq(schema.serviceResource.serviceId, service.id));

  let look: typeof schema.look.$inferSelect | undefined;
  if (selection.lookSlug) {
    [look] = await db
      .select()
      .from(schema.look)
      .where(and(eq(schema.look.slug, selection.lookSlug), eq(schema.look.published, true)))
      .limit(1);
  }

  const items: PricedSelection['items'] = [
    {
      kind: 'service',
      serviceId: service.id,
      nameDe: service.nameDe,
      nameEn: service.nameEn,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      sortOrder: 0,
    },
  ];

  if (variant) {
    items.push({
      kind: 'variant',
      variantId: variant.id,
      nameDe: variant.nameDe,
      nameEn: variant.nameEn,
      durationMinutes: variant.durationDeltaMinutes,
      // A delta on a price-on-request service stays on request; adding a
      // surcharge to an unknown base would invent a number.
      priceCents: service.priceCents === null ? null : variant.priceDeltaCents,
      sortOrder: 1,
    });
  }

  permitted.forEach(({ addOn }, index) => {
    items.push({
      kind: 'add_on',
      addOnId: addOn.id,
      nameDe: addOn.nameDe,
      nameEn: addOn.nameEn,
      durationMinutes: addOn.durationMinutes,
      priceCents: addOn.priceCents,
      sortOrder: 2 + index,
    });
  });

  return {
    serviceId: service.id,
    lookId: look?.id ?? null,
    durationMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
    totalCents: sumCents(items.map((item) => item.priceCents)),
    resourceIds: resources.map((r) => r.resourceId),
    items,
  };
}

/* ------------------------------------------------------------------ holds */

export type HoldResult = {
  bookingId: string;
  reference: string;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  totalCents: number | null;
};

/**
 * Reserves a slot for as long as checkout takes.
 *
 * Re-holding for an existing draft releases the previous hold first, so
 * stepping back and picking a different time does not leave the old one
 * blocking the calendar for ten minutes.
 */
export async function holdSlot(input: {
  selection: DraftSelection;
  startsAt: Date;
  staffId?: string | null;
  bookingId?: string | null;
  now?: Date;
}): Promise<HoldResult> {
  const now = input.now ?? new Date();
  const priced = await priceSelection(input.selection);
  const [config] = await db.select().from(schema.businessSettings).limit(1);
  const holdMinutes = config?.holdMinutes ?? 10;
  const buffer = config?.bufferMinutes ?? 10;

  const endsAt = addMinutes(input.startsAt, priced.durationMinutes);
  const blockUntil = addMinutes(endsAt, buffer);

  // Who is qualified and, if the customer chose "Egal", who is actually free.
  const qualified = await db
    .select({ staffId: schema.staffService.staffId })
    .from(schema.staffService)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.staffService.staffId))
    .where(and(eq(schema.staffService.serviceId, priced.serviceId), eq(schema.staff.active, true)));

  const candidates = input.staffId
    ? qualified.filter((q) => q.staffId === input.staffId).map((q) => q.staffId)
    : qualified.map((q) => q.staffId);
  if (candidates.length === 0) throw new BookingError('no_staff');

  return db.transaction(async (tx) => {
    let bookingId = input.bookingId ?? null;
    let existing: typeof schema.booking.$inferSelect | undefined;

    if (bookingId) {
      [existing] = await tx.select().from(schema.booking).where(eq(schema.booking.id, bookingId)).limit(1);
      if (!existing) throw new BookingError('unknown_booking');
      if (!['draft', 'held'].includes(existing.status)) throw new BookingError('invalid_transition');
      // Let go of the old slot before taking a new one, or the draft competes
      // with itself for the very time it is trying to move to.
      await tx
        .update(schema.bookingHold)
        .set({ releasedAt: now })
        .where(and(eq(schema.bookingHold.bookingId, bookingId), isNull(schema.bookingHold.releasedAt)));
    }

    let chosen: string | null = null;
    for (const staffId of candidates) {
      const clash = await hasConflict(tx as unknown as typeof db, {
        staffId,
        resourceIds: priced.resourceIds,
        startsAt: input.startsAt,
        endsAt: blockUntil,
        ignoreBookingId: bookingId ?? undefined,
        now,
      });
      if (!clash) {
        chosen = staffId;
        break;
      }
    }
    if (!chosen) throw new BookingError('slot_taken');

    if (!bookingId) {
      const [created] = await tx
        .insert(schema.booking)
        .values({
          reference: bookingReference(),
          status: 'held',
          staffId: chosen,
          staffAny: !input.staffId,
          resourceId: priced.resourceIds[0] ?? null,
          startsAt: input.startsAt,
          endsAt,
          totalCents: priced.totalCents,
          lookId: priced.lookId,
          isDemo: env.demoMode,
        })
        .returning({ id: schema.booking.id, reference: schema.booking.reference });
      bookingId = created.id;
      existing = undefined;
    } else {
      assertTransition(existing!.status as BookingStatus, 'held');
      await tx
        .update(schema.booking)
        .set({
          status: 'held',
          staffId: chosen,
          staffAny: !input.staffId,
          resourceId: priced.resourceIds[0] ?? null,
          startsAt: input.startsAt,
          endsAt,
          totalCents: priced.totalCents,
          lookId: priced.lookId,
          updatedAt: now,
        })
        .where(eq(schema.booking.id, bookingId));
    }

    // The items are rewritten from scratch: the selection may have changed and
    // a stale add-on line would end up on the confirmation.
    await tx.delete(schema.bookingItem).where(eq(schema.bookingItem.bookingId, bookingId));
    await tx.insert(schema.bookingItem).values(
      priced.items.map((item) => ({
        bookingId: bookingId!,
        kind: item.kind,
        serviceId: item.serviceId ?? null,
        variantId: item.variantId ?? null,
        addOnId: item.addOnId ?? null,
        nameDe: item.nameDe,
        nameEn: item.nameEn,
        durationMinutes: item.durationMinutes,
        priceCents: item.priceCents,
        sortOrder: item.sortOrder,
      })),
    );

    const expiresAt = addMinutes(now, holdMinutes);
    await tx.insert(schema.bookingHold).values({
      bookingId,
      staffId: chosen,
      resourceId: priced.resourceIds[0] ?? null,
      startsAt: input.startsAt,
      endsAt: blockUntil,
      expiresAt,
    });

    const [row] = await tx
      .select({ reference: schema.booking.reference })
      .from(schema.booking)
      .where(eq(schema.booking.id, bookingId))
      .limit(1);

    return {
      bookingId,
      reference: row.reference,
      staffId: chosen,
      startsAt: input.startsAt,
      endsAt,
      expiresAt,
      totalCents: priced.totalCents,
    };
  });
}

/** The live hold on a draft, if it has not run out. */
export async function activeHold(bookingId: string, now = new Date()) {
  const [hold] = await db
    .select()
    .from(schema.bookingHold)
    .where(
      and(
        eq(schema.bookingHold.bookingId, bookingId),
        isNull(schema.bookingHold.releasedAt),
        gt(schema.bookingHold.expiresAt, now),
      ),
    )
    .orderBy(desc(schema.bookingHold.createdAt))
    .limit(1);
  return hold ?? null;
}

/* ------------------------------------------------------------- confirming */

export type ConfirmInput = {
  bookingId: string;
  contact: { firstName: string; lastName: string; email: string; phone?: string | null };
  marketingOptIn: boolean;
  locale: Locale;
  /** Set once a payment exists; on-site bookings confirm without one. */
  paymentId?: string | null;
  now?: Date;
};

/**
 * Confirms a booking, or refuses.
 *
 * The transaction re-runs the conflict check against everything except this
 * booking's own hold. That is the moment two racing customers are separated:
 * the loser gets `slot_taken` and their hold stays, so they can pick again
 * without losing the rest of their form.
 */
export async function confirmBooking(input: ConfirmInput) {
  const now = input.now ?? new Date();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.booking).where(eq(schema.booking.id, input.bookingId)).limit(1);
    if (!existing) throw new BookingError('unknown_booking');
    if (existing.status === 'confirmed') return { booking: existing, alreadyConfirmed: true as const };
    assertTransition(existing.status as BookingStatus, 'confirmed');
    if (!existing.startsAt || !existing.endsAt || !existing.staffId) throw new BookingError('incomplete_booking');

    const hold = await tx
      .select()
      .from(schema.bookingHold)
      .where(and(eq(schema.bookingHold.bookingId, existing.id), isNull(schema.bookingHold.releasedAt)))
      .orderBy(desc(schema.bookingHold.createdAt))
      .limit(1);
    if (hold.length === 0 || hold[0].expiresAt <= now) throw new BookingError('hold_expired');

    const resourceIds = existing.resourceId ? [existing.resourceId] : [];
    const clash = await hasConflict(tx as unknown as typeof db, {
      staffId: existing.staffId,
      resourceIds,
      startsAt: existing.startsAt,
      endsAt: hold[0].endsAt,
      ignoreBookingId: existing.id,
      now,
    });
    if (clash) throw new BookingError('slot_taken');

    // The customer record is keyed on email; booking again just attaches to it.
    const email = input.contact.email.trim().toLowerCase();
    const [customer] = await tx
      .insert(schema.customer)
      .values({
        email,
        firstName: input.contact.firstName.trim(),
        lastName: input.contact.lastName.trim(),
        phone: input.contact.phone?.trim() || null,
        marketingOptIn: input.marketingOptIn,
        marketingOptInAt: input.marketingOptIn ? now : null,
      })
      .onConflictDoUpdate({
        target: schema.customer.email,
        set: {
          firstName: input.contact.firstName.trim(),
          lastName: input.contact.lastName.trim(),
          // Consent is only ever turned on by an explicit tick. An unticked box
          // on a later booking does not revoke it, and a booking alone never
          // grants it.
          ...(input.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: now } : {}),
        },
      })
      .returning();

    const [confirmed] = await tx
      .update(schema.booking)
      .set({
        status: 'confirmed',
        customerId: customer.id,
        contactFirstName: input.contact.firstName.trim(),
        contactLastName: input.contact.lastName.trim(),
        contactEmail: email,
        contactPhone: input.contact.phone?.trim() || null,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.booking.id, existing.id))
      .returning();

    await tx
      .update(schema.bookingHold)
      .set({ releasedAt: now })
      .where(and(eq(schema.bookingHold.bookingId, existing.id), isNull(schema.bookingHold.releasedAt)));

    return { booking: confirmed, alreadyConfirmed: false as const };
  });

  if (result.alreadyConfirmed) return result.booking;

  await audit({
    actorType: 'customer',
    actorLabel: input.contact.email,
    action: 'booking.confirmed',
    entity: 'booking',
    entityId: result.booking.id,
    after: { status: 'confirmed', startsAt: result.booking.startsAt, totalCents: result.booking.totalCents },
  });

  await sendConfirmation(result.booking.id, input.locale);
  return result.booking;
}

/* ---------------------------------------------------- self-service links */

/**
 * A link that lets somebody manage one booking without an account.
 *
 * It carries a random token, stored hashed, tied to that booking and expiring a
 * day after the appointment. Nothing about it is derived from the booking id,
 * so a person holding one link cannot construct another.
 */
export async function issueManageToken(bookingId: string, expiresAt: Date): Promise<string> {
  const token = randomToken();
  await db.insert(schema.authToken).values({
    tokenHash: hashToken(token),
    bookingId,
    purpose: 'manage_booking',
    expiresAt,
  });
  return token;
}

/**
 * The booking, only if it belongs to that customer.
 *
 * Extracted from the cancel endpoint so the rule can be tested directly: a
 * booking id belonging to somebody else returns null, exactly as a booking id
 * that does not exist does. The caller answers both with the same 404, so the
 * endpoint cannot be used to discover who has an appointment.
 */
export async function bookingOwnedBy(customerId: string, bookingId: string) {
  const [row] = await db
    .select()
    .from(schema.booking)
    .where(and(eq(schema.booking.id, bookingId), eq(schema.booking.customerId, customerId)))
    .limit(1);
  return row ?? null;
}

export async function bookingForManageToken(token: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(schema.authToken)
    .where(and(eq(schema.authToken.tokenHash, hashToken(token)), eq(schema.authToken.purpose, 'manage_booking')))
    .limit(1);
  if (!row || !row.bookingId || row.expiresAt <= now) return null;

  const [found] = await db.select().from(schema.booking).where(eq(schema.booking.id, row.bookingId)).limit(1);
  return found ?? null;
}

/* ------------------------------------------------------------ cancelling */

export async function cancelBooking(input: {
  bookingId: string;
  reason?: string;
  actor: { type: 'customer' | 'staff' | 'system'; id?: string; label?: string };
  locale: Locale;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const cancelled = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.booking).where(eq(schema.booking.id, input.bookingId)).limit(1);
    if (!existing) throw new BookingError('unknown_booking');
    if (existing.status === 'cancelled') return existing;
    assertTransition(existing.status as BookingStatus, 'cancelled');

    const [row] = await tx
      .update(schema.booking)
      .set({ status: 'cancelled', cancelledAt: now, cancellationReason: input.reason ?? null, updatedAt: now })
      .where(eq(schema.booking.id, input.bookingId))
      .returning();

    await tx
      .update(schema.bookingHold)
      .set({ releasedAt: now })
      .where(and(eq(schema.bookingHold.bookingId, input.bookingId), isNull(schema.bookingHold.releasedAt)));

    // Anything the customer paid with a gift card goes back onto it, in the
    // same transaction, so a cancellation cannot half-refund.
    if (existing.voucherId && existing.discountCents > 0) {
      const [voucher] = await tx
        .select()
        .from(schema.voucher)
        .where(eq(schema.voucher.id, existing.voucherId))
        .limit(1);
      if (voucher) {
        const balance = voucher.balanceCents + existing.discountCents;
        await tx
          .update(schema.voucher)
          .set({ balanceCents: balance, status: balance > 0 ? 'active' : voucher.status })
          .where(eq(schema.voucher.id, voucher.id));
        await tx.insert(schema.voucherLedger).values({
          voucherId: voucher.id,
          kind: 'refunded',
          deltaCents: existing.discountCents,
          balanceAfterCents: balance,
          bookingId: existing.id,
          note: 'booking cancelled',
        });
      }
    }

    return row;
  });

  await audit({
    actorType: input.actor.type,
    actorId: input.actor.id,
    actorLabel: input.actor.label,
    action: 'booking.cancelled',
    entity: 'booking',
    entityId: input.bookingId,
    after: { reason: input.reason ?? null },
  });

  if (cancelled.contactEmail) {
    await queueEmail({
      kind: 'booking_cancelled',
      to: cancelled.contactEmail,
      subject:
        input.locale === 'de'
          ? `Dein Termin bei Stern Nails 3 wurde abgesagt (${cancelled.reference})`
          : `Your Stern Nails 3 appointment was cancelled (${cancelled.reference})`,
      body:
        input.locale === 'de'
          ? `Hallo,\n\ndein Termin ${cancelled.reference} wurde abgesagt.\n\nDu kannst jederzeit einen neuen Termin buchen: ${env.publicUrl}/de/termin\n\nStern Nails 3`
          : `Hello,\n\nyour appointment ${cancelled.reference} has been cancelled.\n\nYou can book a new one any time: ${env.publicUrl}/en/booking\n\nStern Nails 3`,
      bookingId: cancelled.id,
    });
  }

  return cancelled;
}

/* ----------------------------------------------------------- confirmation */

/**
 * Queues the confirmation mail with the calendar file attached.
 *
 * The .ics is generated here and stored on the job, so what the customer
 * received is recoverable from the database even if the service record changes
 * afterwards.
 */
export async function sendConfirmation(bookingId: string, locale: Locale) {
  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId)).limit(1);
  if (!booking || !booking.startsAt || !booking.endsAt || !booking.contactEmail) return;

  const items = await db
    .select()
    .from(schema.bookingItem)
    .where(eq(schema.bookingItem.bookingId, bookingId))
    .orderBy(asc(schema.bookingItem.sortOrder));
  const [config] = await db.select().from(schema.businessSettings).limit(1);

  const title = items.find((i) => i.kind === 'service');
  const serviceName = locale === 'de' ? title?.nameDe : title?.nameEn;
  const when = `${formatLongDate(booking.startsAt, locale)}, ${formatTime(booking.startsAt)}`;

  const manageToken = await issueManageToken(bookingId, addMinutes(booking.endsAt, 24 * 60));
  const managePath = locale === 'de' ? 'bestaetigung' : 'confirmation';
  const manageUrl = `${env.publicUrl}/${locale}/${managePath}/${manageToken}`;

  const location = [config?.street, [config?.postalCode, config?.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  const ics = buildIcs({
    uid: `${booking.reference}@stern-nails`,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    summary: `${serviceName ?? 'Termin'} – Stern Nails 3`,
    description: locale === 'de' ? `Buchungsnummer ${booking.reference}\n${manageUrl}` : `Booking ${booking.reference}\n${manageUrl}`,
    // Only real. An address the owner has not entered is not invented here.
    location: location || null,
    organizerEmail: config?.email ?? null,
  });

  const demoLine = env.demoMode
    ? locale === 'de'
      ? '\n\nHinweis: Demomodus. Es wurde keine Zahlung ausgelöst.\n'
      : '\n\nNote: demo mode. No payment was taken.\n'
    : '\n';

  await queueEmail({
    kind: 'booking_confirmation',
    to: booking.contactEmail,
    subject:
      locale === 'de'
        ? `Dein Termin bei Stern Nails 3 – ${when}`
        : `Your Stern Nails 3 appointment – ${when}`,
    body:
      locale === 'de'
        ? `Hallo ${booking.contactFirstName ?? ''},\n\nwir freuen uns auf dich.\n\n${serviceName ?? ''}\n${when}\nBuchungsnummer: ${booking.reference}\n\nTermin verwalten: ${manageUrl}${demoLine}\nStern Nails 3`
        : `Hello ${booking.contactFirstName ?? ''},\n\nwe are looking forward to seeing you.\n\n${serviceName ?? ''}\n${when}\nBooking reference: ${booking.reference}\n\nManage your appointment: ${manageUrl}${demoLine}\nStern Nails 3`,
    attachment: ics,
    attachmentName: `stern-nails-${booking.reference}.ics`,
    bookingId,
  });

  return manageToken;
}

/**
 * Releases holds whose deadline has passed.
 *
 * Availability already ignores expired holds, so this is housekeeping rather
 * than correctness — but it keeps the table from growing without bound and
 * gives the admin an honest view of what is actually held right now.
 */
export async function sweepExpiredHolds(now = new Date()) {
  const released = await db
    .update(schema.bookingHold)
    .set({ releasedAt: now })
    .where(and(isNull(schema.bookingHold.releasedAt), sql`${schema.bookingHold.expiresAt} <= ${now}`))
    .returning({ bookingId: schema.bookingHold.bookingId });

  if (released.length === 0) return 0;

  // A booking that only ever held a slot goes back to draft; one that got as
  // far as a payment attempt is left alone for reconciliation to look at.
  await db
    .update(schema.booking)
    .set({ status: 'draft', updatedAt: now })
    .where(
      and(
        inArray(schema.booking.id, released.map((r) => r.bookingId)),
        eq(schema.booking.status, 'held'),
      ),
    );

  return released.length;
}
