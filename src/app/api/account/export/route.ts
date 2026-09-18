import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { currentCustomer } from '@/lib/auth';

/**
 * GET /api/account/export — everything we hold about the signed-in customer.
 *
 * The right of access, as a file. What comes back is the profile, the bookings
 * with their frozen line items, the favourites and the gift cards, all scoped
 * to the session's customer id.
 *
 * Deliberately absent: session tokens, auth tokens and gift-card codes. Those
 * are credentials, not personal data — handing them back in a downloadable file
 * would turn a privacy feature into a way of harvesting live keys from a
 * borrowed laptop. The card's hint and balance are enough to identify it.
 */
export async function GET() {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const bookings = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.customerId, customer.id))
    .orderBy(desc(schema.booking.startsAt));

  const items = bookings.length
    ? await db.select().from(schema.bookingItem)
    : [];

  const favorites = await db
    .select({ slug: schema.look.slug, savedAt: schema.favorite.createdAt })
    .from(schema.favorite)
    .innerJoin(schema.look, eq(schema.look.id, schema.favorite.lookId))
    .where(eq(schema.favorite.customerId, customer.id));

  const vouchers = await db
    .select({
      codeHint: schema.voucher.codeHint,
      initialCents: schema.voucher.initialCents,
      balanceCents: schema.voucher.balanceCents,
      status: schema.voucher.status,
      expiresAt: schema.voucher.expiresAt,
    })
    .from(schema.voucher)
    .where(eq(schema.voucher.recipientEmail, customer.email));

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      marketingOptIn: customer.marketingOptIn,
      marketingOptInAt: customer.marketingOptInAt,
      createdAt: customer.createdAt,
    },
    bookings: bookings.map((booking) => ({
      reference: booking.reference,
      status: booking.status,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      totalCents: booking.totalCents,
      discountCents: booking.discountCents,
      isDemo: booking.isDemo,
      items: items
        .filter((item) => item.bookingId === booking.id)
        .map((item) => ({
          name: item.nameDe,
          durationMinutes: item.durationMinutes,
          priceCents: item.priceCents,
        })),
    })),
    favorites,
    vouchers,
  };

  return new NextResponse(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="stern-nails-daten.json"',
      // Never cached: it is somebody's personal data on a shared machine.
      'cache-control': 'no-store',
    },
  });
}
