import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { hasPhoto, type PhotoId } from '@/lib/media';
import { Photo } from '@/components/image';
import { BookingDock } from '@/components/booking-dock';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, Sparkle } from '@/components/icons';

/**
 * The start page.
 *
 * The banner is the page: one photograph edge to edge, with everything else
 * sitting on it — the headline at the left, the lookbook rail at the right, the
 * booking bar floating at the foot. There is no cream panel behind anything,
 * which is what the reference asks for and what makes the gold read as gold.
 *
 * The photograph is never tinted. What the text sits on is a gradient scrim
 * anchored to the left and the bottom edges, so the middle and right of the
 * picture — the part somebody is actually looking at — arrive untouched.
 */
export async function HomePage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);

  const services = await db
    .select({ slug: schema.service.slug, nameDe: schema.service.nameDe, nameEn: schema.service.nameEn })
    .from(schema.service)
    .where(eq(schema.service.published, true))
    .orderBy(asc(schema.service.sortOrder));

  const staff = await db
    .select({ slug: schema.staff.slug, displayName: schema.staff.displayName })
    .from(schema.staff)
    .where(eq(schema.staff.active, true))
    .orderBy(asc(schema.staff.sortOrder));

  /*
   * The lookbook rail. Three at a time with a counter and arrows, as the
   * reference shows; the page number lives in the URL so the arrows are plain
   * links that work before hydration and the whole page stays a server
   * component.
   */
  const lookbook = await db
    .select()
    .from(schema.look)
    .where(eq(schema.look.published, true))
    .orderBy(asc(schema.look.sortOrder));

  const PER_PAGE = 3;
  const pages = Math.max(1, Math.ceil(lookbook.length / PER_PAGE));
  const requested = Number(typeof query.edit === 'string' ? query.edit : '1');
  const page = Number.isFinite(requested) ? Math.min(pages, Math.max(1, Math.trunc(requested))) : 1;
  const edit = lookbook.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Wrapping rather than stopping: with two pages, "next" from the last is the
  // first, which is what a three-item carousel should do.
  const pageHref = (target: number) => {
    const wrapped = ((target - 1 + pages) % pages) + 1;
    return `${path(locale, 'start')}${wrapped === 1 ? '' : `?edit=${wrapped}`}`;
  };

  return (
    <div className="banner">
      {/* ------------------------------------------------- the photograph */}
      <div className="banner-stage" aria-hidden="true">
        {/* The banner is cut to this picture's shape, so in the ordinary case
            the focal point never comes into play and the frame arrives whole. */}
        <Photo
          id="hero-banner"
          alt=""
          sizes="100vw"
          priority
          focalPoint="50% 50%"
          className="desktop-only"
        />
        {/*
          The same photograph on a phone, cropped to the model rather than to
          the middle of the room: a 16:9 frame cut to portrait on its centre
          point keeps the plant wall and loses the person the picture is of.
        */}
        <Photo id="hero-banner" alt="" sizes="100vw" priority focalPoint="17% 44%" className="mobile-only" />
        <span className="banner-scrim" />
      </div>

      {/* The photograph is decorative above; this carries its description for
          anybody who cannot see it. */}
      <p className="sr-only">{copy.home.heroAlt}</p>

      <div className="banner-grid">
        {/* ------------------------------------------------------- the word */}
        <section className="banner-copy">
          <span className="banner-eyebrow">{copy.home.eyebrow}</span>

          <h1 className="banner-title">
            {copy.home.titleLead}
            <span className="banner-title-accent">{copy.home.titleAccent}</span>
          </h1>

          <p className="banner-intro">{copy.home.bannerIntro}</p>

          <Link className="btn btn--cream banner-cta" href={path(locale, 'studio')}>
            {copy.home.discoverStudio}
            <ArrowRight size={18} />
          </Link>

          <span className="banner-motto" aria-hidden="true">
            {copy.brand.motto.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </span>
        </section>

        {/* ------------------------------------------------- the lookbook */}
        <section className="banner-rail" aria-label={copy.home.editTitle}>
          <div className="banner-rail-head">
            <h2 className="sr-only">{copy.home.editTitle}</h2>
            {pages > 1 ? (
              <div className="row row--tight" style={{ flexWrap: 'nowrap' }}>
                <span className="tiny" aria-live="polite">
                  {String(page).padStart(2, '0')} / {String(pages).padStart(2, '0')}
                </span>
                <Link
                  className="round-arrow round-arrow--sm round-arrow--onHero"
                  href={pageHref(page - 1)}
                  aria-label={copy.booking.back}
                  scroll={false}
                >
                  <ChevronLeft size={18} />
                </Link>
                <Link
                  className="round-arrow round-arrow--sm round-arrow--onHero"
                  href={pageHref(page + 1)}
                  aria-label={copy.booking.next}
                  scroll={false}
                >
                  <ChevronRight size={18} />
                </Link>
              </div>
            ) : null}
          </div>

          <ul className="banner-rail-list">
            {edit.map((look) => (
              <li key={look.id}>
                <Link className="rail-card" href={`${path(locale, 'looks')}?look=${look.slug}`}>
                  <span className="rail-card-body">
                    <span className="rail-card-title">{locale === 'de' ? look.nameDe : look.nameEn}</span>
                    {/* Folded away until the card is pointed at or tabbed to.
                        The name alone is enough to choose by, and three open
                        cards fill the whole side of the picture. */}
                    <span className="rail-card-reveal">
                      <span className="rail-card-teaser">{locale === 'de' ? look.teaserDe : look.teaserEn}</span>
                      <span className="round-arrow round-arrow--sm round-arrow--onHero" aria-hidden="true">
                        <ArrowRight size={18} />
                      </span>
                    </span>
                  </span>
                  <span className="rail-card-media media">
                    {hasPhoto(look.mediaSlug) ? (
                      <Photo
                        id={look.mediaSlug as PhotoId}
                        alt=""
                        sizes="(max-width: 1099px) 60vw, 240px"
                        focalPoint="60% 50%"
                      />
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="banner-rail-foot">
            <Link className="rail-teaser" href={path(locale, 'stylist')}>
              <Sparkle size={20} />
              <span className="grow">
                <span className="rail-teaser-title">{copy.nav.stylist}</span>
                <span className="rail-teaser-sub">{copy.home.stylistTeaser}</span>
              </span>
              <ArrowRight size={18} />
            </Link>
            <Link className="rail-teaser" href={`${path(locale, 'looks')}?favorites=1`}>
              <Heart size={20} />
              <span className="grow">
                <span className="rail-teaser-title">{copy.nav.favorites}</span>
                <span className="rail-teaser-sub">{copy.home.favoritesTeaser}</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        {/* ----------------------------------------------------- the dock */}
        <div className="banner-dock desktop-only">
          <BookingDock
            locale={locale}
            onHero
            services={services.map((s) => ({ slug: s.slug, name: locale === 'de' ? s.nameDe : s.nameEn }))}
            staff={staff.map((s) => ({ slug: s.slug, name: s.displayName }))}
          />
        </div>
        <div className="banner-dock mobile-only">
          <BookingDock
            locale={locale}
            compact
            onHero
            services={services.map((s) => ({ slug: s.slug, name: locale === 'de' ? s.nameDe : s.nameEn }))}
            staff={[]}
          />
        </div>

      </div>

      {/*
        The written line, on the picture rather than beside it.

        `.banner-frame` is the photograph's own rectangle — the banner is wider
        than 16:9, so the picture is fitted into it and does not reach the
        sides. Anything placed in here in per cent lands on the same part of the
        photograph at every window size, which is what lets this sit by the
        flowers on the table next to her and stay there.
      */}
      <div className="banner-frame" aria-hidden="true">
        <span className="banner-script script">
          {copy.brand.script}
          <Heart size={18} />
        </span>
      </div>
    </div>
  );
}
