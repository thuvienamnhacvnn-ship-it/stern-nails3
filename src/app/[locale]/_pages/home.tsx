import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { brand, hasPhoto, type PhotoId } from '@/lib/media';
import { Photo } from '@/components/image';
import { BookingDock } from '@/components/booking-dock';
import { Motto, Petal } from '@/components/shell';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, Sparkle } from '@/components/icons';

/**
 * The start page, following 01-home and 11-mobile-home.
 *
 * Desktop is three columns at roughly 22 / 50 / 28: the introduction and the
 * flower, the wide salon photograph with the booking bar floating over its
 * foot, and the Nail Edit rail. On a phone the same three become one column in
 * the same reading order, the photograph turns portrait, and the bar collapses
 * to service plus date — which is what the mobile screen shows.
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
   * The Nail Edit rail. The design shows three cards and a "01 / 03" counter
   * with arrows, so the rail pages through the whole lookbook three at a time
   * rather than showing a counter that counts nothing. The page number lives in
   * the URL, which keeps the whole page a server component and makes the arrows
   * plain links that work before hydration.
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

  // Wrapping rather than stopping: with two pages, "next" from the last one is
  // the first, which is what a three-item carousel should do.
  const pageHref = (target: number) =>
    `${path(locale, 'start')}${target === 1 ? '' : `?edit=${((target - 1 + pages) % pages) + 1}`}`;
  const previousPage = ((page - 2 + pages) % pages) + 1;
  const nextPage = (page % pages) + 1;

  const flower = brand('flower');

  return (
    <div className="home">
      {/* ------------------------------------------------------ left rail */}
      <section className="home-intro">
        <img className="home-flower" src={flower.src} width={flower.width} height={flower.height} alt="" />

        <h1 className="home-title">
          Dein Stil.
          <br />
          Dein Moment.
        </h1>
        <hr className="rule" />
        <p className="lede home-lede">{copy.home.intro}</p>

        <Link className="btn btn--secondary home-cta" href={path(locale, 'studio')}>
          {copy.home.discoverStudio}
          <ArrowRight size={18} />
        </Link>

        <div className="home-motto desktop-only">
          <Motto locale={locale} />
        </div>
      </section>

      {/* -------------------------------------------------------- centre */}
      <section className="home-hero">
        <div className="media home-hero-media">
          <Photo
            id="hero-salon-wide"
            alt={copy.home.heroAlt}
            sizes="(max-width: 1099px) 100vw, 50vw"
            priority
            focalPoint="55% 45%"
            className="desktop-only"
          />
          {/* Portrait on a phone, as the mobile screen does — a 16:9 salon
              photograph scaled to phone width is a strip nobody can read. */}
          <Photo
            id="studio-portrait"
            alt={copy.home.heroAlt}
            sizes="100vw"
            priority
            className="mobile-only"
          />
          <span className="home-hero-script script" aria-hidden="true">
            {copy.brand.script}
          </span>
        </div>

        <div className="home-dock desktop-only">
          <BookingDock
            locale={locale}
            services={services.map((s) => ({ slug: s.slug, name: locale === 'de' ? s.nameDe : s.nameEn }))}
            staff={staff.map((s) => ({ slug: s.slug, name: s.displayName }))}
          />
        </div>
        <div className="home-dock mobile-only">
          <BookingDock
            locale={locale}
            compact
            services={services.map((s) => ({ slug: s.slug, name: locale === 'de' ? s.nameDe : s.nameEn }))}
            staff={[]}
          />
        </div>
      </section>

      {/* --------------------------------------------------- Nail Edit rail */}
      <section className="home-edit" aria-labelledby="nail-edit">
        <div className="home-edit-head">
          <div>
            <h2 id="nail-edit" className="home-edit-title">
              {copy.home.editTitle}
            </h2>
            <p className="small muted home-edit-sub">
              {copy.home.editSubtitle}
              <br className="desktop-only" />
              <span className="desktop-only">{copy.home.editSubtitleTwo}</span>
            </p>
          </div>
          <Link className="btn btn--text mobile-only" href={path(locale, 'looks')}>
            {copy.home.allLooks}
            <ArrowRight size={18} />
          </Link>

          {pages > 1 ? (
            <div className="row row--tight desktop-only" style={{ flexWrap: 'nowrap' }}>
              <span className="tiny muted" aria-live="polite">
                {String(page).padStart(2, '0')} / {String(pages).padStart(2, '0')}
              </span>
              <Link
                className="round-arrow round-arrow--sm"
                href={pageHref(previousPage)}
                aria-label={copy.booking.back}
                scroll={false}
              >
                <ChevronLeft size={18} />
              </Link>
              <Link
                className="round-arrow round-arrow--sm"
                href={pageHref(nextPage)}
                aria-label={copy.booking.next}
                scroll={false}
              >
                <ChevronRight size={18} />
              </Link>
            </div>
          ) : null}
        </div>

        <ul className="home-edit-list">
          {edit.map((look) => (
            <li key={look.id}>
              <Link className="edit-card" href={`${path(locale, 'looks')}?look=${look.slug}`}>
                <div className="edit-card-body">
                  <h3 className="edit-card-title">{locale === 'de' ? look.nameDe : look.nameEn}</h3>
                  <p className="tiny muted">{locale === 'de' ? look.teaserDe : look.teaserEn}</p>
                  <span className="round-arrow round-arrow--sm" aria-hidden="true">
                    <ArrowRight size={18} />
                  </span>
                </div>
                <div className="edit-card-media media">
                  {hasPhoto(look.mediaSlug) ? (
                    <Photo
                      id={look.mediaSlug as PhotoId}
                      alt=""
                      sizes="(max-width: 1099px) 60vw, 240px"
                      focalPoint="60% 50%"
                    />
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="home-edit-foot desktop-only">
          <Link className="edit-teaser" href={path(locale, 'stylist')}>
            <Sparkle size={22} />
            <span className="grow">
              <span className="strong small">{copy.nav.stylist}</span>
              <span className="tiny muted" style={{ display: 'block' }}>
                {copy.home.stylistTeaser}
              </span>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link className="edit-teaser" href={`${path(locale, 'looks')}?favorites=1`}>
            <Heart size={22} />
            <span className="grow">
              <span className="strong small">{copy.nav.favorites}</span>
              <span className="tiny muted" style={{ display: 'block' }}>
                {copy.home.favoritesTeaser}
              </span>
            </span>
            <ArrowRight size={18} />
          </Link>
        </div>

        <Link className="edit-teaser mobile-only" href={path(locale, 'stylist')}>
          <Sparkle size={22} />
          <span className="grow">
            <span className="strong small">{copy.nav.stylist}</span>
            <span className="tiny muted" style={{ display: 'block' }}>
              {copy.home.stylistTeaser}
            </span>
          </span>
          <ArrowRight size={18} />
        </Link>
      </section>

      <Petal position="bl" />
    </div>
  );
}
