'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { path, t, type Locale } from '@/lib/i18n';
import { ArrowRight } from './icons';

/**
 * "Weiter": reserves the slot, then moves on.
 *
 * This is the first moment anything is written. The button disables itself for
 * the duration of the request — a double click must not produce two holds —
 * and a slot that has gone in the meantime comes back as a message next to the
 * times rather than as a failure page, because the rest of the customer's
 * choices are still good.
 */
export function HoldAndContinue({
  locale,
  disabled,
  selection,
}: {
  locale: Locale;
  disabled: boolean;
  selection: {
    serviceSlug: string;
    variantSlug: string | null;
    addOnSlugs: string[];
    lookSlug: string | null;
    staffSlug: string | null;
    startsAt: string | null;
  };
}) {
  const router = useRouter();
  const copy = t(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selection.startsAt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/booking-holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const payload = (await response.json()) as { bookingId?: string; error?: string };

      if (!response.ok || !payload.bookingId) {
        setError(payload.error === 'slot_taken' ? copy.checkout.slotGone : copy.common.error);
        setBusy(false);
        // The times on the page are now stale; the server has the truth.
        router.refresh();
        return;
      }

      router.push(`${path(locale, 'checkout')}?booking=${payload.bookingId}`);
    } catch {
      setError(copy.common.error);
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--1" style={{ justifyItems: 'end' }}>
      {error ? (
        <p className="notice notice--error" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn--primary"
        onClick={submit}
        disabled={disabled || busy}
        aria-busy={busy}
      >
        {busy ? copy.common.loading : copy.booking.next}
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
