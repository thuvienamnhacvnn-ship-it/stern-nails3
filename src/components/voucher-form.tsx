'use client';

import { useState } from 'react';
import { formatCents } from '@/lib/money';
import { t, type Locale } from '@/lib/i18n';
import { ArrowRight, Mail } from './icons';

/**
 * Designing and buying a gift card.
 *
 * The amount is one of the values the server sent, and the server checks it
 * again on arrival — a hand-edited request asking for a 1 € card with a 500 €
 * balance gets refused rather than trusted.
 *
 * The code is not minted here and never appears on this page. The request
 * creates an order; the code exists only once a payment has settled, and it is
 * delivered by email to the person receiving it.
 */
export function VoucherForm({ locale, amounts }: { locale: Locale; amounts: number[] }) {
  const copy = t(locale);
  const [amount, setAmount] = useState(amounts[1] ?? amounts[0]);
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_MESSAGE = 300;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountCents: amount, recipientName, recipientEmail, message, locale }),
      });
      if (!response.ok) {
        setError(copy.common.error);
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError(copy.common.error);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="stack stack--2" role="status" aria-live="polite">
        <h3 className="serif" style={{ fontSize: 28 }}>
          {copy.vouchers.issued}
        </h3>
        <p className="small muted">{copy.vouchers.issuedHint}</p>
        <button type="button" className="btn btn--ghost" onClick={() => setDone(false)}>
          {copy.vouchers.designer}
        </button>
      </div>
    );
  }

  return (
    <form className="stack stack--2" onSubmit={submit}>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        <legend className="small muted" style={{ paddingBottom: 8 }}>
          {copy.vouchers.amount}
        </legend>
        <div className="amount-row">
          {amounts.map((value) => (
            <button
              key={value}
              type="button"
              className="amount-option"
              aria-pressed={amount === value}
              onClick={() => setAmount(value)}
            >
              {formatCents(value, locale)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="voucher-recipient">{copy.vouchers.recipient}</label>
        <input
          id="voucher-recipient"
          className="input"
          value={recipientName}
          onChange={(event) => setRecipientName(event.target.value)}
          placeholder={copy.vouchers.recipientPlaceholder}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="voucher-message">{copy.vouchers.message}</label>
        <textarea
          id="voucher-message"
          className="textarea"
          value={message}
          maxLength={MAX_MESSAGE}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={copy.vouchers.messagePlaceholder}
          aria-describedby="voucher-message-count"
        />
        <p id="voucher-message-count" className="tiny muted" style={{ textAlign: 'right' }}>
          {message.length} / {MAX_MESSAGE}
        </p>
      </div>

      <div className="field">
        <label htmlFor="voucher-email">{copy.vouchers.deliverTo}</label>
        <input
          id="voucher-email"
          className="input"
          type="email"
          value={recipientEmail}
          onChange={(event) => setRecipientEmail(event.target.value)}
          placeholder={copy.checkout.email}
          autoComplete="email"
          required
        />
      </div>

      <p className="notice">
        <Mail size={20} />
        <span>{copy.vouchers.deliveryNote}</span>
      </p>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="row row--between" style={{ paddingTop: 'var(--s1)', borderTop: '1px solid var(--hairline)' }}>
        <span className="stack" style={{ gap: 0 }}>
          <span className="serif" style={{ fontSize: 22 }}>
            {copy.vouchers.total}
          </span>
          <span className="tiny muted">{copy.vouchers.vat}</span>
        </span>
        <span className="serif" style={{ fontSize: 34 }}>
          {formatCents(amount, locale)}
        </span>
      </div>

      <button type="submit" className="btn btn--primary btn--block" disabled={busy} aria-busy={busy}>
        {busy ? copy.vouchers.buying : copy.vouchers.buy}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
