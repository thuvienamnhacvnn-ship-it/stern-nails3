import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { BookingError, confirmBooking, issueManageToken, sendConfirmation } from '@/lib/booking';
import { createPaymentIntent, PaymentError, signEvent, applyWebhook } from '@/lib/payments';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { addMinutes } from '@/lib/time';
import { env } from '@/lib/env';
import { LOCALES } from '@/lib/i18n';

/**
 * POST /api/bookings — confirm a held booking.
 *
 * The order matters and is the opposite of the obvious one. The payment intent
 * is created *before* the booking is confirmed, so that a provider refusal
 * leaves the slot held and the customer able to try again. Confirmation is the
 * last step, and it is the step that re-checks for conflicts inside a
 * transaction — which is what decides a race between two customers.
 *
 * In demo mode the "provider" settles immediately by replaying its own signed
 * webhook through the same handler a real one would use. Nothing here shortcuts
 * to `paid`; the code path that will run in production is the code path that
 * runs now.
 */

const Body = z.object({
  bookingId: z.string().uuid(),
  locale: z.enum(LOCALES),
  method: z.enum(['on_site', 'card', 'paypal']),
  marketingOptIn: z.boolean(),
  contact: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email().max(160),
    phone: z.string().max(40).nullable().optional(),
  }),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'book'), 10, 60);
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
    const [before] = await db
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, input.bookingId))
      .limit(1);
    if (!before) return NextResponse.json({ error: 'unknown_booking' }, { status: 404 });

    // A resubmit of a booking that already went through returns the same
    // answer instead of failing — the customer pressed the button twice, which
    // is not an error.
    if (before.status === 'confirmed') {
      const token = await issueManageToken(before.id, addMinutes(before.endsAt ?? new Date(), 24 * 60));
      return NextResponse.json({ reference: before.reference, manageToken: token, alreadyConfirmed: true });
    }

    const intent = await createPaymentIntent({ bookingId: input.bookingId, method: input.method });

    /*
     * Card and PayPal in demo mode: settle through the real webhook path, with
     * a real signature, so duplicate and out-of-order handling is exercised by
     * every demo booking rather than only by the tests.
     */
    if (env.demoMode && input.method !== 'on_site') {
      const event = signEvent({
        id: `evt_${intent.providerRef}`,
        type: 'payment.paid',
        provider: 'demo',
        occurredAt: new Date().toISOString(),
        data: { providerRef: intent.providerRef, amountCents: intent.amountCents },
      });
      const outcome = await applyWebhook({ rawBody: event.body, signature: event.signature });
      if (!outcome.applied && outcome.reason !== 'duplicate') {
        return NextResponse.json({ error: 'payment_failed' }, { status: 402 });
      }
    }

    const booking = await confirmBooking({
      bookingId: input.bookingId,
      contact: input.contact,
      marketingOptIn: input.marketingOptIn,
      locale: input.locale,
      paymentId: intent.paymentId,
    });

    // The confirmation mail already minted one; this is the token the browser
    // is redirected to, which lets the page work without waiting for an inbox.
    const token = await issueManageToken(booking.id, addMinutes(booking.endsAt ?? new Date(), 24 * 60));

    return NextResponse.json({
      reference: booking.reference,
      manageToken: token,
      paymentMethod: input.method,
      isDemo: intent.isDemo,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      const status = error.code === 'slot_taken' ? 409 : error.code === 'hold_expired' ? 410 : 400;
      return NextResponse.json({ error: error.code }, { status });
    }
    if (error instanceof PaymentError) {
      return NextResponse.json({ error: error.code }, { status: 402 });
    }
    throw error;
  }
}
