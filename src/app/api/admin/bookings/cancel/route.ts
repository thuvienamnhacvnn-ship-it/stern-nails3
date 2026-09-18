import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { cancelBooking, BookingError } from '@/lib/booking';
import { requireStaff } from '@/lib/auth';

/**
 * POST /api/admin/bookings/cancel — cancel from the studio side.
 *
 * `booking.update` rather than a blanket admin check: a member of staff may
 * cancel, a manager may cancel, and the capability table is the single place
 * that decides. On top of that, a plain `staff` may only touch a booking
 * assigned to them — the calendar hides other people's columns, and this is the
 * server side of the same rule.
 */
export async function POST(request: Request) {
  const auth = await requireStaff('booking.update');
  const origin = new URL(request.url).origin;
  if (!auth.ok) {
    return NextResponse.redirect(new URL('/admin/login', origin), { status: 303 });
  }

  const form = await request.formData();
  const bookingId = String(form.get('bookingId') ?? '');
  const date = String(form.get('date') ?? '');
  if (!bookingId) return NextResponse.redirect(new URL('/admin/calendar', origin), { status: 303 });

  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId)).limit(1);
  if (!booking) return NextResponse.redirect(new URL('/admin/calendar', origin), { status: 303 });

  if (auth.staff.role === 'staff' && booking.staffId !== auth.staff.id) {
    return NextResponse.redirect(new URL('/admin/calendar?error=forbidden', origin), { status: 303 });
  }

  try {
    await cancelBooking({
      bookingId,
      reason: 'Vom Studio storniert',
      actor: { type: 'staff', id: auth.staff.id, label: auth.staff.displayName },
      locale: 'de',
    });
  } catch (error) {
    if (!(error instanceof BookingError)) throw error;
  }

  return NextResponse.redirect(new URL(`/admin/calendar${date ? `?date=${date}` : ''}`, origin), { status: 303 });
}
