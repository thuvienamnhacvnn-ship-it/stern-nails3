import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { contactReady, settings } from '@/lib/settings';
import type { PhotoId } from '@/lib/media';
import { Photo } from '@/components/image';
import { Motto, Petal } from '@/components/shell';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, Leaf, Mail, MapPin, Phone, Sparkle } from '@/components/icons';

/**
 * The studio, following 06-studio.
 *
 * Two kinds of picture appear here and they are not interchangeable. The
 * studio's own photographs carry no caption; the generated interiors carry
 * "Konzeptvisualisierung" in the corner, because a render of a room that does
 * not exist, shown unlabelled on a real salon's website, is a claim about the
 * premises.
 *
 * The contact block shows what the owner has entered and nothing else. With no
 * address there is no map and no directions link; with no phone number there is
 * no call button. A placeholder would be worse than the gap.
 */

const ROOMS = {
  manikuere: ['real-salon', 'real-manicure'],
  pedikuere: ['real-pedicure', 'pedicure-wide'],
  ambiente: ['hero-salon-wide', 'real-detail'],
} as const;

type Room = keyof typeof ROOMS;

export async function StudioPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const requested = typeof query.raum === 'string' ? query.raum : typeof query.room === 'string' ? query.room : null;
  const room: Room = (Object.keys(ROOMS) as Room[]).includes(requested as Room) ? (requested as Room) : 'manikuere';

  const config = await settings();
  const ready = contactReady(config);

  const media = await db.select().from(schema.mediaAsset);
  const bySlug = new Map(media.map((asset) => [asset.slug, asset]));

  const shown = ROOMS[room];
  const rooms = Object.keys(ROOMS) as Room[];
  const index = rooms.indexOf(room);

  const ICONS = [<Leaf key="l" size={20} />, <Heart key="h" size={20} />, <Sparkle key="s" size={20} />];

  return (
    <div className="studio">
      <Petal position="tl" />
      <Petal position="br" />

      <section className="studio-intro">
        <span className="eyebrow">{copy.studio.eyebrow}</span>
        <h1 className="studio-title">
          Ein Ort zum
          <br />
          Wohlfühlen.
        </h1>
        <hr className="rule" />
        <p className="lede" style={{ maxWidth: '32ch' }}>
          {copy.studio.intro}
        </p>

        <div className="row" style={{ marginTop: 'var(--s2)' }}>
          <Link className="btn btn--primary" href={path(locale, 'booking')}>
            {copy.studio.book}
            <ArrowRight size={18} />
          </Link>
          <a className="btn btn--secondary" href="#kontakt">
            {copy.studio.contact}
            <ArrowRight size={18} />
          </a>
        </div>

        <div style={{ marginTop: 'var(--s4)' }} className="desktop-only">
          <Motto locale={locale} />
        </div>
      </section>

      <section className="studio-gallery">
        <div className="studio-tabs">
          <div className="row row--tight" role="group" aria-label={copy.studio.eyebrow}>
            {rooms.map((item) => (
              <Link
                key={item}
                className="chip chip--sage"
                href={`${path(locale, 'studio')}?raum=${item}`}
                data-active={item === room}
              >
                {copy.studio.rooms[item]}
              </Link>
            ))}
          </div>
          <div className="row row--tight">
            <span className="small muted">
              {String(index + 1).padStart(2, '0')} / {String(rooms.length).padStart(2, '0')}
            </span>
            <Link
              className="round-arrow round-arrow--sm"
              href={`${path(locale, 'studio')}?raum=${rooms[(index - 1 + rooms.length) % rooms.length]}`}
              aria-label={copy.booking.back}
            >
              <ChevronLeft size={18} />
            </Link>
            <Link
              className="round-arrow round-arrow--sm"
              href={`${path(locale, 'studio')}?raum=${rooms[(index + 1) % rooms.length]}`}
              aria-label={copy.booking.next}
            >
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>

        <div className="studio-photos">
          {shown.map((slug, position) => {
            const asset = bySlug.get(slug);
            const concept = asset?.sourceType === 'ai_concept';
            return (
              <figure key={slug} className="media studio-photo" style={{ margin: 0 }}>
                <Photo
                  id={slug as PhotoId}
                  alt={asset ? (locale === 'de' ? asset.altDe : asset.altEn) : ''}
                  sizes="(max-width: 1099px) 100vw, 40vw"
                  priority={position === 0}
                  focalPoint={asset?.focalPoint}
                />
                {concept ? (
                  <figcaption className="media-note">{copy.studio.conceptLabel}</figcaption>
                ) : null}
              </figure>
            );
          })}
        </div>
      </section>

      <section className="studio-facts" id="kontakt">
        {copy.studio.highlights.map((fact, position) => (
          <div key={fact.title} className="studio-fact">
            <span className="studio-fact-icon">{ICONS[position]}</span>
            <h2>{fact.title}</h2>
            <p className="small muted">{fact.body}</p>
          </div>
        ))}

        <div className="stack stack--2" style={{ paddingTop: 'var(--s2)', borderTop: '1px solid var(--hairline)' }}>
          <h2 className="serif" style={{ fontSize: 26 }}>
            {copy.studio.contactTitle}
          </h2>

          {ready.address ? (
            <p className="row row--tight small">
              <MapPin size={18} />
              <span>
                {config?.street}
                <br />
                {config?.postalCode} {config?.city}
              </span>
            </p>
          ) : null}

          {ready.phone ? (
            <p className="row row--tight small">
              <Phone size={18} />
              <a href={`tel:${config!.phone!.replace(/\s/g, '')}`}>{config!.phone}</a>
            </p>
          ) : null}

          {ready.email ? (
            <p className="row row--tight small">
              <Mail size={18} />
              <a href={`mailto:${config!.email}`}>{config!.email}</a>
            </p>
          ) : null}

          {!ready.address && !ready.phone && !ready.email ? (
            <p className="small muted">{copy.studio.contactPending}</p>
          ) : null}

          <p className="script desktop-only" style={{ fontSize: 30, marginTop: 'var(--s2)' }}>
            Schönere Nägel.
            <br />
            Schönerer Alltag.
          </p>
        </div>
      </section>
    </div>
  );
}
