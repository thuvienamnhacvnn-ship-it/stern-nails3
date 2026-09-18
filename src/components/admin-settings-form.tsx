'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The studio's own record.
 *
 * Every text field may legitimately be empty: an empty address is not a
 * validation failure, it is the state the site ships in, and the customer pages
 * are built to hide what is missing rather than print a placeholder. So an
 * empty string is sent as null and the form never insists.
 *
 * The four numbers at the bottom change how booking behaves — how long a slot
 * is held, the turnaround between appointments, the shortest notice and how far
 * ahead the calendar opens — so they are bounded here and bounded again on the
 * server.
 */

type Values = {
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  legalEntity: string;
  legalRepresentative: string;
  registerCourt: string;
  registerNumber: string;
  vatId: string;
  cancellationPolicy: string;
  holdMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
};

const TEXT_FIELDS: { key: keyof Values; label: string; type?: string; wide?: boolean }[] = [
  { key: 'legalEntity', label: 'Firmierung', wide: true },
  { key: 'legalRepresentative', label: 'Vertretungsberechtigte Person', wide: true },
  { key: 'street', label: 'Straße und Hausnummer', wide: true },
  { key: 'postalCode', label: 'PLZ' },
  { key: 'city', label: 'Ort' },
  { key: 'phone', label: 'Telefon', type: 'tel' },
  { key: 'email', label: 'E-Mail', type: 'email' },
  { key: 'registerCourt', label: 'Registergericht' },
  { key: 'registerNumber', label: 'Registernummer' },
  { key: 'vatId', label: 'Umsatzsteuer-ID' },
];

const NUMBER_FIELDS: { key: keyof Values; label: string; hint: string; min: number; max: number }[] = [
  { key: 'holdMinutes', label: 'Reservierung', hint: 'Minuten, die ein Slot während der Buchung blockiert bleibt', min: 2, max: 60 },
  { key: 'bufferMinutes', label: 'Puffer', hint: 'Minuten Umbauzeit nach jedem Termin', min: 0, max: 120 },
  { key: 'minNoticeMinutes', label: 'Vorlaufzeit', hint: 'Minuten, die ein Online-Termin mindestens in der Zukunft liegt', min: 0, max: 10080 },
  { key: 'bookingHorizonDays', label: 'Buchungszeitraum', hint: 'Tage, die der Kalender im Voraus öffnet', min: 1, max: 365 },
];

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Values, value: string | number) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        setError('Speichern fehlgeschlagen');
        setBusy(false);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack stack--2" onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--s2)' }}>
        {TEXT_FIELDS.map((field) => (
          <div key={field.key} className="field" style={field.wide ? { gridColumn: '1 / -1' } : undefined}>
            <label htmlFor={`setting-${field.key}`}>{field.label}</label>
            <input
              id={`setting-${field.key}`}
              className="input"
              type={field.type ?? 'text'}
              value={String(values[field.key] ?? '')}
              onChange={(event) => set(field.key, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="field">
        <label htmlFor="setting-cancellationPolicy">Stornierungs- und Aufbewahrungshinweis</label>
        <textarea
          id="setting-cancellationPolicy"
          className="textarea"
          value={values.cancellationPolicy}
          onChange={(event) => set('cancellationPolicy', event.target.value)}
        />
        <p className="tiny muted">
          Erscheint im Datenschutzhinweis. Bitte vor dem Livegang rechtlich prüfen lassen.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s2)' }}>
        {NUMBER_FIELDS.map((field) => (
          <div key={field.key} className="field">
            <label htmlFor={`setting-${field.key}`}>{field.label}</label>
            <input
              id={`setting-${field.key}`}
              className="input"
              type="number"
              min={field.min}
              max={field.max}
              value={Number(values[field.key])}
              onChange={(event) => set(field.key, Number(event.target.value))}
              aria-describedby={`hint-${field.key}`}
            />
            <p id={`hint-${field.key}`} className="tiny muted">
              {field.hint}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="row row--tight">
        <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <span className="small muted" role="status" aria-live="polite">
          {saved ? 'Gespeichert.' : ''}
        </span>
      </div>
    </form>
  );
}
