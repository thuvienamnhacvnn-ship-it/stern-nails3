'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { path, t, type Locale } from '@/lib/i18n';
import { ArrowRight, Card, PayPal, Store } from './icons';

/**
 * The contact form, the payment choice and the one button that commits.
 *
 * Four things this has to get right, and each of them is a bug somebody has
 * shipped before:
 *
 *  - A double click must not book twice. The button disables on the first
 *    press and stays disabled through the redirect.
 *  - Validation errors have to be announced, not only coloured. Each field
 *    gets aria-invalid and a message wired up with aria-describedby, and the
 *    first bad field takes focus.
 *  - A failed payment must not lose the form. The booking stays held and the
 *    error appears above the button with everything still filled in.
 *  - The marketing box starts unticked and stays that way unless somebody
 *    ticks it. Booking an appointment is not consent to be emailed.
 */

type Method = 'on_site' | 'card' | 'paypal';

export function CheckoutForm({
  locale,
  bookingId,
  methods,
  demoMode,
  canPayOnline,
  holdExpiresAt,
  defaults,
}: {
  locale: Locale;
  bookingId: string;
  methods: Method[];
  demoMode: boolean;
  canPayOnline: boolean;
  holdExpiresAt: string;
  defaults: { firstName: string; lastName: string; email: string; phone: string };
}) {
  const router = useRouter();
  const copy = t(locale);

  const [values, setValues] = useState(defaults);
  const [method, setMethod] = useState<Method>(methods[0] ?? 'on_site');
  const [marketing, setMarketing] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherNote, setVoucherNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  const form = useRef<HTMLFormElement>(null);

  // The hold has a deadline, and letting somebody fill in a form against a slot
  // that quietly lapsed is worse than telling them.
  useEffect(() => {
    const deadline = new Date(holdExpiresAt).getTime();
    const check = () => setExpired(Date.now() > deadline);
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, [holdExpiresAt]);

  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!values.firstName.trim()) next.firstName = copy.checkout.required;
    if (!values.lastName.trim()) next.lastName = copy.checkout.required;
    if (!values.email.trim()) next.email = copy.checkout.required;
    // Deliberately loose: the address is verified by mail arriving, not by a
    // regular expression that rejects somebody's perfectly valid address.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = copy.checkout.invalidEmail;

    setErrors(next);
    if (Object.keys(next).length > 0) {
      form.current?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return false;
    }
    return true;
  }

  async function applyVoucher() {
    if (!voucherCode.trim()) return;
    try {
      const response = await fetch('/api/vouchers/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingId, code: voucherCode }),
      });
      const payload = (await response.json()) as { error?: string; appliedCents?: number };
      if (!response.ok) {
        setVoucherNote({
          ok: false,
          text: payload.error === 'empty' ? copy.checkout.voucherEmpty : copy.checkout.voucherInvalid,
        });
        return;
      }
      setVoucherNote({ ok: true, text: copy.checkout.voucherApplied });
      router.refresh();
    } catch {
      setVoucherNote({ ok: false, text: copy.common.error });
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || expired) return;
    if (!validate()) return;

    setBusy(true);
    setFormError(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          locale,
          method,
          marketingOptIn: marketing,
          contact: {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone || null,
          },
        }),
      });
      const payload = (await response.json()) as { manageToken?: string; error?: string };

      if (!response.ok) {
        setFormError(
          payload.error === 'slot_taken' ? copy.checkout.slotGone
          : payload.error === 'hold_expired' ? copy.booking.holdExpired
          : payload.error === 'payment_failed' ? copy.checkout.paymentFailed
          : copy.common.error,
        );
        setBusy(false);
        return;
      }

      router.push(`${path(locale, 'confirmation')}/${payload.manageToken}`);
    } catch {
      setFormError(copy.common.error);
      setBusy(false);
    }
  }

  const METHOD_ICON: Record<Method, React.ReactNode> = {
    on_site: <Store size={22} />,
    card: <Card size={22} />,
    paypal: <PayPal size={22} />,
  };

  return (
    <form ref={form} className="panel checkout-form" onSubmit={submit} noValidate>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 'var(--s2)' }}>
        <legend className="serif" style={{ fontSize: 30, paddingBottom: 'var(--s2)' }}>
          {copy.checkout.contact}
        </legend>

        <div className="field-pair">
          <Field
            label={copy.checkout.firstName}
            name="firstName"
            value={values.firstName}
            onChange={set('firstName')}
            error={errors.firstName}
            autoComplete="given-name"
            required
          />
          <Field
            label={copy.checkout.lastName}
            name="lastName"
            value={values.lastName}
            onChange={set('lastName')}
            error={errors.lastName}
            autoComplete="family-name"
            required
          />
        </div>

        <Field
          label={copy.checkout.email}
          name="email"
          type="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          required
        />

        {/* Optional until the studio decides its policy; it is not asked for as
            a requirement nobody agreed to. */}
        <Field
          label={copy.checkout.phone}
          name="phone"
          type="tel"
          value={values.phone}
          onChange={set('phone')}
          autoComplete="tel"
        />
      </fieldset>

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        <legend className="serif" style={{ fontSize: 30, paddingBottom: 'var(--s2)' }}>
          {copy.checkout.payment}
        </legend>

        {methods.map((option) => {
          const disabled = option !== 'on_site' && !canPayOnline;
          return (
            <label key={option} className="choice" data-disabled={disabled}>
              <input
                type="radio"
                name="method"
                value={option}
                checked={method === option}
                disabled={disabled}
                onChange={() => setMethod(option)}
              />
              {METHOD_ICON[option]}
              <span className="grow">
                <span className="choice-label" style={{ display: 'block' }}>
                  {copy.checkout.methods[option].label}
                </span>
                <span className="choice-hint">
                  {disabled ? copy.booking.priceOnRequestNote : copy.checkout.methods[option].hint}
                </span>
              </span>
              {demoMode && option !== 'on_site' ? <span className="badge">{copy.common.demo}</span> : null}
            </label>
          );
        })}

        <div className="row row--nowrap" style={{ gap: 8, marginTop: 8 }}>
          <div className="field grow">
            <label htmlFor="voucher">{copy.checkout.voucherCode}</label>
            <input
              id="voucher"
              className="input"
              value={voucherCode}
              onChange={(event) => setVoucherCode(event.target.value)}
              autoComplete="off"
              aria-describedby={voucherNote ? 'voucher-note' : undefined}
            />
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={applyVoucher}
            style={{ alignSelf: 'end' }}
            disabled={!voucherCode.trim()}
          >
            {copy.checkout.applyVoucher}
          </button>
        </div>
        {voucherNote ? (
          <p
            id="voucher-note"
            className={voucherNote.ok ? 'tiny' : 'field-error'}
            role="status"
            aria-live="polite"
          >
            {voucherNote.text}
          </p>
        ) : null}

        <label className="row row--nowrap" style={{ gap: 12, alignItems: 'flex-start', marginTop: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={marketing}
            onChange={(event) => setMarketing(event.target.checked)}
            style={{ accentColor: 'var(--sage)', width: 18, height: 18, marginTop: 4 }}
          />
          <span>
            <span className="small" style={{ display: 'block' }}>
              {copy.checkout.marketing}
            </span>
            <span className="tiny muted">{copy.checkout.marketingHint}</span>
          </span>
        </label>
      </fieldset>

      {expired ? (
        <p className="notice notice--error" role="alert">
          {copy.booking.holdExpired}
        </p>
      ) : null}
      {formError ? (
        <p className="notice notice--error" role="alert" aria-live="assertive">
          <span>
            <span className="strong" style={{ display: 'block' }}>
              {copy.checkout.errorTitle}
            </span>
            {formError}
          </span>
        </p>
      ) : null}

      <button type="submit" className="btn btn--primary btn--block" disabled={busy || expired} aria-busy={busy}>
        {busy ? copy.checkout.submitting : copy.checkout.submit}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        className="input"
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-required={required}
      />
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
