import { notFound } from 'next/navigation';
import { isLocale, ROUTES, path, t, type Locale, type PageKey } from '@/lib/i18n';
import { env } from '@/lib/env';
import { DemoBanner, Footer, Header, MobileNav } from '@/components/shell';

import { HomePage } from '../_pages/home';
import { ServicesPage } from '../_pages/services';
import { LooksPage } from '../_pages/looks';
import { BookingPage } from '../_pages/booking';
import { CheckoutPage } from '../_pages/checkout';
import { StudioPage } from '../_pages/studio';
import { VouchersPage } from '../_pages/vouchers';
import { AccountPage } from '../_pages/account';
import { StylistPage } from '../_pages/stylist';
import { ImprintPage, PrivacyPage } from '../_pages/legal';

/**
 * One route for every customer-facing page.
 *
 * The segment is the translated word — `/de/leistungen`, `/en/services` — so
 * an English visitor never sees a German path. This file turns that word back
 * into a page key and hands off; the alternative, a folder per translated
 * segment, would be two of everything and would drift the first time a word
 * changed.
 *
 * Unknown segments fall through to the 404, which is rendered in the same shell
 * rather than as a bare page.
 */

type Params = { locale: string; page: string };

function resolve(locale: Locale, segment: string): PageKey | null {
  const entries = Object.entries(ROUTES[locale]) as [PageKey, string][];
  return entries.find(([, value]) => value === segment)?.[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { locale, page } = await params;
  if (!isLocale(locale)) return {};
  const key = resolve(locale, page);
  if (!key) return {};
  const copy = t(locale);

  const titles: Record<PageKey, string> = {
    start: copy.home.title,
    services: copy.services.title,
    looks: copy.looks.title,
    booking: copy.booking.title,
    checkout: copy.checkout.title,
    confirmation: copy.confirmation.title,
    studio: copy.studio.title,
    vouchers: copy.vouchers.title,
    account: copy.account.title,
    stylist: copy.nav.stylist,
    imprint: copy.common.imprint,
    privacy: copy.common.privacy,
  };
  return { title: titles[key] };
}

/**
 * Which pages are designed to hold one screen without the document scrolling,
 * and which need the dock spacing. Anything not listed simply scrolls, which is
 * the right behaviour for the long-form pages.
 */
const FIXED_HEIGHT: PageKey[] = ['start', 'services', 'looks', 'booking', 'studio', 'vouchers', 'stylist', 'account'];

/**
 * Pages whose photograph runs edge to edge behind the header. The header then
 * has no surface of its own and floats over the picture, so the shell gives up
 * its header row and lets the content start at the very top.
 */
const FULL_BLEED: PageKey[] = ['start', 'studio'];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: rawLocale, page: segment } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as Locale;

  const key = resolve(locale, segment);
  if (!key) notFound();

  const query = await searchParams;
  const copy = t(locale);

  // The same page in the other language, so the DE/EN switch keeps your place
  // instead of dropping you on the start page.
  const switchTo = path(locale === 'de' ? 'en' : 'de', key);

  const body = await renderPage(key, locale, query);

  const onHero = FULL_BLEED.includes(key);

  return (
    <div
      className={`shell${FIXED_HEIGHT.includes(key) ? ' shell--fixed' : ''}${onHero ? ' shell--banner' : ''}`}
    >
      <Header locale={locale} current={key} switchTo={switchTo} onHero={onHero} />
      <main className="shell-main" id="main">
        {body}
      </main>
      <div>
        {env.demoMode ? <DemoBanner locale={locale} /> : null}
        <Footer locale={locale} />
        <MobileNav locale={locale} current={key} />
      </div>
    </div>
  );
}

async function renderPage(
  key: PageKey,
  locale: Locale,
  query: Record<string, string | string[] | undefined>,
) {
  switch (key) {
    case 'start':
      return <HomePage locale={locale} query={query} />;
    case 'services':
      return <ServicesPage locale={locale} query={query} />;
    case 'looks':
      return <LooksPage locale={locale} query={query} />;
    case 'booking':
      return <BookingPage locale={locale} query={query} />;
    case 'checkout':
      return <CheckoutPage locale={locale} query={query} />;
    case 'confirmation':
      // Without a token there is nothing to show; the confirmation lives at
      // /<locale>/<confirmation>/<token>.
      return <ConfirmationMissing locale={locale} />;
    case 'studio':
      return <StudioPage locale={locale} query={query} />;
    case 'vouchers':
      return <VouchersPage locale={locale} />;
    case 'account':
      return <AccountPage locale={locale} query={query} />;
    case 'stylist':
      return <StylistPage locale={locale} />;
    case 'imprint':
      return <ImprintPage locale={locale} />;
    case 'privacy':
      return <PrivacyPage locale={locale} />;
  }
}

function ConfirmationMissing({ locale }: { locale: Locale }) {
  const copy = t(locale);
  return (
    <div className="confirm">
      <h1 className="confirm-title">{copy.common.notFound}</h1>
      <p className="lede">{copy.common.notFoundHint}</p>
      <a className="btn btn--primary" href={path(locale, 'start')}>
        {copy.common.backHome}
      </a>
    </div>
  );
}
