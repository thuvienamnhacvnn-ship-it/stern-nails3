'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { otherLocale, path, t, type Locale, type PageKey } from '@/lib/i18n';
import { ArrowRight, Close, Menu } from './icons';

/**
 * The hamburger drawer.
 *
 * The keyboard behaviour is the whole reason this is a component rather than a
 * details element: focus moves into the drawer when it opens, Tab is trapped
 * inside it while it is open, Escape closes it, and focus returns to the
 * button that opened it. A drawer you can Tab out of leaves a sighted keyboard
 * user pressing Enter on links they cannot see.
 */
export function MobileMenu({
  locale,
  current,
  switchTo,
}: {
  locale: Locale;
  current?: PageKey;
  switchTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const copy = t(locale);
  const other = otherLocale(locale);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // The first link, not the container: a screen reader should land on
    // something it can announce.
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // The page behind must not scroll while a full-height drawer is over it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      (trigger.current ?? previouslyFocused)?.focus();
    };
  }, [open]);

  const items: { key: PageKey; label: string }[] = [
    { key: 'start', label: copy.nav.start },
    { key: 'services', label: copy.nav.services },
    { key: 'looks', label: copy.nav.looks },
    { key: 'studio', label: copy.nav.studio },
    { key: 'vouchers', label: copy.nav.vouchers },
    { key: 'stylist', label: copy.nav.stylist },
    { key: 'account', label: copy.nav.account },
  ];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button mobile-only"
        aria-label={copy.nav.openMenu}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={26} />
      </button>

      {open ? (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panel}
            className="drawer drawer--right"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="drawer-head">
              <h2 id={titleId} className="serif" style={{ fontSize: 28 }}>
                {copy.nav.menu}
              </h2>
              <button type="button" className="icon-button" aria-label={copy.nav.closeMenu} onClick={() => setOpen(false)}>
                <Close size={22} />
              </button>
            </div>

            <div className="drawer-body">
              <nav className="stack stack--1" aria-label={copy.nav.menu}>
                {items.map((item) => (
                  <Link
                    key={item.key}
                    href={path(locale, item.key)}
                    aria-current={current === item.key ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    style={{
                      padding: '14px 4px',
                      fontFamily: 'var(--font-head)',
                      fontSize: 26,
                      borderBottom: '1px solid var(--hairline-soft)',
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="row" style={{ marginTop: 'var(--s3)' }}>
                <span className="tiny muted">{copy.nav.language}</span>
                <div className="lang">
                  <Link href={locale === 'de' ? '#' : (switchTo ?? path('de', current ?? 'start'))} aria-current={locale === 'de'}>
                    DE
                  </Link>
                  <Link href={locale === 'en' ? '#' : (switchTo ?? path('en', current ?? 'start'))} aria-current={locale === 'en'}>
                    EN
                  </Link>
                </div>
              </div>
            </div>

            <div className="drawer-foot">
              <Link
                className="btn btn--primary btn--block"
                href={path(locale, 'booking')}
                onClick={() => setOpen(false)}
              >
                {copy.nav.book}
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
