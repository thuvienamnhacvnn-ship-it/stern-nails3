import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { bookingForManageToken } from '@/lib/booking';
import { buildIcs } from '@/lib/time';
import { settings } from '@/lib/settings';

/**
 * GET /api/bookings/ics/<token> — the calendar file for one appointment.
 *
 * Generated per request rather than stored, so a rescheduled appointment hands
 * out the new time rather than the one that was mailed out originally. The
 * token is the same single-booking one the confirmation page uses.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await bookingForManageToken(token);
  if (!booking || !booking.startsAt || !booking.endsAt) {
    return new Response('Not found', { status: 404 });
  }

  const [service] = await db
    .select()
    .from(schema.bookingItem)
    .where(eq(schema.bookingItem.bookingId, booking.id))
    .limit(1);
  const config = await settings();

  const location = [config?.street, [config?.postalCode, config?.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  const ics = buildIcs({
    uid: `${booking.reference}@stern-nails`,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    summary: `${service?.nameDe ?? 'Termin'} – Stern Nails 3`,
    description: `Buchungsnummer ${booking.reference}`,
    location: location || null,
    organizerEmail: config?.email ?? null,
    createdAt: booking.createdAt,
  });

  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="stern-nails-${booking.reference}.ics"`,
      'cache-control': 'no-store',
    },
  });
}
