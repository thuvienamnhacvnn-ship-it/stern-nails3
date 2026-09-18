import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestLoginLink } from '@/lib/auth';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { LOCALES } from '@/lib/i18n';

/**
 * POST /api/account/sign-in — ask for a sign-in link.
 *
 * Always 200, always the same body shape, whether or not the address is known.
 * The only thing the caller learns is that the request was accepted.
 *
 * Rate limited per address rather than per email, because limiting per email
 * would let somebody lock a specific person out of their own account by
 * requesting links for them.
 */
const Body = z.object({
  email: z.string().email().max(160),
  locale: z.enum(LOCALES).default('de'),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'sign-in'), 6, 300);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const { demoLink } = await requestLoginLink(parsed.data.email, parsed.data.locale);
  return NextResponse.json({ sent: true, demoLink });
}
