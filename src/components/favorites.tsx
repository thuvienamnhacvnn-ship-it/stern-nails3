'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';
import { Heart } from './icons';

/**
 * Favourites, before and after signing in.
 *
 * A visitor with no account keeps their hearts in localStorage, because asking
 * somebody to register before they can save a picture they like is a good way
 * to lose them. Once they sign in, `FavoritesSync` posts whatever is in local
 * storage to the server, merges it with what is already there, and clears the
 * local copy — so a heart tapped on the bus is still there on the laptop.
 *
 * Every localStorage access is wrapped: in a private window, or with site data
 * blocked, the accessor throws rather than returning null, and an unguarded
 * read takes the whole page down.
 */

const KEY = 'stern.favorites';

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    // Storage is unavailable or full. The heart still works for this page view;
    // it simply will not be remembered, which is better than an error.
  }
}

export function FavoriteButton({
  locale,
  lookSlug,
  initial,
  signedIn,
}: {
  locale: Locale;
  lookSlug: string;
  initial: boolean;
  signedIn: boolean;
}) {
  const [active, setActive] = useState(initial);
  const copy = t(locale);

  // For a signed-out visitor the server cannot know the answer, so the button
  // corrects itself from local storage after mount. The initial render is the
  // server's, which keeps the markup stable through hydration.
  useEffect(() => {
    if (!signedIn) setActive(readLocal().includes(lookSlug));
  }, [signedIn, lookSlug]);

  async function toggle() {
    const next = !active;
    setActive(next);

    if (signedIn) {
      try {
        await fetch('/api/account/favorites', {
          method: next ? 'POST' : 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lookSlug }),
        });
      } catch {
        setActive(!next); // Put the heart back if the write did not land.
      }
      return;
    }

    const current = readLocal();
    writeLocal(next ? [...new Set([...current, lookSlug])] : current.filter((slug) => slug !== lookSlug));
  }

  return (
    <button
      type="button"
      className="look-fav"
      aria-pressed={active}
      aria-label={active ? copy.looks.unfavorite : copy.looks.favorite}
      onClick={toggle}
    >
      <Heart size={20} filled={active} />
    </button>
  );
}

/** Pushes locally saved favourites to the account, once, after signing in. */
export function FavoritesSync({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!signedIn) return;
    const local = readLocal();
    if (local.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/account/favorites', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lookSlugs: local }),
        });
        if (!response.ok || cancelled) return;
        writeLocal([]);
        router.refresh();
      } catch {
        // Try again next time the page loads; nothing is lost either way.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);

  return null;
}
