import type { Metadata, Viewport } from 'next';
import './globals.css';
import './pages.css';

/**
 * The document. Everything that is per-language lives one level down, in
 * [locale]/layout, because the `lang` attribute has to change with the copy.
 */
export const metadata: Metadata = {
  title: { default: 'Stern Nails 3', template: '%s · Stern Nails 3' },
  description: 'Nagelstudio Stern Nails 3 – Maniküre, Modellage, Pediküre und Nail Looks.',
  icons: { icon: '/media/brand/flower.png' },
  // Nothing here is meant for a search index until the studio has approved the
  // content and filled in the missing business details.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximum-scale and no user-scalable=no: pinch zoom stays available.
  //
  // Two theme colours so the phone's own browser bar matches the page instead
  // of staying cream above a dark site.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f2e9' },
    { media: '(prefers-color-scheme: dark)', color: '#1e241c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
