'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { path, t, type Locale } from '@/lib/i18n';
import { formatDuration, formatPrice, sumCents } from '@/lib/money';
import { ArrowRight, Clock } from './icons';

/**
 * The detail panel on the services page: variant, extras, and the button that
 * carries the choice into the booking flow.
 *
 * The running total shown here is a preview, computed from the same rules the
 * server uses but never trusted by it — the booking recomputes everything from
 * the service records when the slot is held. If the two ever disagree, the
 * server wins and the customer sees the real number before they confirm.
 *
 * A service with no confirmed price stays "Preis auf Anfrage" the whole way
 * through: adding an extra to it does not produce a total, because a surcharge
 * on an unknown base is not a price.
 */
export function ServiceDetail({
  locale,
  service,
  variants,
  extras,
}: {
  locale: Locale;
  service: {
    slug: string;
    category: string;
    name: string;
    teaser: string;
    description: string;
    durationMinutes: number;
    priceCents: number | null;
  };
  variants: { slug: string; name: string; isDefault: boolean; priceDeltaCents: number; durationDeltaMinutes: number }[];
  extras: { slug: string; name: string; priceCents: number | null; durationMinutes: number }[];
}) {
  const router = useRouter();
  const copy = t(locale);

  const [variant, setVariant] = useState(
    () => variants.find((v) => v.isDefault)?.slug ?? variants[0]?.slug ?? '',
  );
  const [chosenExtras, setChosenExtras] = useState<string[]>([]);

  const { totalCents, durationMinutes } = useMemo(() => {
    const picked = variants.find((v) => v.slug === variant);
    const extraRows = extras.filter((e) => chosenExtras.includes(e.slug));
    return {
      totalCents: sumCents([
        service.priceCents,
        service.priceCents === null ? null : (picked?.priceDeltaCents ?? 0),
        ...extraRows.map((e) => e.priceCents),
      ]),
      durationMinutes:
        service.durationMinutes +
        (picked?.durationDeltaMinutes ?? 0) +
        extraRows.reduce((sum, e) => sum + e.durationMinutes, 0),
    };
  }, [variant, chosenExtras, variants, extras, service]);

  function toBooking() {
    const query = new URLSearchParams({ service: service.slug });
    if (variant) query.set('variant', variant);
    for (const slug of chosenExtras) query.append('extra', slug);
    router.push(`${path(locale, 'booking')}?${query}`);
  }

  return (
    <aside className="services-detail" aria-label={service.name}>
      <span className="eyebrow">{service.name}</span>
      <h2 className="services-detail-title">{service.name}</h2>
      <p className="small muted">{service.description}</p>

      <p className="row row--tight small muted">
        <Clock size={18} />
        ca. {formatDuration(durationMinutes, locale)}
      </p>

      {variants.length > 0 ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          <legend className="strong" style={{ paddingBottom: 8 }}>
            {copy.services.chooseVariant}
          </legend>
          {variants.map((option) => (
            <label key={option.slug} className="choice">
              <input
                type="radio"
                name="variant"
                value={option.slug}
                checked={variant === option.slug}
                onChange={() => setVariant(option.slug)}
              />
              <span className="grow choice-label">{option.name}</span>
              {service.priceCents !== null && option.priceDeltaCents > 0 ? (
                <span className="tiny muted">+{formatPrice(option.priceDeltaCents, locale)}</span>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      {extras.length > 0 ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend className="strong" style={{ paddingBottom: 8 }}>
            {copy.services.extras}
          </legend>
          {extras.map((extra) => (
            <label key={extra.slug} className="row row--nowrap" style={{ gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={chosenExtras.includes(extra.slug)}
                onChange={(event) =>
                  setChosenExtras((current) =>
                    event.target.checked
                      ? [...current, extra.slug]
                      : current.filter((slug) => slug !== extra.slug),
                  )
                }
                style={{ accentColor: 'var(--sage)', width: 18, height: 18 }}
              />
              <span className="grow small">{extra.name}</span>
              <span className="tiny muted">{formatPrice(extra.priceCents, locale)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="row row--between" style={{ paddingTop: 'var(--s1)', borderTop: '1px solid var(--hairline-soft)' }}>
        <span className="small muted">{copy.booking.total}</span>
        <span className="strong">{formatPrice(totalCents, locale)}</span>
      </div>

      {totalCents === null ? (
        <p className="tiny muted">{copy.booking.priceOnRequestNote}</p>
      ) : null}

      <button type="button" className="btn btn--primary btn--block" onClick={toBooking}>
        {copy.services.toBooking}
        <ArrowRight size={18} />
      </button>
    </aside>
  );
}
