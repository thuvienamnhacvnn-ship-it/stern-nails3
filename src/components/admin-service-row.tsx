'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One editable row of the catalogue.
 *
 * The price field is a text input rather than `type="number"`: it has to be
 * possible to clear it, and an empty number input in some browsers reports a
 * value of `0`, which is exactly the confusion this codebase spends so much
 * effort avoiding. Empty means "on request" and is sent as null.
 *
 * Saving writes through an endpoint that records the before and after in the
 * audit log, because a price that changed between a customer looking and paying
 * is the first thing anybody asks about.
 */
export function ServiceRow({
  service,
  variantNames,
  labels,
}: {
  service: {
    id: string;
    name: string;
    category: string;
    durationMinutes: number;
    priceCents: number | null;
    published: boolean;
  };
  variantNames: string[];
  labels: {
    published: string;
    unpublished: string;
    save: string;
    publish: string;
    unpublish: string;
    durationHint: string;
    priceHint: string;
  };
}) {
  const router = useRouter();
  const [duration, setDuration] = useState(String(service.durationMinutes));
  // Euros in the field, cents in the database. The conversion happens once, on
  // submit, and rounds rather than truncates.
  const [price, setPrice] = useState(service.priceCents === null ? '' : (service.priceCents / 100).toFixed(2));
  const [published, setPublished] = useState(service.published);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    duration !== String(service.durationMinutes) ||
    price !== (service.priceCents === null ? '' : (service.priceCents / 100).toFixed(2)) ||
    published !== service.published;

  async function save(next?: { published?: boolean }) {
    setBusy(true);
    setError(null);
    setSaved(false);

    const trimmed = price.trim().replace(',', '.');
    const priceCents = trimmed === '' ? null : Math.round(Number(trimmed) * 100);
    if (priceCents !== null && !Number.isFinite(priceCents)) {
      setError('Ungültiger Preis');
      setBusy(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          durationMinutes: Number(duration),
          priceCents,
          published: next?.published ?? published,
        }),
      });
      if (!response.ok) {
        setError('Speichern fehlgeschlagen');
        setBusy(false);
        return;
      }
      if (next?.published !== undefined) setPublished(next.published);
      setSaved(true);
      router.refresh();
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <span className="strong">{service.name}</span>
        <span className="tiny muted" style={{ display: 'block' }}>
          {service.category}
        </span>
      </td>
      <td className="tiny muted">{variantNames.join(' · ') || '—'}</td>
      <td>
        <label className="sr-only" htmlFor={`duration-${service.id}`}>
          Dauer in Minuten für {service.name}
        </label>
        <input
          id={`duration-${service.id}`}
          className="input"
          style={{ width: 90, minHeight: 40 }}
          inputMode="numeric"
          value={duration}
          onChange={(event) => setDuration(event.target.value.replace(/[^\d]/g, ''))}
        />
      </td>
      <td>
        <label className="sr-only" htmlFor={`price-${service.id}`}>
          Preis in Euro für {service.name}, leer für Preis auf Anfrage
        </label>
        <input
          id={`price-${service.id}`}
          className="input"
          style={{ width: 110, minHeight: 40 }}
          inputMode="decimal"
          placeholder="auf Anfrage"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </td>
      <td>
        <button
          type="button"
          className="chip chip--sage"
          data-active={published}
          onClick={() => save({ published: !published })}
          disabled={busy}
        >
          {published ? labels.published : labels.unpublished}
        </button>
      </td>
      <td>
        <div className="row row--tight" style={{ flexWrap: 'nowrap' }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => save()}
            disabled={busy || !dirty}
            aria-busy={busy}
          >
            {labels.save}
          </button>
          <span className="tiny muted" role="status" aria-live="polite">
            {error ?? (saved ? '✓' : '')}
          </span>
        </div>
      </td>
    </tr>
  );
}
