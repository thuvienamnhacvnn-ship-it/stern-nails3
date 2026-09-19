import { notFound } from 'next/navigation';
import { isLocale, LOCALES, t, type Locale } from '@/lib/i18n';
import { env } from '@/lib/env';
import { PolishCursor } from '@/components/polish-cursor';

/**
 * The language layer.
 *
 * `lang` on <html> is set here because it changes with the segment, and it is
 * not cosmetic: it decides how a screen reader pronounces the page and how the
 * browser hyphenates it. An English page announced with German phonemes is
 * unusable long before anybody notices the wrong accent.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const copy = t(locale as Locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      {/*
        The inline script below sets `data-theme` before React hydrates, which
        is deliberate and is the whole point of it — but it means the attribute
        on this element legitimately differs from what the server rendered, and
        React flags that as a mismatch. `suppressHydrationWarning` applies to
        this element's own attributes only, not to its subtree, so it silences
        exactly the warning we caused and nothing else.
      */}
      <head>
        {/*
          The two faces above the fold are preloaded. Everything else — the
          heavier Cormorant weights, the script accent — arrives with the
          stylesheet, because preloading a font that is used once below the
          fold competes with the hero image for the same first connection.
        */}
        <link rel="preload" href="/fonts/manrope-400-normal-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link
          rel="preload"
          href="/fonts/cormorant-garamond-400-normal-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {copy.nav.skipToContent}
        </a>
        {children}
        {/* Draws nothing until a mouse moves, so a touch screen, a keyboard and
            a screenshot run are all untouched by it. */}
        <PolishCursor />
      </body>
    </html>
  );
}

export const metadata = {
  other: { 'x-demo-mode': env.demoMode ? '1' : '0' },
};
