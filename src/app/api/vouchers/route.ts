import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { createVoucherOrder, issueVoucher, VoucherError } from '@/lib/vouchers';
import { applyWebhook, createPaymentIntent, signEvent } from '@/lib/payments';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { LOCALES } from '@/lib/i18n';
import { randomToken } from '@/lib/crypto';

/**
 * POST /api/vouchers — buy a gift card.
 *
 * The amount in the request is checked against the approved list before
 * anything is written; the balance is taken from that list, never from the
 * body. So a hand-edited request for a 1 € card with a 500 € balance creates
 * nothing.
 *
 * No code is minted here. This creates an order in `pending_payment` and a
 * payment to go with it; the code appears when the payment settles, through the
 * webhook — which in demo mode is replayed immediately below, along the same
 * path a real provider would take.
 */

const Body = z.object({
  amountCents: z.number().int().positive().max(100000),
  recipientName: z.string().max(120).optional(),
  recipientEmail: z.string().email().max(160),
  purchaserEmail: z.string().email().max(160).optional(),
  message: z.string().max(300).optional(),
  locale: z.enum(LOCALES).default('de'),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'voucher'), 8, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const input = parsed.data;

  try {
    const voucher = await createVoucherOrder({
      amountCents: input.amountCents,
      recipientName: input.recipientName ?? null,
      recipientEmail: input.recipientEmail,
      purchaserEmail: input.purchaserEmail ?? null,
      message: input.message ?? null,
    });

    // A gift card has no booking, so the payment row is attached to the voucher
    // and the idempotency key is built from its id.
    const providerRef = `demo_voucher_${voucher.id}_${randomToken(6)}`;
    const [payment] = await db
      .insert(schema.payment)
      .values({
        voucherId: voucher.id,
        provider: env.demoMode ? 'demo' : env.payments.provider,
        providerRef,
        idempotencyKey: `voucher:${voucher.id}`,
        method: 'card',
        amountCents: voucher.initialCents,
        isDemo: env.demoMode,
      })
      .onConflictDoUpdate({ target: schema.payment.idempotencyKey, set: { updatedAt: new Date() } })
      .returning();

    if (env.demoMode) {
      const event = signEvent({
        id: `evt_${payment.id}`,
        type: 'payment.paid',
        provider: 'demo',
        occurredAt: new Date().toISOString(),
        data: { providerRef, amountCents: voucher.initialCents },
      });
      await applyWebhook({ rawBody: event.body, signature: event.signature });
      await issueVoucher(voucher.id, input.locale);
    }

    // The code is never in this response. It goes to the recipient by email,
    // and nothing else ever sees it again.
    return NextResponse.json({
      voucherId: voucher.id,
      amountCents: voucher.initialCents,
      status: env.demoMode ? 'issued' : 'pending_payment',
      isDemo: env.demoMode,
    });
  } catch (error) {
    if (error instanceof VoucherError) return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
}
