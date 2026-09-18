import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { applyWebhook, PaymentError } from '@/lib/payments';
import { issueVoucher } from '@/lib/vouchers';

/**
 * POST /api/payments/webhook — the only thing that marks money as received.
 *
 * The raw body is read as text, not JSON, because the signature is over the
 * exact bytes the provider sent. Parsing first and re-serialising would change
 * key order or whitespace and break verification on the first event that has
 * either.
 *
 * The handler always answers 200 once the event has been recorded, including
 * for events it decides to ignore. A provider that receives an error retries,
 * and retrying a duplicate we have already stored achieves nothing but noise.
 * Only a bad signature is refused, and that one is a 400 on purpose.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get('x-signature') ??
    request.headers.get('stripe-signature') ??
    request.headers.get('paypal-transmission-sig') ??
    '';

  try {
    const outcome = await applyWebhook({ rawBody, signature });

    // A settled gift-card payment is what mints the code. Doing it here rather
    // than in the buy request is the entire reason a code cannot exist for an
    // order nobody paid for.
    if (outcome.applied && outcome.status === 'paid') {
      const [payment] = await db
        .select()
        .from(schema.payment)
        .where(eq(schema.payment.id, outcome.paymentId))
        .limit(1);
      if (payment?.voucherId) await issueVoucher(payment.voucherId);
    }

    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof PaymentError && error.code === 'bad_signature') {
      return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
    }
    // Anything else is ours, and the provider should retry.
    throw error;
  }
}
