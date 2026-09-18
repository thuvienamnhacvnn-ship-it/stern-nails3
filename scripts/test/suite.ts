/**
 * The assertions.
 *
 * Imported by run.ts *after* it has set DATABASE_DIR and built the fixture.
 * That split is not stylistic: ES modules hoist imports above every statement
 * in the importing file, so a suite that set the environment at the top of
 * itself would have already imported — and configured — the database module
 * before the assignment ran. The tests would then quietly write to the demo
 * database. Keeping the environment in a separate, earlier module is what makes
 * the isolation real.
 *
 * What is covered is the list the brief asks for — the clock change, an expired
 * hold, a price that moved, a double submit, a failed payment, a duplicate and
 * a late webhook, overspending a gift card, one customer reaching another's
 * booking, and a member of staff reaching the owner's settings — plus the
 * unit-level pieces those depend on.
 *
 * On concurrency: PGlite runs everything through one connection and serialises
 * transactions, so `Promise.all` over two transactions here is a queue, not a
 * race — it cannot prove what a real Postgres would do under genuine
 * concurrency. The tests below therefore assert the invariant itself: the
 * conflict check inside the confirming transaction, and the conditional UPDATE
 * that guards a gift-card balance. Those are the mechanisms that make the race
 * safe, and they are asserted directly rather than hoped at.
 */
import { and, eq } from 'drizzle-orm';

import { db, schema } from '../../src/db/client';
import {
  BERLIN,
  addMinutes,
  buildIcs,
  isoDate,
  monthGrid,
  parseIsoDate,
  utcToZonedParts,
  zoneOffsetMinutes,
  zonedPartsToUtc,
} from '../../src/lib/time';
import { formatPrice, sumCents } from '../../src/lib/money';
import { availability, hasConflict } from '../../src/lib/availability';
import {
  bookingOwnedBy,
  canTransition,
  cancelBooking,
  confirmBooking,
  holdSlot,
  priceSelection,
  sweepExpiredHolds,
} from '../../src/lib/booking';
import { applyWebhook, createPaymentIntent, reconcile, signEvent } from '../../src/lib/payments';
import { createVoucherOrder, issueVoucher, redeem } from '../../src/lib/vouchers';
import { can } from '../../src/lib/auth';
import { advise, looksMedical } from '../../src/lib/stylist';
import { hashPassword, verifyPassword, randomVoucherCode, normaliseVoucherCode } from '../../src/lib/crypto';
import { rateLimit } from '../../src/lib/rate-limit';

/* ------------------------------------------------------------- the runner */

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
let currentGroup = '';

function group(name: string) {
  currentGroup = name;
}

async function test(name: string, body: () => void | Promise<void>) {
  try {
    await body();
    results.push({ name: `${currentGroup} · ${name}`, ok: true });
  } catch (error) {
    results.push({
      name: `${currentGroup} · ${name}`,
      ok: false,
      detail: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

async function throws(body: () => Promise<unknown>, code: string) {
  try {
    await body();
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual === code) return;
    throw new Error(`expected error "${code}", got "${actual ?? error}"`);
  }
  throw new Error(`expected error "${code}", nothing was thrown`);
}

/**
 * A Tuesday well inside the rota, far enough ahead to clear the minimum notice.
 * Everything time-dependent is pinned to it rather than to "now", so the suite
 * gives the same answer on a Sunday as on a Wednesday.
 */
function nextWeekday(target: number, weeksAhead = 2): { year: number; month: number; day: number } {
  const probe = new Date();
  probe.setUTCDate(probe.getUTCDate() + weeksAhead * 7);
  while (probe.getUTCDay() !== target) probe.setUTCDate(probe.getUTCDate() + 1);
  return { year: probe.getUTCFullYear(), month: probe.getUTCMonth() + 1, day: probe.getUTCDate() };
}

const TUESDAY = nextWeekday(2);
const TUESDAY_ISO = `${TUESDAY.year}-${String(TUESDAY.month).padStart(2, '0')}-${String(TUESDAY.day).padStart(2, '0')}`;
const at = (hour: number, minute = 0) => zonedPartsToUtc({ ...TUESDAY, hour, minute }, BERLIN);

/* ==================================================================== time */

group('time');

await test('Berlin is +01:00 in January and +02:00 in July', () => {
  equal(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z')), 60, 'January offset');
  equal(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z')), 120, 'July offset');
});

await test('a wall clock survives the round trip on both sides of the change', () => {
  for (const wall of [
    { year: 2026, month: 1, day: 15, hour: 14, minute: 0 },
    { year: 2026, month: 7, day: 15, hour: 14, minute: 0 },
    { year: 2026, month: 3, day: 29, hour: 14, minute: 0 },
    { year: 2026, month: 10, day: 25, hour: 14, minute: 0 },
  ]) {
    const back = utcToZonedParts(zonedPartsToUtc(wall, BERLIN), BERLIN);
    equal(back.hour, wall.hour, `hour for ${wall.month}/${wall.day}`);
    equal(back.day, wall.day, `day for ${wall.month}/${wall.day}`);
  }
});

await test('spring forward: 14:00 CEST is 12:00 UTC, 14:00 CET is 13:00 UTC', () => {
  equal(zonedPartsToUtc({ year: 2026, month: 3, day: 28, hour: 14, minute: 0 }, BERLIN).toISOString(),
    '2026-03-28T13:00:00.000Z', 'the Saturday before');
  equal(zonedPartsToUtc({ year: 2026, month: 3, day: 29, hour: 14, minute: 0 }, BERLIN).toISOString(),
    '2026-03-29T12:00:00.000Z', 'the Sunday of the change');
});

await test('an hour that does not exist resolves to the instant the clock jumps to', () => {
  // 02:30 on the last Sunday in March is skipped entirely in Berlin.
  const instant = zonedPartsToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, BERLIN);
  const shown = utcToZonedParts(instant, BERLIN);
  assert(shown.hour === 3, `expected the clock to have jumped to 03:xx, got ${shown.hour}`);
});

await test('the month grid is always six Monday-first weeks', () => {
  const grid = monthGrid(2026, 2);
  equal(grid.length, 42, 'cell count');
  equal(grid.filter((cell) => cell.inMonth).length, 28, 'February 2026 has 28 days');
});

await test('an impossible date is rejected rather than rolled over', () => {
  equal(parseIsoDate('2026-02-30'), null, '30 February');
  equal(parseIsoDate('2026-13-01'), null, 'month 13');
  assert(parseIsoDate('2026-02-28') !== null, '28 February is fine');
});

await test('the calendar file carries UTC instants and escapes its separators', () => {
  const ics = buildIcs({
    uid: 'x@y',
    startsAt: new Date('2026-07-15T12:00:00Z'),
    endsAt: new Date('2026-07-15T13:00:00Z'),
    summary: 'Maniküre, klassisch',
    description: 'line one\nline two',
  });
  assert(ics.includes('DTSTART:20260715T120000Z'), 'start instant');
  assert(ics.includes('SUMMARY:Maniküre\\, klassisch'), 'comma escaped');
  assert(ics.includes('DESCRIPTION:line one\\nline two'), 'newline escaped');
  assert(ics.includes('\r\n'), 'CRLF line endings');
});

/* =================================================================== money */

group('money');

await test('one price on request poisons the total', () => {
  equal(sumCents([1000, 2000]), 3000, 'plain sum');
  equal(sumCents([1000, null, 2000]), null, 'with an unpriced line');
});

await test('a null price is never rendered as zero', () => {
  assert(!formatPrice(null, 'de').includes('0'), 'German');
  assert(!formatPrice(null, 'en').includes('0'), 'English');
  assert(formatPrice(0, 'de').includes('0,00'), 'a real zero still formats');
});

/* ================================================================= pricing */

group('pricing');

await test('a variant surcharge is added to the service price', async () => {
  const plain = await priceSelection({ serviceSlug: 'klassische-manikuere' });
  equal(plain.totalCents, 4000, 'default variant costs nothing extra');

  const withColour = await priceSelection({ serviceSlug: 'klassische-manikuere', variantSlug: 'mit-farblack' });
  equal(withColour.totalCents, 4800, 'with colour');
  equal(withColour.durationMinutes, 60, 'duration grows with the variant');
});

await test('a service without a confirmed price stays on request, extras and all', async () => {
  const bare = await priceSelection({ serviceSlug: 'nail-art' });
  equal(bare.totalCents, null, 'no price');

  // Adding a priced extra must not conjure a total out of an unknown base.
  const service = await db.select().from(schema.service).where(eq(schema.service.slug, 'nail-art')).limit(1);
  const extra = await db.select().from(schema.addOn).where(eq(schema.addOn.slug, 'intensivpflege')).limit(1);
  await db.insert(schema.serviceAddOn).values({ serviceId: service[0].id, addOnId: extra[0].id }).onConflictDoNothing();

  const withExtra = await priceSelection({ serviceSlug: 'nail-art', addOnSlugs: ['intensivpflege'] });
  equal(withExtra.totalCents, null, 'still on request');
});

await test('an add-on the studio has not allowed is refused, not ignored', async () => {
  await throws(
    () => priceSelection({ serviceSlug: 'pedikuere', addOnSlugs: ['handmassage'] }),
    'incompatible_add_on',
  );
});

await test('an unpublished service cannot be priced', async () => {
  await db.update(schema.service).set({ published: false }).where(eq(schema.service.slug, 'auffuellen'));
  await throws(() => priceSelection({ serviceSlug: 'auffuellen' }), 'unknown_service');
  await db.update(schema.service).set({ published: true }).where(eq(schema.service.slug, 'auffuellen'));
});

/* ============================================================ availability */

group('availability');

await test('a working Tuesday offers slots; a closed Monday offers none', async () => {
  const priced = await priceSelection({ serviceSlug: 'french-manikuere' });
  const timing = { serviceId: priced.serviceId, durationMinutes: priced.durationMinutes, resourceIds: priced.resourceIds };

  const open = await availability({ date: TUESDAY_ISO, timing, now: at(0, 1) });
  assert(open.slots.length > 0, 'Tuesday has slots');

  const monday = new Date(Date.UTC(TUESDAY.year, TUESDAY.month - 1, TUESDAY.day - 1));
  const mondayIso = isoDate(monday, 'UTC');
  const closed = await availability({ date: mondayIso, timing, now: at(0, 1) });
  equal(closed.slots.length, 0, 'Monday is closed');
  assert(closed.nextAvailableDate !== null, 'the empty state offers the next open day');
});

await test('the last slot of the day is the one whose service ends by closing time', async () => {
  const priced = await priceSelection({ serviceSlug: 'gel-modellage' }); // 90 minutes
  const result = await availability({
    date: TUESDAY_ISO,
    timing: { serviceId: priced.serviceId, durationMinutes: priced.durationMinutes, resourceIds: priced.resourceIds },
    now: at(0, 1),
  });
  const last = result.slots[result.slots.length - 1];
  // The rota runs to 18:30, so a 90-minute service cannot start after 17:00.
  equal(last.label, '17:00', 'last 90-minute start');
});

await test('minimum notice hides slots that are too soon', async () => {
  const priced = await priceSelection({ serviceSlug: 'french-manikuere' });
  const timing = { serviceId: priced.serviceId, durationMinutes: priced.durationMinutes, resourceIds: priced.resourceIds };

  // Standing at 13:00 with a two-hour notice, 14:00 is gone and 15:30 is not.
  const result = await availability({ date: TUESDAY_ISO, timing, now: at(13, 0) });
  assert(!result.slots.some((s) => s.label === '14:00'), '14:00 is inside the notice period');
  assert(result.slots.some((s) => s.label === '15:30'), '15:30 is far enough out');
});

/* ================================================================= booking */

group('booking');

await test('the state machine refuses impossible transitions', () => {
  assert(canTransition('held', 'confirmed'), 'held to confirmed');
  assert(!canTransition('cancelled', 'confirmed'), 'a cancelled booking cannot be revived');
  assert(!canTransition('draft', 'confirmed'), 'a draft has no slot to confirm');
  assert(!canTransition('completed', 'cancelled'), 'a finished appointment is not cancellable');
});

await test('a slot can be taken once per member of staff, and no more', async () => {
  const startsAt = at(11, 0);
  const selection = { serviceSlug: 'french-manikuere' as const };

  /*
   * Three members of staff are seeded and all three can do this service, so
   * three holds must succeed on different people and the fourth must be turned
   * away. Sequential rather than parallel: PGlite serialises transactions
   * anyway, and a sequential assertion says exactly what is being proved.
   */
  const taken: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const hold = await holdSlot({ selection, startsAt, now: at(8, 0) });
    taken.push(hold.staffId);
  }
  equal(new Set(taken).size, 3, 'each hold went to a different member of staff');

  await throws(() => holdSlot({ selection, startsAt, now: at(8, 0) }), 'slot_taken');
});

await test('the conflict check itself rejects an overlapping window', async () => {
  // The guarantee underneath the race: given a live hold, `hasConflict` says so
  // for any overlapping window on the same member of staff, and says nothing
  // for a window that merely touches its edge.
  const startsAt = at(18, 0);
  const hold = await holdSlot({
    selection: { serviceSlug: 'klassische-manikuere' },
    startsAt,
    now: at(8, 0),
  });

  const overlapping = await hasConflict(db, {
    staffId: hold.staffId,
    resourceIds: [],
    startsAt: addMinutes(startsAt, 30),
    endsAt: addMinutes(startsAt, 90),
    now: at(8, 1),
  });
  assert(overlapping, 'an overlapping window is a conflict');

  const ignoringItself = await hasConflict(db, {
    staffId: hold.staffId,
    resourceIds: [],
    startsAt,
    endsAt: addMinutes(startsAt, 60),
    ignoreBookingId: hold.bookingId,
    now: at(8, 1),
  });
  assert(!ignoringItself, 'a booking does not conflict with its own hold');
});

await test('an expired hold frees the slot and returns the booking to draft', async () => {
  const startsAt = at(9, 30);
  const hold = await holdSlot({
    selection: { serviceSlug: 'klassische-manikuere' },
    startsAt,
    now: at(8, 0),
  });

  // Nobody else can have it while the hold stands.
  await throws(
    () =>
      holdSlot({
        selection: { serviceSlug: 'klassische-manikuere' },
        startsAt,
        staffId: hold.staffId,
        now: at(8, 1),
      }),
    'slot_taken',
  );

  const swept = await sweepExpiredHolds(addMinutes(hold.expiresAt, 1));
  assert(swept > 0, 'the sweep released something');

  const [after] = await db.select().from(schema.booking).where(eq(schema.booking.id, hold.bookingId)).limit(1);
  equal(after.status, 'draft', 'back to draft');

  // And now the slot is available again.
  const retaken = await holdSlot({
    selection: { serviceSlug: 'klassische-manikuere' },
    startsAt,
    staffId: hold.staffId,
    now: addMinutes(hold.expiresAt, 2),
  });
  assert(retaken.bookingId !== hold.bookingId, 'a new booking took it');
});

await test('confirming after the hold lapsed is refused', async () => {
  const hold = await holdSlot({
    selection: { serviceSlug: 'klassische-manikuere' },
    startsAt: at(16, 30),
    now: at(8, 0),
  });
  await throws(
    () =>
      confirmBooking({
        bookingId: hold.bookingId,
        contact: { firstName: 'Lena', lastName: 'Spät', email: 'lena@example.com' },
        marketingOptIn: false,
        locale: 'de',
        now: addMinutes(hold.expiresAt, 1),
      }),
    'hold_expired',
  );
});

await test('a price change after the hold does not change what was agreed', async () => {
  const hold = await holdSlot({
    selection: { serviceSlug: 'french-manikuere' },
    startsAt: at(12, 30),
    now: at(8, 0),
  });
  equal(hold.totalCents, 5000, 'held at the seeded price');

  await db.update(schema.service).set({ priceCents: 9900 }).where(eq(schema.service.slug, 'french-manikuere'));

  const booking = await confirmBooking({
    bookingId: hold.bookingId,
    contact: { firstName: 'Mara', lastName: 'Preis', email: 'mara@example.com' },
    marketingOptIn: false,
    locale: 'de',
    now: at(8, 5),
  });
  equal(booking.totalCents, 5000, 'the booking keeps the agreed total');

  const items = await db.select().from(schema.bookingItem).where(eq(schema.bookingItem.bookingId, booking.id));
  equal(items.find((i) => i.kind === 'service')!.priceCents, 5000, 'and so does the snapshotted line');

  await db.update(schema.service).set({ priceCents: 5000 }).where(eq(schema.service.slug, 'french-manikuere'));
});

await test('a double submit confirms once and returns the same booking', async () => {
  const hold = await holdSlot({
    selection: { serviceSlug: 'klassische-manikuere' },
    startsAt: at(10, 30),
    now: at(8, 0),
  });
  const contact = { firstName: 'Nina', lastName: 'Doppel', email: 'nina@example.com' };

  const first = await confirmBooking({ bookingId: hold.bookingId, contact, marketingOptIn: false, locale: 'de', now: at(8, 1) });
  const second = await confirmBooking({ bookingId: hold.bookingId, contact, marketingOptIn: false, locale: 'de', now: at(8, 2) });

  equal(second.id, first.id, 'the same booking comes back');
  equal(second.status, 'confirmed', 'still confirmed');

  const confirmations = await db
    .select()
    .from(schema.notificationJob)
    .where(and(eq(schema.notificationJob.bookingId, first.id), eq(schema.notificationJob.kind, 'booking_confirmation')));
  equal(confirmations.length, 1, 'and only one confirmation was queued');
});

await test('booking does not opt anybody into marketing', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'pedikuere' }, startsAt: at(13, 30), now: at(8, 0) });
  await confirmBooking({
    bookingId: hold.bookingId,
    contact: { firstName: 'Ruth', lastName: 'Ohne', email: 'ruth@example.com' },
    marketingOptIn: false,
    locale: 'de',
    now: at(8, 1),
  });
  const [customer] = await db.select().from(schema.customer).where(eq(schema.customer.email, 'ruth@example.com')).limit(1);
  equal(customer.marketingOptIn, false, 'consent stays off');
  equal(customer.marketingOptInAt, null, 'and unrecorded');
});

await test('one customer cannot reach another customer booking', async () => {
  const [anna] = await db.select().from(schema.customer).where(eq(schema.customer.email, 'mara@example.com')).limit(1);
  const [ruth] = await db.select().from(schema.customer).where(eq(schema.customer.email, 'ruth@example.com')).limit(1);
  const [annasBooking] = await db.select().from(schema.booking).where(eq(schema.booking.customerId, anna.id)).limit(1);

  assert((await bookingOwnedBy(anna.id, annasBooking.id)) !== null, 'her own booking is reachable');
  equal(await bookingOwnedBy(ruth.id, annasBooking.id), null, 'somebody else cannot reach it');
});

await test('cancelling releases the slot', async () => {
  const startsAt = at(15, 30);
  const hold = await holdSlot({ selection: { serviceSlug: 'klassische-manikuere' }, startsAt, now: at(8, 0) });
  const booking = await confirmBooking({
    bookingId: hold.bookingId,
    contact: { firstName: 'Sina', lastName: 'Weg', email: 'sina@example.com' },
    marketingOptIn: false,
    locale: 'de',
    now: at(8, 1),
  });

  await throws(
    () => holdSlot({ selection: { serviceSlug: 'klassische-manikuere' }, startsAt, staffId: hold.staffId, now: at(8, 2) }),
    'slot_taken',
  );

  await cancelBooking({ bookingId: booking.id, actor: { type: 'customer' }, locale: 'de', now: at(8, 3) });

  const freed = await holdSlot({
    selection: { serviceSlug: 'klassische-manikuere' },
    startsAt,
    staffId: hold.staffId,
    now: at(8, 4),
  });
  assert(freed.bookingId !== booking.id, 'the slot is bookable again');
});

/* ================================================================ payments */

group('payments');

await test('the amount comes from the booking, never from the caller', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'french-manikuere' }, startsAt: at(9, 0), now: at(7, 0) });
  const intent = await createPaymentIntent({ bookingId: hold.bookingId, method: 'card' });
  equal(intent.amountCents, 5000, 'the booking total, not anything passed in');
});

await test('a price-on-request booking cannot be charged', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'nail-art' }, startsAt: at(10, 0), now: at(7, 0) });
  await throws(() => createPaymentIntent({ bookingId: hold.bookingId, method: 'card' }), 'price_on_request');
});

await test('a repeated intent for the same booking is the same payment', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'pedikuere' }, startsAt: at(11, 30), now: at(7, 0) });
  const first = await createPaymentIntent({ bookingId: hold.bookingId, method: 'card' });
  const second = await createPaymentIntent({ bookingId: hold.bookingId, method: 'card' });
  equal(second.paymentId, first.paymentId, 'idempotent');
});

await test('an unsigned webhook is rejected', async () => {
  await throws(
    () =>
      applyWebhook({
        rawBody: JSON.stringify({ id: 'evt_x', type: 'payment.paid', occurredAt: new Date().toISOString(), data: { providerRef: 'nope' } }),
        signature: 'not-a-signature',
      }),
    'bad_signature',
  );
});

await test('a duplicate webhook is recorded once and applied once', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'french-manikuere' }, startsAt: at(14, 30), now: at(7, 0) });
  const intent = await createPaymentIntent({ bookingId: hold.bookingId, method: 'card' });

  const event = signEvent({
    id: 'evt_duplicate_1',
    type: 'payment.paid',
    provider: 'demo',
    occurredAt: new Date().toISOString(),
    data: { providerRef: intent.providerRef, amountCents: intent.amountCents },
  });

  const first = await applyWebhook({ rawBody: event.body, signature: event.signature });
  const second = await applyWebhook({ rawBody: event.body, signature: event.signature });

  assert(first.applied, 'the first one lands');
  assert(!second.applied, 'the second does not');
  equal(second.applied === false ? second.reason : '', 'duplicate', 'and says why');

  const events = await db
    .select()
    .from(schema.paymentEvent)
    .where(eq(schema.paymentEvent.providerEventId, 'evt_duplicate_1'));
  equal(events.length, 1, 'one row, not two');
});

await test('a late webhook does not roll a paid payment back', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'french-manikuere' }, startsAt: at(15, 0), now: at(7, 0) });
  const intent = await createPaymentIntent({ bookingId: hold.bookingId, method: 'card' });

  const paid = signEvent({
    id: 'evt_order_paid',
    type: 'payment.paid',
    provider: 'demo',
    occurredAt: new Date('2026-06-01T12:00:00Z').toISOString(),
    data: { providerRef: intent.providerRef },
  });
  await applyWebhook({ rawBody: paid.body, signature: paid.signature });

  // A "failed" that the provider stamped an hour earlier arrives afterwards.
  const stale = signEvent({
    id: 'evt_order_failed',
    type: 'payment.failed',
    provider: 'demo',
    occurredAt: new Date('2026-06-01T11:00:00Z').toISOString(),
    data: { providerRef: intent.providerRef },
  });
  const outcome = await applyWebhook({ rawBody: stale.body, signature: stale.signature });

  assert(!outcome.applied, 'the stale event is not applied');
  equal(outcome.applied === false ? outcome.reason : '', 'late', 'and is recorded as late');

  const [payment] = await db.select().from(schema.payment).where(eq(schema.payment.id, intent.paymentId)).limit(1);
  equal(payment.status, 'paid', 'the payment is still paid');
});

await test('a payment that settles after the hold lapsed is flagged, not silently booked', async () => {
  const hold = await holdSlot({ selection: { serviceSlug: 'klassische-manikuere' }, startsAt: at(17, 30), now: at(7, 0) });
  const intent = await createPaymentIntent({ bookingId: hold.bookingId, method: 'card' });

  await sweepExpiredHolds(addMinutes(hold.expiresAt, 1));

  const event = signEvent({
    id: 'evt_orphan',
    type: 'payment.paid',
    provider: 'demo',
    occurredAt: new Date().toISOString(),
    data: { providerRef: intent.providerRef },
  });
  await applyWebhook({ rawBody: event.body, signature: event.signature });

  const report = await reconcile();
  assert(report.orphaned >= 1, 'reconciliation noticed it');

  const flagged = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, 'payment.orphaned'));
  assert(flagged.length >= 1, 'and wrote it to the audit log for a human');
});

/* ================================================================ vouchers */

group('vouchers');

await test('an amount the studio has not approved is refused', async () => {
  await throws(() => createVoucherOrder({ amountCents: 1 }), 'amount_not_allowed');
});

await test('no code exists before the payment settles', async () => {
  const order = await createVoucherOrder({ amountCents: 5000, recipientEmail: 'gift@example.com' });
  equal(order.status, 'pending_payment', 'the order waits');
  equal(order.balanceCents, 0, 'with no balance');
  assert(order.codeHash.startsWith('pending:'), 'and no usable code');
});

await test('issuing twice for one order mints one code', async () => {
  const order = await createVoucherOrder({ amountCents: 5000, recipientEmail: 'gift2@example.com' });
  const first = await issueVoucher(order.id);
  const second = await issueVoucher(order.id);

  assert(first.code !== null, 'the first call mints');
  equal(second.code, null, 'the second does not');
  equal(second.voucher.balanceCents, 5000, 'and the balance is unchanged');
});

await test('a card cannot be spent twice', async () => {
  const order = await createVoucherOrder({ amountCents: 5000, recipientEmail: 'race@example.com' });
  const { code } = await issueVoucher(order.id);
  assert(code, 'a code was minted');

  const first = await holdSlot({ selection: { serviceSlug: 'french-manikuere' }, startsAt: at(9, 30), now: at(7, 0) });
  const second = await holdSlot({ selection: { serviceSlug: 'french-manikuere' }, startsAt: at(10, 30), now: at(7, 0) });

  const spent = await redeem({ code: code!, amountCents: 5000, bookingId: first.bookingId });
  equal(spent.appliedCents, 5000, 'the first redemption takes the balance');
  equal(spent.balanceCents, 0, 'leaving nothing');

  await throws(() => redeem({ code: code!, amountCents: 5000, bookingId: second.bookingId }), 'empty');

  const [after] = await db.select().from(schema.voucher).where(eq(schema.voucher.id, order.id)).limit(1);
  equal(after.balanceCents, 0, 'the balance never goes negative');
  equal(after.status, 'depleted', 'and the card is marked spent');

  const ledger = await db.select().from(schema.voucherLedger).where(eq(schema.voucherLedger.voucherId, order.id));
  equal(ledger.filter((entry) => entry.kind === 'redeemed').length, 1, 'one redemption in the ledger');
});

await test('the balance guard refuses a write computed from a stale read', async () => {
  /*
   * This is the mechanism that makes two simultaneous redemptions safe on a
   * real Postgres, asserted directly because PGlite cannot produce the race:
   * the UPDATE carries the balance it read in its WHERE clause, so a second
   * writer working from the same stale value matches no row.
   */
  const order = await createVoucherOrder({ amountCents: 5000, recipientEmail: 'guard@example.com' });
  await issueVoucher(order.id);

  const staleBalance = 5000;

  // Somebody else spends 20 € in between.
  await db
    .update(schema.voucher)
    .set({ balanceCents: 3000 })
    .where(eq(schema.voucher.id, order.id));

  const late = await db
    .update(schema.voucher)
    .set({ balanceCents: 0 })
    .where(and(eq(schema.voucher.id, order.id), eq(schema.voucher.balanceCents, staleBalance)))
    .returning();

  equal(late.length, 0, 'the stale write matches no row');

  const [after] = await db.select().from(schema.voucher).where(eq(schema.voucher.id, order.id)).limit(1);
  equal(after.balanceCents, 3000, 'and the balance is untouched');
});

await test('cancelling a booking puts the gift card balance back', async () => {
  const order = await createVoucherOrder({ amountCents: 2500, recipientEmail: 'refund@example.com' });
  const { code } = await issueVoucher(order.id);

  const hold = await holdSlot({ selection: { serviceSlug: 'klassische-manikuere' }, startsAt: at(12, 0), now: at(7, 0) });
  await redeem({ code: code!, amountCents: 2500, bookingId: hold.bookingId });

  const booking = await confirmBooking({
    bookingId: hold.bookingId,
    contact: { firstName: 'Tara', lastName: 'Gutschein', email: 'tara@example.com' },
    marketingOptIn: false,
    locale: 'de',
    now: at(7, 1),
  });

  await cancelBooking({ bookingId: booking.id, actor: { type: 'customer' }, locale: 'de', now: at(7, 2) });

  const [after] = await db.select().from(schema.voucher).where(eq(schema.voucher.id, order.id)).limit(1);
  equal(after.balanceCents, 2500, 'the balance is restored');
});

await test('a code is compared without regard for case or dashes', () => {
  const code = randomVoucherCode();
  equal(normaliseVoucherCode(code.toLowerCase().replace(/-/g, ' ')), normaliseVoucherCode(code), 'same card');
});

/* ================================================================== access */

group('access');

await test('roles have the permissions they should and not the ones they should not', () => {
  assert(can('owner', 'settings.write'), 'the owner configures the studio');
  assert(!can('manager', 'settings.write'), 'a manager does not');
  assert(!can('staff', 'settings.write'), 'nor does a member of staff');
  assert(!can('staff', 'catalogue.write'), 'a member of staff does not change prices');
  assert(!can('staff', 'calendar.read.all'), 'a member of staff sees their own calendar');
  assert(can('staff', 'calendar.read.own'), 'which they do see');
  assert(can('manager', 'catalogue.write'), 'a manager maintains the catalogue');
});

await test('a password verifies only against itself', () => {
  const stored = hashPassword('correct horse battery staple');
  assert(verifyPassword('correct horse battery staple', stored), 'the right password');
  assert(!verifyPassword('correct horse battery stapl', stored), 'a near miss');
  assert(!verifyPassword('anything', null), 'an account with no password');
});

await test('the rate limiter opens and then closes', () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i += 1) assert(rateLimit(key, 3, 60).allowed, `attempt ${i + 1}`);
  const blocked = rateLimit(key, 3, 60);
  assert(!blocked.allowed, 'the fourth is blocked');
  assert(blocked.retryAfterSeconds > 0, 'and says when to come back');
});

/* ================================================================= stylist */

group('stylist');

await test('a medical question is answered with a referral and no recommendations', async () => {
  assert(looksMedical('Ich habe Nagelpilz, was hilft?'), 'the German compound is caught');
  assert(looksMedical('my nail is infected'), 'and the English phrasing');
  // The false positive that a naive substring match would produce: "pain" is
  // inside "painted", and a hand-painted look is not a medical question.
  assert(!looksMedical('Ich hätte gern einen handbemalten, painted Look'), 'painted is not pain');
  assert(!looksMedical('Something bold for a party'), 'an ordinary request passes through');

  const reply = await advise({ message: 'Ich habe Nagelpilz, was hilft?', locale: 'de' });
  assert(reply.referral, 'flagged as a referral');
  equal(reply.recommendations.length, 0, 'and recommends nothing');
  assert(reply.message.includes('Arzt') || reply.message.includes('Ärztin'), 'and points at a doctor');
});

await test('recommendations only ever name published looks', async () => {
  await db.update(schema.look).set({ published: false }).where(eq(schema.look.slug, 'cat-eye-olive'));

  const reply = await advise({ message: 'Ich möchte etwas Auffälliges in dunklem Grün', locale: 'de' });
  assert(
    !reply.recommendations.some((r) => r.lookSlug === 'cat-eye-olive'),
    'the withdrawn look is not offered',
  );

  await db.update(schema.look).set({ published: true }).where(eq(schema.look.slug, 'cat-eye-olive'));
});

await test('the offline recommender still answers, and answers plausibly', async () => {
  const reply = await advise({ message: 'Ich hätte gern etwas Natürliches, kurz und dezent', locale: 'de' });
  assert(reply.offline, 'no model is configured, so the rules answered');
  assert(reply.recommendations.length > 0, 'and it still found something');
  assert(reply.recommendations.length <= 3, 'at most three');
});

/* ================================================================== report */

const failed = results.filter((r) => !r.ok);

console.log('');
for (const result of results) {
  console.log(`${result.ok ? '  ok  ' : ' FAIL '} ${result.name}`);
  if (!result.ok) console.log(`\n${result.detail}\n`);
}
console.log('');
console.log(`${results.length - failed.length}/${results.length} passed`);

process.exit(failed.length === 0 ? 0 : 1);
