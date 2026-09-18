import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { type Locale } from '@/lib/i18n';
import { env } from '@/lib/env';
import { fallbackSrc, hasPhoto, type PhotoId } from '@/lib/media';
import { Petal } from '@/components/shell';
import { StylistWorkspace } from '@/components/stylist-workspace';

/**
 * The stylist, following 09-ai-stylist.
 *
 * The page is a shell; the conversation is a client component because it is a
 * conversation. What matters here is what is *not* on it: no availability, no
 * price quoted by a model, and no button that books anything. "Termin
 * vorbereiten" fills in a draft and hands it back to the customer to check.
 *
 * The results rail starts with the three headline collections rather than an
 * empty box. They are the same rows the recommender would return and they carry
 * the same "from our lookbook" label — so the page is useful before anybody has
 * typed anything, and nothing on it is an AI claim.
 */
export async function StylistPage({ locale }: { locale: Locale }) {
  const looks = await db
    .select()
    .from(schema.look)
    .where(eq(schema.look.published, true))
    .orderBy(asc(schema.look.sortOrder))
    .limit(3);

  const de = locale === 'de';

  return (
    <div className="stylist">
      <Petal position="tl" />
      <Petal position="br" />
      <StylistWorkspace
        locale={locale}
        aiConfigured={env.ai.provider !== 'rules' && env.ai.apiKey !== ''}
        initialResults={looks
          .filter((look) => hasPhoto(look.mediaSlug))
          .map((look) => ({
            lookSlug: look.slug,
            name: de ? look.nameDe : look.nameEn,
            reason: de ? look.descriptionDe : look.descriptionEn,
            mediaSrc: fallbackSrc(look.mediaSlug as PhotoId),
            serviceSlug: look.suggestedServiceSlug,
          }))}
      />
    </div>
  );
}
