import Link from 'next/link';
import { brand } from '@/lib/media';
import { settings } from '@/lib/settings';
import { path, t, otherLocale, type Locale, type PageKey } from '@/lib/i18n';
import { ArrowRight, Facebook, Gift, Grid, Heart, Home, Instagram, TikTok, User, YouTube } from './icons';
import { MobileMenu } from './mobile-menu';

/**
 * The frame every page sits in: header, footer, and on a phone the bottom nav.
 *
 * The lockup is the delivered logo, split into its flower and its wordmark by
 * the asset build and set side by side here — which is how the design screens
 * show it, and lets the flower stay legible at 40px on a phone where the whole
 * stacked card would not.
 */

export function Logo({ locale, small = false }: { locale: Locale; small?: boolean }) {
  const mark = brand('logo');
  const copy = t(locale);

  /*
   * One picture, as delivered.
   *
   * It used to be two — a blossom crop beside a lettering crop — which is a
   * rearrangement of something somebody drew as a lockup: the stem runs out of
   * the flower and into the "S" of Stérn, and cutting between them cuts the
   * drawing. And it needed a second ink for the dark theme, because the old
   * lettering was flat olive. This one is gold, and gold reads on both.
   */
  return (
    <Link href={path(locale, 'start')} className="logo" aria-label={copy.brand.name}>
      <img
        src={mark.src}
        width={mark.width}
        height={mark.height}
        alt=""
        style={small ? { height: 56 } : undefined}
      />
    </Link>
  );
}

/** The five places in the top navigation, in order. */
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
  /** On the banner the header floats over the photograph with no surface of
   *  its own, so its type has to be cream regardless of the theme. */
  onHero = false,
}: {
  locale: Locale;
  current?: PageKey;
  switchTo?: string;
  onHero?: boolean;
}) {
  const copy = t(locale);
  const other = otherLocale(locale);

  return (
    <header className={`header${onHero ? ' header--onHero' : ''}`}>
      <Logo locale={locale} />

      {/* The menu and the tools are one group, centred together: the bar reads
          as a single cluster rather than as three things pushed apart. */}
      <div className="header-centre">
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

        <Link className={`btn desktop-only ${onHero ? 'btn--cream' : 'btn--primary'}`} href={path(locale, 'booking')}>
          {copy.nav.book}
          <ArrowRight size={18} />
        </Link>

        <MobileMenu locale={locale} current={current} switchTo={switchTo} />
      </div>
      </div>
    </header>
  );
}

export async function Footer({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const config = await settings();

  /*
   * Only the networks the studio has actually given us. The reference shows
   * four icons; an icon linking nowhere is worse than a gap, and these columns
   * are null until somebody types a URL into the admin.
   */
  const socials: { key: keyof typeof copy.social; href: string | null; icon: React.ReactNode }[] = [
    { key: 'instagram', href: config?.instagram ?? null, icon: <Instagram size={18} /> },
    { key: 'facebook', href: config?.facebook ?? null, icon: <Facebook size={18} /> },
    { key: 'tiktok', href: config?.tiktok ?? null, icon: <TikTok size={18} /> },
    { key: 'youtube', href: config?.youtube ?? null, icon: <YouTube size={18} /> },
  ];

  return (
    <footer className="footer">
      <nav className="footer-legal" aria-label={copy.common.imprint}>
        <Link href={path(locale, 'imprint')}>{copy.common.imprint}</Link>
        <Link href={path(locale, 'privacy')}>{copy.common.privacy}</Link>
      </nav>

      <span className="footer-claim">{copy.brand.claim}</span>

      {/*
        All four marks are always drawn, because the row is part of the design.
        Only the ones the studio has given a URL are links; the rest are inert
        and dimmed, and say so to a screen reader. A live-looking icon that goes
        nowhere would be worse than either.
      */}
      <nav className="footer-social" aria-label={copy.social.label}>
        {socials.map((item) =>
          item.href ? (
            <a
              key={item.key}
              href={item.href}
              // Both, or the opened page gets a handle on this one via opener.
              target="_blank"
              rel="noreferrer noopener"
              aria-label={copy.social[item.key]}
            >
              {item.icon}
            </a>
          ) : (
            <span key={item.key} className="is-pending" aria-hidden="true">
              {item.icon}
            </span>
          ),
        )}
      </nav>
    </footer>
  );
}

/**
 * The four-tab bar from the mobile screens. It is `position: sticky` inside the
 * page flow rather than fixed, so it cannot cover the last field of a form when
 * the on-screen keyboard is up.
 */
/**
 * The bar along the foot of the phone.
 *
 * Five places, and the middle one is the flower of the mark raised out of the
 * bar — the way a phone app puts its one action in the centre. That action is
 * booking an appointment, which is what the whole site is for; everything else
 * on the bar is somewhere to look first.
 *
 * The raised button is a link like the other four, not a button: it goes to a
 * page, so it has to be something you can open in a new tab, and it carries a
 * proper label rather than only the mark.
 */
export function MobileNav({ locale, current }: { locale: Locale; current?: PageKey }) {
  const copy = t(locale);
  const flower = brand('flower');

  const left: { key: PageKey; label: string; icon: React.ReactNode }[] = [
    { key: 'start', label: copy.nav.mobile.start, icon: <Home size={22} /> },
    { key: 'looks', label: copy.nav.mobile.looks, icon: <Grid size={22} /> },
  ];
  const right: { key: PageKey; label: string; icon: React.ReactNode }[] = [
    { key: 'vouchers', label: copy.nav.vouchers, icon: <Gift size={22} /> },
    { key: 'account', label: copy.nav.mobile.account, icon: <User size={22} /> },
  ];

  const tab = (item: { key: PageKey; label: string; icon: React.ReactNode }) => (
    <Link key={item.key} href={path(locale, item.key)} aria-current={current === item.key ? 'page' : undefined}>
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );

  return (
    <nav className="mobile-nav mobile-only" aria-label={copy.nav.menu}>
      {left.map(tab)}

      <Link
        className="mobile-nav-book"
        href={path(locale, 'booking')}
        aria-current={current === 'booking' ? 'page' : undefined}
      >
        <span className="mobile-nav-orb" aria-hidden="true">
          <img src={flower.src} width={flower.width} height={flower.height} alt="" />
        </span>
        <span>{copy.nav.mobile.book}</span>
      </Link>

      {right.map(tab)}
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
