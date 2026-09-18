/**
 * Berlin wall time ↔ UTC instants.
 *
 * Everything in the database is an instant in UTC. Everything a person reads or
 * types — "Donnerstag, 15. Oktober, 14:00" — is wall time in Europe/Berlin.
 * The two are not a fixed offset apart: Berlin is +01:00 in winter and +02:00
 * in summer, and on two nights a year an hour is skipped or repeated.
 *
 * Rather than ship a timezone library, the conversion is done with the tz
 * database the platform already carries, through Intl. `zonedPartsToUtc`
 * inverts the mapping by iterating: guess an instant, ask the zone what wall
 * clock that instant shows, and correct by the difference. Two rounds settle
 * every case including the changeovers, because the offset changes by at most
 * an hour and the second round starts within an hour of the answer.
 */

export const BERLIN = 'Europe/Berlin';

export type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let existing = partsFormatter.get(timeZone);
  if (!existing) {
    existing = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatter.set(timeZone, existing);
  }
  return existing;
}

/** What clock the given instant shows in the zone. */
export function utcToZonedParts(instant: Date, timeZone = BERLIN): WallClock & { second: number } {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** The zone's offset from UTC, in minutes, at that instant. */
export function zoneOffsetMinutes(instant: Date, timeZone = BERLIN): number {
  const wall = utcToZonedParts(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * The instant at which the zone shows that wall clock.
 *
 * On the spring-forward night 02:30 does not exist; the iteration lands on the
 * instant the zone jumps to, which is what a calendar should offer. On the
 * autumn night 02:30 happens twice; this returns the first, and availability
 * never generates a slot in the repeated hour anyway because the studio is
 * closed at 02:00.
 */
export function zonedPartsToUtc(wall: WallClock, timeZone = BERLIN): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);

  /*
   * Two rounds settle every wall time that exists, because the offset changes
   * by at most an hour and the second round starts within an hour of the
   * answer.
   *
   * A wall time that does *not* exist — 02:30 on the morning the clocks go
   * forward — has no fixed point, and the iteration oscillates between the two
   * instants either side of the gap. That is not a failure to converge; it is
   * the correct answer to an incorrect question, and the loop detects it by
   * seeing a candidate it has already produced. In that case we return the
   * later instant, which is the moment the clock jumps to: a calendar should
   * offer 03:30 rather than silently reinterpret the request as 01:30.
   */
  const seen: number[] = [];
  let guess = new Date(naive);
  for (let round = 0; round < 4; round += 1) {
    const offset = zoneOffsetMinutes(guess, timeZone);
    const corrected = naive - offset * 60000;
    if (corrected === guess.getTime()) return guess;
    if (seen.includes(corrected)) return new Date(Math.max(corrected, guess.getTime()));
    seen.push(guess.getTime());
    guess = new Date(corrected);
  }
  return guess;
}

/** `2026-10-15` in the zone, for URLs and date inputs. */
export function isoDate(instant: Date, timeZone = BERLIN): string {
  const p = utcToZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-trip through UTC to reject 2026-02-30 and friends.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Midnight at the start of that local day, as an instant. */
export function startOfLocalDay(date: { year: number; month: number; day: number }, timeZone = BERLIN): Date {
  return zonedPartsToUtc({ ...date, hour: 0, minute: 0 }, timeZone);
}

/** ISO weekday, 1 = Monday … 7 = Sunday, for the local day of that instant. */
export function localWeekday(instant: Date, timeZone = BERLIN): number {
  const p = utcToZonedParts(instant, timeZone);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Minutes since local midnight. */
export function minutesIntoLocalDay(instant: Date, timeZone = BERLIN): number {
  const p = utcToZonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60000);
}

export function addDays(date: { year: number; month: number; day: number }, days: number) {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: probe.getUTCFullYear(), month: probe.getUTCMonth() + 1, day: probe.getUTCDate() };
}

/** `14:00`, in the zone. */
export function formatTime(instant: Date, timeZone = BERLIN): string {
  const p = utcToZonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const LONG_DATE = new Map<string, Intl.DateTimeFormat>();

/** `Donnerstag, 15. Oktober 2026` / `Thursday, 15 October 2026`. */
export function formatLongDate(instant: Date, locale: 'de' | 'en', timeZone = BERLIN): string {
  const key = `${locale}:${timeZone}`;
  let formatter = LONG_DATE.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    LONG_DATE.set(key, formatter);
  }
  return formatter.format(instant);
}

/** `Oktober 2026` / `October 2026`, for the calendar header. */
export function formatMonthYear(year: number, month: number, locale: 'de' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * The Monday-first grid a month is drawn on: always six rows of seven, with the
 * tail of the previous month and the head of the next greyed out, so the
 * calendar never changes height between months.
 */
export function monthGrid(year: number, month: number): { year: number; month: number; day: number; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const weekday = first.getUTCDay() === 0 ? 7 : first.getUTCDay(); // ISO
  const start = new Date(Date.UTC(year, month - 1, 1 - (weekday - 1)));
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const cell = new Date(start.getTime() + i * 86400000);
    cells.push({
      year: cell.getUTCFullYear(),
      month: cell.getUTCMonth() + 1,
      day: cell.getUTCDate(),
      inMonth: cell.getUTCMonth() + 1 === month && cell.getUTCFullYear() === year,
    });
  }
  return cells;
}

/**
 * An iCalendar file for one appointment.
 *
 * Times go out as UTC with a trailing Z rather than as local times with a
 * VTIMEZONE block: it is the one form every calendar client reads the same way,
 * and it cannot drift if the tz database updates between now and the
 * appointment.
 */
export function buildIcs(input: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  location?: string | null;
  organizerEmail?: string | null;
  createdAt?: Date;
}): string {
  const stamp = (d: Date) => `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  // Commas, semicolons and newlines are field separators in iCalendar.
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stern Nails 3//Booking//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${stamp(input.createdAt ?? new Date())}`,
    `DTSTART:${stamp(input.startsAt)}`,
    `DTEND:${stamp(input.endsAt)}`,
    `SUMMARY:${esc(input.summary)}`,
    `DESCRIPTION:${esc(input.description)}`,
  ];
  if (input.location) lines.push(`LOCATION:${esc(input.location)}`);
  if (input.organizerEmail) lines.push(`ORGANIZER:mailto:${input.organizerEmail}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  // RFC 5545 wants CRLF, and folding at 75 octets. Our lines are short enough
  // that only DESCRIPTION ever needs folding, which clients tolerate either
  // way, so this keeps the simple form.
  return `${lines.join('\r\n')}\r\n`;
}
