'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { path, t, type Locale } from '@/lib/i18n';
import { brand } from '@/lib/media';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkle } from './icons';

/**
 * The stylist conversation and its results.
 *
 * Three behaviours are load-bearing rather than decorative:
 *
 *  - Every reply is announced. The thread is an aria-live region, so a screen
 *    reader hears the answer instead of finding it later by accident.
 *  - "Termin vorbereiten" navigates to the booking page with the look and
 *    service filled in. It does not book, does not hold and does not promise
 *    that any time is free.
 *  - When the assistant cannot answer — no key, a timeout, a refusal — the
 *    page says so once and points at the filters, which do the same job
 *    without it.
 */

type Recommendation = {
  lookSlug: string;
  name: string;
  mediaSrc: string;
  reason: string;
  serviceSlug: string | null;
};

type Message = { from: 'stylist' | 'me'; text: string };

export function StylistWorkspace({
  locale,
  aiConfigured,
  initialResults,
}: {
  locale: Locale;
  aiConfigured: boolean;
  /** The lookbook's own headline collections, shown before anybody asks. */
  initialResults: Recommendation[];
}) {
  const copy = t(locale);
  const flower = brand('flower');

  const [thread, setThread] = useState<Message[]>([{ from: 'stylist', text: copy.stylist.greeting }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Recommendation[]>(initialResults);
  const [answered, setAnswered] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  // Only follow the conversation once it is a conversation. Scrolling on mount
  // would push the greeting and the suggested questions out of view before the
  // visitor has read either.
  useEffect(() => {
    if (thread.length > 1) threadEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread, busy]);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    setThread((current) => [...current, { from: 'me', text: message }]);
    setInput('');
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch('/api/stylist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, locale }),
      });
      const payload = (await response.json()) as {
        message?: string;
        recommendations?: Recommendation[];
        offline?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setThread((current) => [
          ...current,
          { from: 'stylist', text: payload.error === 'rate_limited' ? copy.stylist.rateLimited : copy.stylist.offline },
        ]);
        setFailed(true);
        return;
      }

      setThread((current) => [...current, { from: 'stylist', text: payload.message ?? '' }]);
      // An answer with no matches keeps the lookbook on screen rather than
      // clearing the rail to an empty box.
      if (payload.recommendations && payload.recommendations.length > 0) {
        setResults(payload.recommendations);
        setAnswered(true);
      }
      setOffline(Boolean(payload.offline));
    } catch {
      setThread((current) => [...current, { from: 'stylist', text: copy.stylist.offline }]);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="stylist-chat">
        <div className="stack stack--2">
          <h1 className="stylist-title">
            {copy.stylist.title[0]}
            <br />
            {copy.stylist.title[1]}
          </h1>
          <hr className="rule" />
          <p className="lede" style={{ maxWidth: '44ch' }}>
            {copy.stylist.intro}
          </p>
        </div>

        <div className="stylist-thread" role="log" aria-live="polite" aria-label={copy.nav.stylist}>
          {thread.map((message, index) => (
            <div key={index} className={`bubble-row${message.from === 'me' ? ' bubble-row--me' : ''}`}>
              {message.from === 'stylist' ? (
                <span className="bubble-avatar" aria-hidden="true">
                  <img src={flower.src} width={flower.width} height={flower.height} alt="" />
                </span>
              ) : null}
              <p className={`bubble${message.from === 'me' ? ' bubble--me' : ''}`}>{message.text}</p>
            </div>
          ))}

          {busy ? (
            <div className="bubble-row">
              <span className="bubble-avatar" aria-hidden="true">
                <img src={flower.src} width={flower.width} height={flower.height} alt="" />
              </span>
              <p className="bubble muted">{copy.stylist.thinking}</p>
            </div>
          ) : null}

          {thread.length === 1 ? (
            <>
              <div className="stylist-suggestions">
                {copy.stylist.prompts.map((prompt) => (
                  <button key={prompt} type="button" className="chip" onClick={() => ask(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="bubble-row">
                <span className="bubble-avatar" aria-hidden="true">
                  <img src={flower.src} width={flower.width} height={flower.height} alt="" />
                </span>
                <p className="bubble">{copy.stylist.chipsIntro}</p>
              </div>
              <div className="row row--tight" style={{ paddingLeft: 56 }}>
                {copy.stylist.chips.map((chip) => (
                  <button key={chip} type="button" className="chip" onClick={() => ask(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {failed ? (
            <div className="notice notice--sage">
              <span>
                <span className="strong" style={{ display: 'block' }}>
                  {copy.stylist.offline}
                </span>
                {copy.stylist.offlineHint}{' '}
                <Link href={path(locale, 'looks')} style={{ textDecoration: 'underline' }}>
                  {copy.nav.looks}
                </Link>
              </span>
            </div>
          ) : null}

          <div ref={threadEnd} />
        </div>

        <form
          className="stylist-input"
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
        >
          <Sparkle size={22} aria-hidden="true" />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={copy.stylist.inputPlaceholder}
            aria-label={copy.stylist.inputPlaceholder}
            maxLength={500}
          />
          <button type="submit" className="stylist-send" disabled={busy || !input.trim()} aria-label={copy.stylist.send}>
            <ArrowRight size={20} />
          </button>
        </form>

        <p className="tiny muted">
          {copy.stylist.aiNote}
          {aiConfigured ? null : ` ${copy.stylist.offlineHint}`}
        </p>
      </section>

      <section className="stylist-results" aria-labelledby="stylist-results-title">
        <div className="row row--between">
          <h2 id="stylist-results-title" className="stylist-results-title">
            {copy.stylist.resultsTitle}
          </h2>
          <div className="row row--tight desktop-only">
            <span className="round-arrow round-arrow--sm" aria-hidden="true">
              <ChevronLeft size={18} />
            </span>
            <span className="round-arrow round-arrow--sm" aria-hidden="true">
              <ChevronRight size={18} />
            </span>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="empty-state">
            <h3>{copy.looks.inspiration}</h3>
            <p className="lede">{copy.stylist.intro}</p>
            <Link className="btn btn--secondary" href={path(locale, 'looks')}>
              {copy.nav.looks}
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <ul className="recommendation-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {results.map((item) => (
              <li key={item.lookSlug} className="card recommendation-card">
                <div className="media">
                  <img src={item.mediaSrc} alt="" loading="lazy" />
                </div>
                <div className="recommendation-body">
                  <h3>{item.name}</h3>
                  <p className="small muted">{item.reason}</p>
                  <div className="recommendation-actions">
                    <Link className="btn btn--ghost btn--sm" href={`${path(locale, 'looks')}?look=${item.lookSlug}`}>
                      {copy.stylist.viewLook}
                      <ArrowRight size={16} />
                    </Link>
                    <Link
                      className="btn btn--primary btn--sm"
                      href={`${path(locale, 'booking')}?look=${item.lookSlug}${
                        item.serviceSlug ? `&service=${item.serviceSlug}` : ''
                      }`}
                    >
                      {copy.stylist.prepareBooking}
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="tiny muted">
          {answered && offline ? `${copy.stylist.offlineHint} ` : ''}
          {copy.stylist.healthDisclaimer}
        </p>
      </section>
    </>
  );
}
