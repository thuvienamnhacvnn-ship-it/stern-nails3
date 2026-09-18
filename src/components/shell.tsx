import Link from 'next/link';
import { brand } from '@/lib/media';
import { path, t, otherLocale, type Locale, type PageKey } from '@/lib/i18n';
import { ArrowRight, CalendarIcon, Grid, Heart, Home, User } from './icons';
import { MobileMenu } from './mobile-menu';
import { ThemeToggle } from './theme-toggle';

/**
 * The frame every page sits in: header, footer, and on a phone the bottom nav.
 *
 * The lockup is the delivered logo, split into its flower and its wordmark by
 * the asset build and set side by side here — which is how the design screens
 * show it, and lets the flower stay legible at 40px on a phone where the whole
 * stacked card would not.
 */

export function Logo({ locale, small = false }: { locale: Locale; small?: boolean }) {
  const flower = brand('flower');
  const word = brand('wordmark');
  const wordDark = brand('wordmark-dark');
  const copy = t(locale);

  /*
   * The flower carries both themes on its own — sage and blush read against
   * cream and against near-black alike. The wordmark does not: it is moulded in
   * dark olive, which is a hole rather than a word on a dark page. So both inks
   * are in the markup and CSS shows one.
   *
   * Both, rather than a `<picture>` or a swap in JavaScript: a media query
   * cannot see a theme somebody chose by hand, and swapping the `src` after
   * hydration would flash the wrong ink on every load. The hidden one is a few
   * kilobytes and is fetched once.
   */
  return (
    <Link href={path(locale, 'start')} className="logo" aria-label={copy.brand.name}>
      <img
        className="logo-flower"
        src={flower.src}
        width={flower.width}
        height={flower.height}
        alt=""
        style={small ? { width: 40 } : undefined}
      />
      <img
        className="logo-word logo-word--light"
        src={word.src}
        width={word.width}
        height={word.height}
        alt=""
        style={small ? { width: 88 } : undefined}
      />
      <img
        className="logo-word logo-word--dark"
        src={wordDark.src}
        width={wordDark.width}
        height={wordDark.height}
        alt=""
        style={small ? { width: 88 } : undefined}
      />
    </Link>
  );
}

const NAV: { key: PageKey; label: (c: ReturnType<typeof t>) => string }[] = [
  { key: 'start', label: (c) => c.nav.start },
  { key: 'services', label: (c) => c.nav.services },
  { key: 'looks', label: (c) => c.nav.looks },
  { key: 'studio', label: (c) => c.nav.studio },
  { key: 'vouchers', label: (c) => c.nav.vouchers },
];

export function Header({
  locale,
  current,
  /** The same page in the other language, so switching does not lose your place. */
  switchTo,
}: {
  locale: Locale;
  current?: PageKey;
  switchTo?: string;
}) {
  const copy = t(locale);
  const other = otherLocale(locale);

  return (
    <header className="header">
      <Logo locale={locale} />

      <nav className="nav" aria-label={copy.nav.menu}>
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={path(locale, item.key)}
            aria-current={current === item.key ? 'page' : undefined}
          >
            {item.label(copy)}
          </Link>
        ))}
      </nav>

      <div className="header-tools">
        <div className="lang desktop-only" role="group" aria-label={copy.nav.language}>
          <Link href={locale === 'de' ? '#' : (switchTo ?? path('de', current ?? 'start'))} aria-current={locale === 'de'} hrefLang="de">
            DE
          </Link>
          <Link href={locale === 'en' ? '#' : (switchTo ?? path('en', current ?? 'start'))} aria-current={locale === 'en'} hrefLang="en">
            EN
          </Link>
        </div>

        <ThemeToggle locale={locale} />

        <Link className="icon-button desktop-only" href={path(locale, 'account')} aria-label={copy.nav.account}>
          <User size={22} />
        </Link>
        <Link
          className="icon-button desktop-only"
          href={`${path(locale, 'looks')}?favorites=1`}
          aria-label={copy.nav.favorites}
        >
          <Heart size={22} />
        </Link>

        <Link className="btn btn--primary desktop-only" href={path(locale, 'booking')}>
          {copy.nav.book}
          <ArrowRight size={18} />
        </Link>

        <MobileMenu locale={locale} current={current} switchTo={switchTo} />
      </div>
    </header>
  );
}

export function Footer({ locale }: { locale: Locale }) {
  const copy = t(locale);
  return (
    <footer className="footer">
      <nav aria-label={copy.common.imprint}>
        <Link href={path(locale, 'imprint')}>{copy.common.imprint}</Link>
        <Link href={path(locale, 'privacy')}>{copy.common.privacy}</Link>
      </nav>
      <span className="footer-claim">
        {copy.brand.claim}
        <Heart size={14} />
      </span>
    </footer>
  );
}

/**
 * The four-tab bar from the mobile screens. It is `position: sticky` inside the
 * page flow rather than fixed, so it cannot cover the last field of a form when
 * the on-screen keyboard is up.
 */
export function MobileNav({ locale, current }: { locale: Locale; current?: PageKey }) {
  const copy = t(locale);
  const tabs: { key: PageKey; label: string; icon: React.ReactNode }[] = [
    { key: 'start', label: copy.nav.mobile.start, icon: <Home size={22} /> },
    { key: 'looks', label: copy.nav.mobile.looks, icon: <Grid size={22} /> },
    { key: 'booking', label: copy.nav.mobile.book, icon: <CalendarIcon size={22} /> },
    { key: 'account', label: copy.nav.mobile.account, icon: <User size={22} /> },
  ];
  return (
    <nav className="mobile-nav mobile-only" aria-label={copy.nav.menu}>
      {tabs.map((tab) => (
        <Link key={tab.key} href={path(locale, tab.key)} aria-current={current === tab.key ? 'page' : undefined}>
          {tab.icon}
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * The demo strip.
 *
 * It is not subtle on purpose: every price, every member of staff and every
 * appointment in this build is example data, and somebody showing the site to a
 * customer must not be able to forget that.
 */
export function DemoBanner({ locale }: { locale: Locale }) {
  const copy = t(locale);
  return (
    <div className="demo-banner" role="note">
      <span className="badge">{copy.common.demo}</span>
      <span>{copy.common.demoBanner}</span>
    </div>
  );
}

/** The three decorative folded petals from the design screens. */
export function Petal({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const flower = brand('flower');
  return (
    <div className={`petal petal--${position}`} aria-hidden="true">
      <img src={flower.src} width={flower.width} height={flower.height} alt="" />
    </div>
  );
}

/** The vertical BEAUTY / CARE / GOOD VIBES motto in the left rail. */
export function Motto({ locale }: { locale: Locale }) {
  const copy = t(locale);
  return (
    <div className="motto" aria-hidden="true">
      {copy.brand.motto.map((word) => (
        <span key={word}>{word}</span>
      ))}
    </div>
  );
}
