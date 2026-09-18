import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { BookingError, holdSlot } from '@/lib/booking';
import { callerKey, rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/booking-holds — reserve a slot while the customer checks out.
 *
 * Everything arriving here is validated by schema before it reaches the
 * database, and the only fields that are read are slugs and an instant. There
 * is no price in the request and no way to put one there: the server totals the
 * booking from the service records it looks up itself.
 *
 * Rate limited per address, because a hold is a write that takes a real slot
 * out of circulation — an unlimited version of this endpoint would empty the
 * studio's calendar in a loop.
 */

const Body = z.object({
  serviceSlug: z.string().min(1).max(80),
  variantSlug: z.string().min(1).max(80).nullable().optional(),
  addOnSlugs: z.array(z.string().min(1).max(80)).max(8).optional(),
  lookSlug: z.string().min(1).max(80).nullable().optional(),
  staffSlug: z.string().min(1).max(80).nullable().optional(),
  startsAt: z.string().datetime(),
  /** Passed when re-holding after stepping back to change the time. */
  bookingId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'hold'), 20, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const input = parsed.data;
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  // The browser sends a slug; the id it maps to is looked up here rather than
  // accepted from the request.
  let staffId: string | null = null;
  if (input.staffSlug) {
    const [member] = await db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(eq(schema.staff.slug, input.staffSlug))
      .limit(1);
    if (!member) return NextResponse.json({ error: 'unknown_staff' }, { status: 400 });
    staffId = member.id;
  }

  try {
    const hold = await holdSlot({
      selection: {
        serviceSlug: input.serviceSlug,
        variantSlug: input.variantSlug ?? null,
        addOnSlugs: input.addOnSlugs ?? [],
        lookSlug: input.lookSlug ?? null,
      },
      startsAt,
      staffId,
      bookingId: input.bookingId ?? null,
    });

    return NextResponse.json({
      bookingId: hold.bookingId,
      reference: hold.reference,
      expiresAt: hold.expiresAt.toISOString(),
      totalCents: hold.totalCents,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      // `slot_taken` is the ordinary outcome of two people wanting the same
      // time, not a server fault — 409 so the client can say so plainly.
      const status = error.code === 'slot_taken' ? 409 : 400;
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }
}
