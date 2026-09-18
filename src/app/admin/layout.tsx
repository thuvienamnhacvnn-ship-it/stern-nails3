import type { Metadata } from 'next';
import '../globals.css';
import '../pages.css';

/**
 * The admin shell.
 *
 * Its own document rather than a section of the customer site: it has a
 * different session cookie, a different navigation and no reason to load the
 * customer pages' client components. `noindex` is on every page here regardless
 * of what the rest of the site does.
 */
export const metadata: Metadata = {
  title: { default: 'Studio Admin · Stern Nails 3', template: '%s · Studio Admin' },
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: '/media/brand/flower.png' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
