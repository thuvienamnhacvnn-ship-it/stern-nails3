import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bookingForManageToken, bookingOwnedBy, cancelBooking, BookingError } from '@/lib/booking';
import { currentCustomer } from '@/lib/auth';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { LOCALES } from '@/lib/i18n';

/**
 * POST /api/bookings/cancel — cancel, either signed in or from an emailed link.
 *
 * Two doors, both locked. A signed-in customer may only cancel a booking whose
 * `customerId` matches their session; anyone else needs the token from their
 * own confirmation email, which is single-purpose, hashed in the database and
 * expires a day after the appointment.
 *
 * What is refused looks identical either way: a booking id belonging to
 * somebody else returns the same 404 as one that does not exist, so the
 * endpoint cannot be used to find out who has an appointment.
 */
const Body = z.object({
  bookingId: z.string().uuid().optional(),
  manageToken: z.string().min(10).max(200).optional(),
  reason: z.string().max(300).optional(),
  locale: z.enum(LOCALES).default('de'),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'cancel'), 20, 60);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const input = parsed.data;

  let bookingId: string | null = null;
  let actor: { type: 'customer'; id?: string; label?: string } = { type: 'customer' };

  if (input.manageToken) {
    const booking = await bookingForManageToken(input.manageToken);
    if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    bookingId = booking.id;
    actor = { type: 'customer', label: booking.contactEmail ?? 'manage link' };
  } else if (input.bookingId) {
    const customer = await currentCustomer();
    if (!customer) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Same answer for "does not exist" and "is not yours".
    const booking = await bookingOwnedBy(customer.id, input.bookingId);
    if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    bookingId = booking.id;
    actor = { type: 'customer', id: customer.id, label: customer.email };
  } else {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const booking = await cancelBooking({
      bookingId,
      reason: input.reason,
      actor,
      locale: input.locale,
    });
    return NextResponse.json({ status: booking.status, reference: booking.reference });
  } catch (error) {
    if (error instanceof BookingError) return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
}
