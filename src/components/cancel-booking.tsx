'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';

/**
 * Cancelling, with a confirmation step.
 *
 * Deliberately two presses. The button sits next to "reschedule" on a small
 * card, and a single-tap cancel there is a mis-tap away from losing somebody's
 * Saturday appointment.
 */
export function CancelBooking({
  locale,
  bookingId,
  manageToken,
}: {
  locale: Locale;
  bookingId?: string;
  /** Used when cancelling from the emailed link, with no account. */
  manageToken?: string;
}) {
  const copy = t(locale);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingId, manageToken, locale }),
      });
      if (!response.ok) {
        setError(copy.common.error);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError(copy.common.error);
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
        {copy.account.cancelBooking}
      </button>
    );
  }

  return (
    <div className="stack stack--1">
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row row--tight">
        <button type="button" className="btn btn--secondary btn--sm" onClick={cancel} disabled={busy} aria-busy={busy}>
          {busy ? copy.common.loading : copy.common.confirm}
        </button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setConfirming(false)} disabled={busy}>
          {copy.common.cancel}
        </button>
      </div>
    </div>
  );
}
