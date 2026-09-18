import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advise } from '@/lib/stylist';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { LOCALES } from '@/lib/i18n';
import { fallbackSrc, hasPhoto } from '@/lib/media';

/**
 * POST /api/stylist — ask for look suggestions.
 *
 * The rate limit is the budget control: with a model behind it, an unlimited
 * endpoint is an unlimited invoice. Twelve a minute is generous for a person
 * and useless for a script.
 *
 * The response is assembled from the database rows the recommender returned,
 * not from anything the model produced: the name, the image and the service
 * link are ours. What the model contributes is a sentence and an ordering.
 */
const Body = z.object({
  message: z.string().min(1).max(500),
  locale: z.enum(LOCALES).default('de'),
});

export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'stylist'), 12, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const reply = await advise({ message: parsed.data.message, locale: parsed.data.locale });
  const de = parsed.data.locale === 'de';

  return NextResponse.json({
    message: reply.message,
    offline: reply.offline,
    referral: reply.referral,
    recommendations: reply.recommendations
      .filter((item) => hasPhoto(item.mediaSlug))
      .map((item) => ({
        lookSlug: item.lookSlug,
        name: de ? item.nameDe : item.nameEn,
        reason: de ? item.reasonDe : item.reasonEn,
        mediaSrc: fallbackSrc(item.mediaSlug as Parameters<typeof fallbackSrc>[0]),
        serviceSlug: item.suggestedServiceSlug,
      })),
  });
}
