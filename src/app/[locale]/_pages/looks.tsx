import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { hasPhoto, type PhotoId } from '@/lib/media';
import { Photo } from '@/components/image';
import { Petal } from '@/components/shell';
import { ArrowRight, NailShape, Palette, Ruler } from '@/components/icons';
import { FavoriteButton, FavoritesSync } from '@/components/favorites';
import { LookSearch } from '@/components/look-search';
import { currentCustomer } from '@/lib/auth';

/**
 * The lookbook, following 03-nail-looks.
 *
 * Search and every filter live in the query string. That is what makes a
 * filtered view shareable, keeps the back button meaningful, and lets the whole
 * grid stay a server component — the only client code on the page is the search
 * box, which debounces into the URL, and the heart on each card.
 *
 * Every image here is a designed set of tips, not a photograph of somebody's
 * hands. The "Inspiration" label on each card says so, because presenting a
 * generated image as work this studio has done would be a claim nobody made.
 */

const FILTERS = {
  color: ['rose', 'weiss', 'nude', 'oliv', 'gruen', 'gold', 'perlmutt'],
  shape: ['oval', 'mandel', 'eckig'],
  length: ['kurz', 'mittel', 'lang'],
} as const;

const LABEL: Record<string, { de: string; en: string }> = {
  rose: { de: 'Rosé', en: 'Rosé' },
  weiss: { de: 'Weiß', en: 'White' },
  nude: { de: 'Nude', en: 'Nude' },
  oliv: { de: 'Oliv', en: 'Olive' },
  gruen: { de: 'Grün', en: 'Green' },
  gold: { de: 'Gold', en: 'Gold' },
  perlmutt: { de: 'Perlmutt', en: 'Pearl' },
  oval: { de: 'Oval', en: 'Oval' },
  mandel: { de: 'Mandel', en: 'Almond' },
  eckig: { de: 'Eckig', en: 'Square' },
  kurz: { de: 'Kurz', en: 'Short' },
  mittel: { de: 'Mittel', en: 'Medium' },
  lang: { de: 'Lang', en: 'Long' },
  french: { de: 'French', en: 'French' },
  'cat-eye': { de: 'Cat Eye', en: 'Cat Eye' },
  // The tag vocabulary. Tags are stored as ASCII slugs so they survive a URL
  // and a database round trip; these are how they are written for a reader.
  klassisch: { de: 'Klassisch', en: 'Classic' },
  zeitlos: { de: 'Zeitlos', en: 'Timeless' },
  elegant: { de: 'Elegant', en: 'Elegant' },
  natuerlich: { de: 'Natürlich', en: 'Natural' },
  auffaellig: { de: 'Auffällig', en: 'Bold' },
  floral: { de: 'Floral', en: 'Floral' },
  alltag: { de: 'Alltag', en: 'Everyday' },
  abend: { de: 'Abend', en: 'Evening' },
};

const label = (value: string, locale: Locale) => LABEL[value]?.[locale] ?? value;

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

export async function LooksPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const customer = await currentCustomer();

  const search = (one(query.q) ?? '').trim().toLowerCase();
  const collection = one(query.collection);
  const color = one(query.farbe) ?? one(query.color);
  const shape = one(query.form) ?? one(query.shape);
  const length = one(query.laenge) ?? one(query.length);
  const onlyFavorites = one(query.favorites) === '1';

  const all = await db
    .select()
    .from(schema.look)
    .where(eq(schema.look.published, true))
    .orderBy(asc(schema.look.sortOrder));

  const favouriteSlugs = customer
    ? new Set(
        (
          await db
            .select({ slug: schema.look.slug })
            .from(schema.favorite)
            .innerJoin(schema.look, eq(schema.look.id, schema.favorite.lookId))
            .where(eq(schema.favorite.customerId, customer.id))
        ).map((row) => row.slug),
      )
    : new Set<string>();

  const filtered = all.filter((look) => {
    if (collection && look.collection !== collection) return false;
    if (color && !look.colors.includes(color)) return false;
    if (shape && look.shape !== shape) return false;
    if (length && look.length !== length) return false;
    if (onlyFavorites && customer && !favouriteSlugs.has(look.slug)) return false;
    if (search) {
      const haystack = [
        look.nameDe, look.nameEn, look.teaserDe, look.teaserEn,
        look.collection, look.shape, look.length, look.finish,
        ...look.colors, ...look.tags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const selectedSlug = one(query.look);
  const selected = filtered.find((l) => l.slug === selectedSlug) ?? filtered[0] ?? null;

  const name = (row: { nameDe: string; nameEn: string }) => (locale === 'de' ? row.nameDe : row.nameEn);
  const teaser = (row: { teaserDe: string; teaserEn: string }) => (locale === 'de' ? row.teaserDe : row.teaserEn);

  /** Builds a URL with one filter changed and everything else preserved. */
  const withFilter = (key: string, value: string | null, keepLook = false) => {
    const next = new URLSearchParams();
    const carry: [string, string | undefined][] = [
      ['q', one(query.q)],
      ['collection', collection],
      ['farbe', color],
      ['form', shape],
      ['laenge', length],
      ['favorites', onlyFavorites ? '1' : undefined],
      ...(keepLook ? ([['look', selectedSlug]] as [string, string | undefined][]) : []),
    ];
    for (const [k, v] of carry) if (v) next.set(k, v);
    if (value === null) next.delete(key);
    else next.set(key, value);
    return `${path(locale, 'looks')}${next.size ? `?${next}` : ''}`;
  };

  const anyFilter = Boolean(search || collection || color || shape || length || onlyFavorites);

  return (
    <div className="looks">
      <Petal position="tr" />
      <FavoritesSync signedIn={Boolean(customer)} />

      <section className="looks-main">
        <div className="looks-head">
          <div className="stack stack--1">
            <span className="eyebrow">{copy.looks.eyebrow}</span>
            <h1 className="looks-title">{copy.looks.title}</h1>
            <p className="small muted">
              {copy.home.editSubtitle}
              <br />
              {copy.home.editSubtitleTwo}
            </p>
          </div>
          <LookSearch locale={locale} initial={one(query.q) ?? ''} />
        </div>

        <div className="filter-row" role="group" aria-label={copy.looks.filters.all}>
          {(['french', 'rose', 'cat-eye'] as const).map((item) => (
            <Link
              key={item}
              className="chip"
              href={withFilter('collection', collection === item ? null : item)}
              data-active={collection === item}
            >
              {item === 'rose' ? 'Rosé' : label(item, locale)}
            </Link>
          ))}

          <span className="filter-divider" aria-hidden="true" />

          <FilterMenu
            legend={copy.looks.filters.color}
            icon={<Palette size={18} />}
            options={FILTERS.color}
            active={color}
            locale={locale}
            href={(value) => withFilter('farbe', value)}
          />
          <FilterMenu
            legend={copy.looks.filters.shape}
            icon={<NailShape size={18} />}
            options={FILTERS.shape}
            active={shape}
            locale={locale}
            href={(value) => withFilter('form', value)}
          />
          <FilterMenu
            legend={copy.looks.filters.length}
            icon={<Ruler size={18} />}
            options={FILTERS.length}
            active={length}
            locale={locale}
            href={(value) => withFilter('laenge', value)}
          />

          {anyFilter ? (
            <Link className="btn btn--text small" href={path(locale, 'looks')}>
              {copy.looks.resetFilters}
            </Link>
          ) : null}

          <span className="tiny muted" aria-live="polite">
            {copy.looks.resultCount(filtered.length)}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{copy.looks.empty}</h3>
            <p className="lede">{copy.looks.emptyHint}</p>
            <div className="row">
              <Link className="btn btn--secondary" href={path(locale, 'looks')}>
                {copy.looks.resetFilters}
              </Link>
              <Link className="btn btn--text" href={path(locale, 'stylist')}>
                {copy.nav.stylist}
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        ) : (
          <ul className="look-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered.map((look) => (
              <li key={look.id} style={{ position: 'relative' }}>
                <FavoriteButton
                  locale={locale}
                  lookSlug={look.slug}
                  initial={favouriteSlugs.has(look.slug)}
                  signedIn={Boolean(customer)}
                />
                <Link className="look-card" href={withFilter('look', look.slug, false)} scroll={false}>
                  {hasPhoto(look.mediaSlug) ? (
                    <Photo
                      id={look.mediaSlug as PhotoId}
                      alt=""
                      sizes="(max-width: 1099px) 50vw, 280px"
                    />
                  ) : null}
                  <span className="look-card-caption">
                    <span className="tag">{copy.looks.inspiration}</span>
                    <h2>{name(look)}</h2>
                    <p>{teaser(look)}</p>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <aside className="looks-detail" aria-label={name(selected)}>
          <div className="media looks-detail-media">
            {hasPhoto(selected.mediaSlug) ? (
              <Photo id={selected.mediaSlug as PhotoId} alt="" sizes="(max-width: 1099px) 100vw, 380px" />
            ) : null}
          </div>
          <div className="looks-detail-inner">
            <h2 style={{ fontSize: 34 }}>{name(selected)}</h2>
            <hr className="rule" />
            <p className="small muted">{locale === 'de' ? selected.descriptionDe : selected.descriptionEn}</p>

            <dl className="row" style={{ gap: 'var(--s3)', margin: 0 }}>
              <div>
                <dt className="eyebrow">{copy.looks.filters.color}</dt>
                <dd style={{ margin: '6px 0 0' }} className="small">
                  {selected.colors.map((c) => label(c, locale)).join(' / ')}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{copy.looks.filters.shape}</dt>
                <dd style={{ margin: '6px 0 0' }} className="small">
                  {label(selected.shape, locale)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{copy.looks.filters.length}</dt>
                <dd style={{ margin: '6px 0 0' }} className="small">
                  {label(selected.length, locale)}
                </dd>
              </div>
            </dl>

            <div className="row row--tight">
              {selected.tags.map((tag) => (
                <span key={tag} className="chip" style={{ pointerEvents: 'none' }}>
                  {label(tag, locale)}
                </span>
              ))}
            </div>

            <p className="tiny muted">{copy.looks.inspirationNote}</p>

            <Link
              className="btn btn--primary btn--block"
              href={`${path(locale, 'booking')}?look=${selected.slug}${
                selected.suggestedServiceSlug ? `&service=${selected.suggestedServiceSlug}` : ''
              }`}
            >
              {copy.looks.bookWithLook}
              <ArrowRight size={18} />
            </Link>
          </div>
        </aside>
      ) : null}

      {selected ? (
        <div className="looks-dock desktop-only">
          <div className="media looks-dock-thumb">
            {hasPhoto(selected.mediaSlug) ? (
              <Photo id={selected.mediaSlug as PhotoId} alt="" sizes="72px" />
            ) : null}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <span className="tiny muted">{copy.looks.currentLook}</span>
            <span className="serif" style={{ fontSize: 20 }}>
              {name(selected)}
            </span>
          </div>

          <span className="filter-divider" aria-hidden="true" />
          <span className="tiny muted">{copy.looks.yourSelection}</span>

          <div className="looks-dock-facts grow">
            <span className="looks-dock-fact">
              <Palette size={20} />
              <span className="stack" style={{ gap: 0 }}>
                <span className="tiny muted">{copy.looks.filters.color}</span>
                <span className="small">{selected.colors.map((c) => label(c, locale)).join(' / ')}</span>
              </span>
            </span>
            <span className="looks-dock-fact">
              <NailShape size={20} />
              <span className="stack" style={{ gap: 0 }}>
                <span className="tiny muted">{copy.looks.filters.shape}</span>
                <span className="small">{label(selected.shape, locale)}</span>
              </span>
            </span>
            <span className="looks-dock-fact">
              <Ruler size={20} />
              <span className="stack" style={{ gap: 0 }}>
                <span className="tiny muted">{copy.looks.filters.length}</span>
                <span className="small">{label(selected.length, locale)}</span>
              </span>
            </span>
          </div>

          <Link
            className="btn btn--primary"
            href={`${path(locale, 'booking')}?look=${selected.slug}${
              selected.suggestedServiceSlug ? `&service=${selected.suggestedServiceSlug}` : ''
            }`}
          >
            {copy.looks.bookWithLookLong}
            <ArrowRight size={18} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A filter as a <details> menu.
 *
 * Native rather than a scripted popover: it opens with the keyboard, closes on
 * Escape, and is announced correctly without a line of JavaScript.
 */
function FilterMenu({
  legend,
  icon,
  options,
  active,
  locale,
  href,
}: {
  legend: string;
  icon: React.ReactNode;
  options: readonly string[];
  active?: string;
  locale: Locale;
  href: (value: string | null) => string;
}) {
  return (
    <details className="relative" style={{ position: 'relative' }}>
      <summary className="chip" data-active={Boolean(active)} style={{ listStyle: 'none' }}>
        {icon}
        {active ? label(active, locale) : legend}
      </summary>
      <div
        className="panel"
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          zIndex: 20,
          padding: 8,
          display: 'grid',
          gap: 2,
          minWidth: 170,
        }}
      >
        {active ? (
          <Link className="btn btn--text small" href={href(null)} style={{ justifyContent: 'flex-start' }}>
            {legend}: —
          </Link>
        ) : null}
        {options.map((option) => (
          <Link
            key={option}
            className="btn btn--text small"
            href={href(option)}
            style={{ justifyContent: 'flex-start' }}
          >
            {label(option, locale)}
          </Link>
        ))}
      </div>
    </details>
  );
}
