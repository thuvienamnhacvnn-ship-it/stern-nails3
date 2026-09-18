'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { path, t, type Locale } from '@/lib/i18n';
import { Search } from './icons';

/**
 * The search box on the lookbook.
 *
 * It writes into the URL rather than into component state, so a search is a
 * link and the back button undoes it. The write is debounced and uses `replace`,
 * which keeps one history entry per search instead of one per keystroke — three
 * hundred back presses to leave a page is the classic version of this bug.
 */
export function LookSearch({ locale, initial }: { locale: Locale; initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const first = useRef(true);

  useEffect(() => {
    // Skip the mount pass, or landing on a filtered URL immediately rewrites it.
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      // A new search invalidates whichever look was open.
      next.delete('look');
      router.replace(`${path(locale, 'looks')}${next.size ? `?${next}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, locale, params, router]);

  const copy = t(locale);

  return (
    <div className="search">
      <Search size={22} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={copy.looks.searchPlaceholder}
        aria-label={copy.looks.searchPlaceholder}
      />
    </div>
  );
}
