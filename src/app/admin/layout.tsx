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
  // suppressHydrationWarning: the pre-paint script below sets data-theme on
  // <html> before React hydrates, so that attribute legitimately differs from
  // what the server rendered. See [locale]/layout.tsx for the full reasoning.
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* The same pre-paint theme guard as the customer site; the admin is a
            separate document and would otherwise flash on every load. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('stern.theme');" +
              "if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
