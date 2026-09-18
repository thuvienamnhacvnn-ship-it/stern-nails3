'use client';

import { useState } from 'react';
import Link from 'next/link';
import { t, type Locale } from '@/lib/i18n';
import { ArrowRight } from './icons';

/**
 * The sign-in form.
 *
 * It always says the same thing after submitting, whether or not the address is
 * known — a login form that answers "no such account" is an account
 * enumeration endpoint with a friendly face.
 *
 * In demo mode the link comes back in the response and is shown, because there
 * is no inbox to check. That branch is gated on the server, not here.
 */
export function SignInForm({ locale, demoMode }: { locale: Locale; demoMode: boolean }) {
  const copy = t(locale);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/sign-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      });
      const payload = (await response.json()) as { demoLink?: string | null; error?: string };
      if (!response.ok) {
        setError(payload.error === 'rate_limited' ? copy.stylist.rateLimited : copy.common.error);
        setBusy(false);
        return;
      }
      setSent(true);
      setDemoLink(payload.demoLink ?? null);
    } catch {
      setError(copy.common.error);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="panel panel--pad stack stack--2" role="status" aria-live="polite">
        <h2 className="serif" style={{ fontSize: 26 }}>
          {copy.account.signInSent}
        </h2>
        <p className="small muted">{copy.account.signInSentHint}</p>
        {demoMode && demoLink ? (
          <div className="notice notice--sage">
            <span>
              <span className="strong" style={{ display: 'block' }}>
                {copy.account.demoLinkNote}
              </span>
              <Link href={demoLink} style={{ textDecoration: 'underline', wordBreak: 'break-all' }}>
                {demoLink}
              </Link>
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form className="panel panel--pad stack stack--2" onSubmit={submit}>
      <div className="field">
        <label htmlFor="sign-in-email">{copy.checkout.email}</label>
        <input
          id="sign-in-email"
          className="input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </div>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email.trim()} aria-busy={busy}>
        {busy ? copy.common.loading : copy.account.signInSubmit}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
