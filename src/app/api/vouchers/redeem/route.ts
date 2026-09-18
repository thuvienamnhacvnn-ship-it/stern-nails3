import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { redeem, VoucherError } from '@/lib/vouchers';
import { callerKey, rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/vouchers/redeem — spend a gift card against a booking.
 *
 * The rate limit here is tighter than elsewhere and exists for one reason: this
 * endpoint answers "is this a real code". Twenty guesses a minute is not a
 * useful brute force against a hundred bits of entropy, and the codes are
 * hashed anyway, but there is no reason to help.
 *
 * How much is taken off is decided by the server from the booking's own total.
 * The request says which booking and which code, and nothing else.
 */
const Body = z.object({
  bookingId: z.string().uuid(),
  code: z.string().min(4).max(40),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'voucher-redeem'), 20, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, parsed.data.bookingId))
    .limit(1);
  if (!booking) return NextResponse.json({ error: 'unknown_booking' }, { status: 404 });
  if (booking.status === 'confirmed' || booking.status === 'cancelled') {
    return NextResponse.json({ error: 'booking_closed' }, { status: 409 });
  }
  if (booking.totalCents === null) return NextResponse.json({ error: 'price_on_request' }, { status: 400 });

  const outstanding = Math.max(0, booking.totalCents - booking.discountCents);
  if (outstanding === 0) return NextResponse.json({ error: 'nothing_outstanding' }, { status: 400 });

  try {
    const result = await redeem({
      code: parsed.data.code,
      amountCents: outstanding,
      bookingId: booking.id,
    });
    return NextResponse.json({
      appliedCents: result.appliedCents,
      remainingBalanceCents: result.balanceCents,
    });
  } catch (error) {
    if (error instanceof VoucherError) {
      const status = error.code === 'unknown_code' ? 404 : 400;
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }
}
