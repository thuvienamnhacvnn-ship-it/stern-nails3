import Link from 'next/link';
import { DEFAULT_LOCALE, path, t } from '@/lib/i18n';

/** A 404 outside any locale — a mistyped path before the language segment. */
export default function NotFound() {
  const copy = t(DEFAULT_LOCALE);
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <main className="page" style={{ display: 'grid', placeContent: 'center', minHeight: '100dvh', gap: 'var(--s3)', textAlign: 'center' }}>
          <h1 className="serif" style={{ fontSize: 56 }}>404</h1>
          <p className="lede">{copy.common.notFound}</p>
          <Link className="btn btn--primary" href={path(DEFAULT_LOCALE, 'start')}>
            {copy.common.backHome}
          </Link>
        </main>
      </body>
    </html>
  );
}
