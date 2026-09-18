import { NextResponse } from 'next/server';
import { z } from 'zod';
import { availability } from '@/lib/availability';
import { priceSelection, BookingError } from '@/lib/booking';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { LOCALES } from '@/lib/i18n';

/**
 * GET /api/availability — free times for one day.
 *
 * Read-only and cheap, but still rate limited: it is the endpoint somebody
 * would use to scrape the studio's calendar, and it is trivially loopable over
 * ninety days.
 *
 * The response carries no staff identity. Which member of staff would take a
 * slot is decided when the hold is made; publishing "Team B is free all
 * Tuesday" on an open endpoint says more about the studio's week than it needs
 * to.
 */
export async function GET(request: Request) {
  const limit = rateLimit(callerKey(request, 'availability'), 120, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const url = new URL(request.url);
  const query = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      service: z.string().min(1).max(80),
      variant: z.string().min(1).max(80).nullable().optional(),
      staff: z.string().uuid().nullable().optional(),
    })
    .safeParse({
      date: url.searchParams.get('date'),
      service: url.searchParams.get('service'),
      variant: url.searchParams.get('variant'),
      staff: url.searchParams.get('staff'),
    });

  if (!query.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  try {
    const priced = await priceSelection({
      serviceSlug: query.data.service,
      variantSlug: query.data.variant ?? null,
      addOnSlugs: url.searchParams.getAll('extra').slice(0, 8),
    });

    const result = await availability({
      date: query.data.date,
      timing: {
        serviceId: priced.serviceId,
        durationMinutes: priced.durationMinutes,
        resourceIds: priced.resourceIds,
      },
      staffId: query.data.staff ?? null,
    });

    return NextResponse.json({
      date: result.date,
      nextAvailableDate: result.nextAvailableDate,
      slots: result.slots.map((slot) => ({ startsAt: slot.startsAt, label: slot.label })),
      durationMinutes: priced.durationMinutes,
      totalCents: priced.totalCents,
    });
  } catch (error) {
    if (error instanceof BookingError) return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
}
