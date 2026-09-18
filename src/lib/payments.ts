import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { randomToken, signPayload, verifySignature } from './crypto';
import { env } from './env';
import { audit } from './audit';

/**
 * Taking money, or pretending to, behind one interface.
 *
 * The rules the adapter exists to enforce:
 *
 *  - The amount is read from the booking row in this process. The browser sends
 *    a booking id and a method; it never sends a total, and if it did, it would
 *    be ignored.
 *  - Creating an intent is idempotent. A double-clicked submit reaches the same
 *    payment row, not two.
 *  - A return URL proves nothing. Only a signed webhook moves a payment to
 *    `paid`, and the same webhook path runs in demo mode so it is exercised
 *    rather than discovered broken on the first live event.
 *
 * `demo` is the built-in fake. `stripe` and `paypal` are named so the shape is
 * visible, and they throw: an integration that is not configured must fail, not
 * silently succeed.
 */

export type PaymentMethod = (typeof schema.paymentMethod.enumValues)[number];

export class PaymentError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'PaymentError';
  }
}

export type Intent = {
  paymentId: string;
  provider: string;
  providerRef: string;
  status: (typeof schema.paymentStatus.enumValues)[number];
  amountCents: number;
  /** Where the customer would be sent. In demo mode this is our own page. */
  redirectUrl: string | null;
  isDemo: boolean;
};

type Adapter = {
  name: string;
  createIntent(input: { amountCents: number; reference: string; method: PaymentMethod }): Promise<{
    providerRef: string;
    redirectUrl: string | null;
  }>;
};

const demoAdapter: Adapter = {
  name: 'demo',
  async createIntent({ reference }) {
    // No network call, no sandbox account, nothing that can charge anybody.
    return { providerRef: `demo_${reference}_${randomToken(8)}`, redirectUrl: null };
  },
};

const unconfigured = (name: string): Adapter => ({
  name,
  async createIntent() {
    throw new PaymentError('provider_not_configured', `Payment provider "${name}" has no credentials configured.`);
  },
});

function adapter(): Adapter {
  if (env.demoMode || env.payments.provider === 'demo') return demoAdapter;
  if (env.payments.provider === 'stripe') return unconfigured('stripe');
  if (env.payments.provider === 'paypal') return unconfigured('paypal');
  return unconfigured(env.payments.provider);
}

/**
 * Creates or returns the payment for a booking.
 *
 * `idempotencyKey` is a unique column, so the second of two racing submits
 * collides on insert and reads the winner's row back instead of creating a
 * parallel charge. The key is derived from the booking and method, which is
 * what makes a plain double-click safe without the client having to invent one.
 */
export async function createPaymentIntent(input: {
  bookingId: string;
  method: PaymentMethod;
  now?: Date;
}): Promise<Intent> {
  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, input.bookingId)).limit(1);
  if (!booking) throw new PaymentError('unknown_booking');

  /*
   * The amount comes from the booking, which was itself totalled from the
   * service records. A price-on-request booking has no total and therefore
   * cannot be paid online — it must not become a 0,00 € charge.
   */
  if (booking.totalCents === null) throw new PaymentError('price_on_request');
  const amountCents = Math.max(0, booking.totalCents - booking.discountCents);

  if (input.method === 'on_site') {
    // Still a payment row: the studio needs to see that money is outstanding,
    // and reconciliation needs something to close when it is handed over.
    return upsert({
      bookingId: booking.id,
      provider: 'on_site',
      providerRef: `onsite_${booking.reference}`,
      method: 'on_site',
      amountCents,
      redirectUrl: null,
      idempotencyKey: `booking:${booking.id}:on_site`,
    });
  }

  const impl = adapter();
  const key = `booking:${booking.id}:${input.method}`;

  const existing = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.idempotencyKey, key))
    .limit(1);
  if (existing.length > 0) {
    const row = existing[0];
    return {
      paymentId: row.id,
      provider: row.provider,
      providerRef: row.providerRef ?? '',
      status: row.status,
      amountCents: row.amountCents,
      redirectUrl: null,
      isDemo: row.isDemo,
    };
  }

  const created = await impl.createIntent({ amountCents, reference: booking.reference, method: input.method });
  return upsert({
    bookingId: booking.id,
    provider: impl.name,
    providerRef: created.providerRef,
    method: input.method,
    amountCents,
    redirectUrl: created.redirectUrl,
    idempotencyKey: key,
  });
}

async function upsert(input: {
  bookingId: string;
  provider: string;
  providerRef: string;
  method: PaymentMethod;
  amountCents: number;
  redirectUrl: string | null;
  idempotencyKey: string;
}): Promise<Intent> {
  const [row] = await db
    .insert(schema.payment)
    .values({
      bookingId: input.bookingId,
      provider: input.provider,
      providerRef: input.providerRef,
      idempotencyKey: input.idempotencyKey,
      method: input.method,
      amountCents: input.amountCents,
      isDemo: env.demoMode,
    })
    // The second of two racing inserts lands here and reads the winner back.
    .onConflictDoUpdate({
      target: schema.payment.idempotencyKey,
      set: { updatedAt: new Date() },
    })
    .returning();

  return {
    paymentId: row.id,
    provider: row.provider,
    providerRef: row.providerRef ?? '',
    status: row.status,
    amountCents: row.amountCents,
    redirectUrl: input.redirectUrl,
    isDemo: row.isDemo,
  };
}

/* ---------------------------------------------------------------- webhook */

export type WebhookOutcome =
  | { applied: true; paymentId: string; status: string }
  | { applied: false; reason: 'duplicate' | 'late' | 'unknown_payment' | 'unhandled_type' };

/**
 * Applies a provider event.
 *
 * Three things can go wrong with webhooks and all three are handled here rather
 * than hoped about:
 *
 *  - The same event arrives twice. `payment_event` has a unique index on
 *    (provider, event id); the duplicate is recorded and ignored.
 *  - Events arrive out of order. Each event carries the provider's own
 *    timestamp; an event older than the one that last changed the payment is
 *    stored and ignored rather than rolling `paid` back to `pending`.
 *  - An event arrives after the hold expired. The payment is still recorded as
 *    paid — the money is real — and the booking is flagged for a human, because
 *    silently creating a second appointment on a slot somebody else now has
 *    would be worse than an email to the studio.
 */
export async function applyWebhook(input: {
  rawBody: string;
  signature: string;
  now?: Date;
}): Promise<WebhookOutcome> {
  if (!verifySignature(input.rawBody, input.signature, env.payments.webhookSecret)) {
    throw new PaymentError('bad_signature');
  }

  const event = JSON.parse(input.rawBody) as {
    id: string;
    type: string;
    provider?: string;
    occurredAt: string;
    data: { providerRef: string; amountCents?: number };
  };
  const provider = event.provider ?? (env.demoMode ? 'demo' : env.payments.provider);
  const occurredAt = new Date(event.occurredAt);
  const now = input.now ?? new Date();

  const [payment] = await db
    .select()
    .from(schema.payment)
    .where(and(eq(schema.payment.provider, provider), eq(schema.payment.providerRef, event.data.providerRef)))
    .limit(1);

  // Record first, decide second: even an event we will not apply is evidence.
  const inserted = await db
    .insert(schema.paymentEvent)
    .values({
      paymentId: payment?.id ?? null,
      provider,
      providerEventId: event.id,
      type: event.type,
      occurredAt,
      payload: event as unknown as object,
    })
    .onConflictDoNothing({ target: [schema.paymentEvent.provider, schema.paymentEvent.providerEventId] })
    .returning();

  if (inserted.length === 0) return { applied: false, reason: 'duplicate' };
  const eventRow = inserted[0];

  type IgnoreReason = Extract<WebhookOutcome, { applied: false }>['reason'];
  const ignore = async (reason: IgnoreReason) => {
    await db
      .update(schema.paymentEvent)
      .set({ ignoredReason: reason })
      .where(eq(schema.paymentEvent.id, eventRow.id));
    return { applied: false as const, reason };
  };

  if (!payment) return ignore('unknown_payment');

  // The provider's clock decides ordering, not ours.
  if (occurredAt < payment.updatedAt && payment.status !== 'pending') return ignore('late');

  const nextStatus =
    event.type === 'payment.paid' ? 'paid'
    : event.type === 'payment.failed' ? 'failed'
    : event.type === 'payment.refunded' ? 'refunded'
    : null;
  if (!nextStatus) return ignore('unhandled_type');

  await db.transaction(async (tx) => {
    await tx
      .update(schema.payment)
      .set({
        status: nextStatus,
        refundedCents: nextStatus === 'refunded' ? payment.amountCents : payment.refundedCents,
        updatedAt: occurredAt,
      })
      .where(eq(schema.payment.id, payment.id));

    await tx
      .update(schema.paymentEvent)
      .set({ appliedAt: now })
      .where(eq(schema.paymentEvent.id, eventRow.id));
  });

  await audit({
    actorType: 'system',
    actorLabel: `${provider} webhook`,
    action: `payment.${nextStatus}`,
    entity: 'payment',
    entityId: payment.id,
    before: { status: payment.status },
    after: { status: nextStatus, amountCents: payment.amountCents },
  });

  return { applied: true, paymentId: payment.id, status: nextStatus };
}

/**
 * Builds a signed event body the way a provider would.
 *
 * Used by the demo checkout to complete a payment, and by the tests to replay
 * duplicates and late deliveries. It lives here so there is exactly one
 * definition of what a valid event looks like.
 */
export function signEvent(event: {
  id: string;
  type: string;
  provider?: string;
  occurredAt: string;
  data: { providerRef: string; amountCents?: number };
}): { body: string; signature: string } {
  const body = JSON.stringify(event);
  return { body, signature: signPayload(body, env.payments.webhookSecret) };
}

/**
 * Payments whose money arrived but whose booking never confirmed.
 *
 * Nothing is fixed automatically: a paid slot that is no longer free is a
 * decision — refund, move, or squeeze in — and that belongs to the studio. The
 * job's work is to make sure such a case is never invisible.
 */
export async function reconcile(now = new Date()) {
  const orphans = await db
    .select({
      paymentId: schema.payment.id,
      bookingId: schema.booking.id,
      reference: schema.booking.reference,
      status: schema.booking.status,
      amountCents: schema.payment.amountCents,
    })
    .from(schema.payment)
    .innerJoin(schema.booking, eq(schema.booking.id, schema.payment.bookingId))
    .where(and(eq(schema.payment.status, 'paid'), eq(schema.booking.status, 'draft')));

  for (const orphan of orphans) {
    await audit({
      actorType: 'system',
      actorLabel: 'reconciliation',
      action: 'payment.orphaned',
      entity: 'payment',
      entityId: orphan.paymentId,
      after: {
        bookingReference: orphan.reference,
        bookingStatus: orphan.status,
        amountCents: orphan.amountCents,
        note: 'Payment settled after the hold expired. Needs a human decision.',
      },
    });
  }

  return { orphaned: orphans.length, checkedAt: now.toISOString() };
}
