import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { formatDuration, formatPrice } from '@/lib/money';
import { hasPhoto, type PhotoId } from '@/lib/media';
import { Photo } from '@/components/image';
import { BookingDock } from '@/components/booking-dock';
import { Motto, Petal } from '@/components/shell';
import { ArrowRight, Clock, Foot, Hand, NailShape, Sparkle } from '@/components/icons';
import { ServiceDetail } from '@/components/service-detail';

/**
 * The catalogue, following 02-services.
 *
 * Category and selected service both live in the URL rather than in component
 * state: the back button then works, a link to "the pedicure" is a link
 * somebody can send, and the whole page stays a server component with no
 * client-side catalogue to keep in sync.
 */

const CATEGORIES = ['manikuere', 'modellage', 'pedikuere', 'extras'] as const;
type Category = (typeof CATEGORIES)[number];

/** One icon per category, and four different ones — a leaf standing in for a
 *  pedicure and a sparkle for two separate categories both read as filler. */
const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  manikuere: <Hand size={22} />,
  modellage: <NailShape size={22} />,
  pedikuere: <Foot size={22} />,
  extras: <Sparkle size={22} />,
};

export async function ServicesPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const requested = typeof query.kategorie === 'string' ? query.kategorie : typeof query.category === 'string' ? query.category : null;
  const category: Category = (CATEGORIES as readonly string[]).includes(requested ?? '')
    ? (requested as Category)
    : 'manikuere';

  const all = await db
    .select()
    .from(schema.service)
    .where(eq(schema.service.published, true))
    .orderBy(asc(schema.service.sortOrder));

  const inCategory = all.filter((service) => service.category === category);

  const selectedSlug = typeof query.leistung === 'string' ? query.leistung : typeof query.service === 'string' ? query.service : null;
  const selected = inCategory.find((s) => s.slug === selectedSlug) ?? inCategory[0] ?? null;

  const variants = selected
    ? await db
        .select()
        .from(schema.serviceVariant)
        .where(eq(schema.serviceVariant.serviceId, selected.id))
        .orderBy(asc(schema.serviceVariant.sortOrder))
    : [];

  const extras = selected
    ? await db
        .select({ addOn: schema.addOn })
        .from(schema.serviceAddOn)
        .innerJoin(schema.addOn, eq(schema.addOn.id, schema.serviceAddOn.addOnId))
        .where(and(eq(schema.serviceAddOn.serviceId, selected.id), eq(schema.addOn.published, true)))
        .orderBy(asc(schema.addOn.sortOrder))
    : [];

  const staff = await db
    .select({ slug: schema.staff.slug, displayName: schema.staff.displayName })
    .from(schema.staff)
    .where(eq(schema.staff.active, true))
    .orderBy(asc(schema.staff.sortOrder));

  const name = (row: { nameDe: string; nameEn: string }) => (locale === 'de' ? row.nameDe : row.nameEn);

  return (
    <div className="services">
      <Petal position="bl" />

      <section className="services-intro">
        <span className="eyebrow">{copy.services.eyebrow}</span>
        <h1 className="services-title">
          Für deinen
          <br />
          Moment.
        </h1>
        <hr className="rule" />
        <p className="lede" style={{ maxWidth: '30ch' }}>
          {copy.services.intro}
        </p>
        <div style={{ marginTop: 'var(--s3)' }} className="desktop-only">
          <Motto locale={locale} />
        </div>
        <p className="tiny muted desktop-only" style={{ marginTop: 'auto', paddingTop: 'var(--s4)' }}>
          {copy.services.approvalNote}
        </p>
      </section>

      <section className="services-main">
        <nav className="category-tabs" aria-label={copy.services.eyebrow}>
          {CATEGORIES.map((item) => (
            <Link
              key={item}
              className="category-tab"
              href={`${path(locale, 'services')}?kategorie=${item}`}
              aria-current={item === category ? 'true' : undefined}
            >
              {CATEGORY_ICON[item]}
              <span>{copy.services.categories[item]}</span>
            </Link>
          ))}
        </nav>

        {inCategory.length === 0 ? (
          <div className="empty-state">
            <h3>{copy.services.empty}</h3>
            <p className="lede">{copy.services.emptyHint}</p>
            <Link className="btn btn--secondary" href={path(locale, 'studio')}>
              {copy.studio.contact}
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <ul className="service-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {inCategory.map((service) => (
              <li key={service.id} className="card">
                <div className="media service-card-media">
                  {service.mediaSlug && hasPhoto(service.mediaSlug) ? (
                    <Photo
                      id={service.mediaSlug as PhotoId}
                      alt=""
                      sizes="(max-width: 1099px) 50vw, 260px"
                    />
                  ) : null}
                </div>
                <div className="service-card-body">
                  <h2 className="service-card-title">{name(service)}</h2>
                  <p className="small muted">{locale === 'de' ? service.teaserDe : service.teaserEn}</p>
                </div>
                <div className="service-card-foot">
                  <span className="row row--tight small muted">
                    <Clock size={18} />
                    ca. {formatDuration(service.durationMinutes, locale)}
                  </span>
                  <Link
                    className="round-arrow"
                    href={`${path(locale, 'services')}?kategorie=${category}&leistung=${service.slug}`}
                    aria-label={`${copy.services.details}: ${name(service)}`}
                  >
                    <ArrowRight size={18} />
                  </Link>
                </div>
                <p className="service-card-price">{formatPrice(service.priceCents, locale)}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="services-dock desktop-only">
          <BookingDock
            locale={locale}
            defaultService={selected?.slug}
            services={all.map((s) => ({ slug: s.slug, name: name(s) }))}
            staff={staff.map((s) => ({ slug: s.slug, name: s.displayName }))}
          />
        </div>
      </section>

      {selected ? (
        <ServiceDetail
          locale={locale}
          service={{
            slug: selected.slug,
            category: selected.category,
            name: name(selected),
            teaser: locale === 'de' ? selected.teaserDe : selected.teaserEn,
            description: locale === 'de' ? selected.descriptionDe : selected.descriptionEn,
            durationMinutes: selected.durationMinutes,
            priceCents: selected.priceCents,
          }}
          variants={variants.map((v) => ({
            slug: v.slug,
            name: name(v),
            isDefault: v.isDefault,
            priceDeltaCents: v.priceDeltaCents,
            durationDeltaMinutes: v.durationDeltaMinutes,
          }))}
          extras={extras.map(({ addOn }) => ({
            slug: addOn.slug,
            name: name(addOn),
            priceCents: addOn.priceCents,
            durationMinutes: addOn.durationMinutes,
          }))}
        />
      ) : null}

      <div className="services-dock mobile-only" style={{ gridColumn: '1 / -1' }}>
        <BookingDock
          locale={locale}
          compact
          defaultService={selected?.slug}
          services={all.map((s) => ({ slug: s.slug, name: name(s) }))}
          staff={[]}
        />
      </div>
    </div>
  );
}
