'use client';

import { useEffect, useState } from 'react';
import { t, type Locale } from '@/lib/i18n';

/**
 * Light / dark / follow the system.
 *
 * The choice is written to `data-theme` on <html> and remembered in
 * localStorage. "System" removes the attribute entirely rather than storing a
 * resolved value, so a phone that switches at sunset keeps following it.
 *
 * Nothing renders until after mount. The server cannot know what a visitor
 * chose — that is in their browser — so rendering a guess would light up the
 * wrong button for a moment on every page load. The blank space is one icon
 * wide and the layout does not move when it fills.
 *
 * The attribute itself is set before first paint by the inline script in the
 * layout; this component only changes it afterwards.
 */

type Choice = 'light' | 'dark' | 'system';

const KEY = 'stern.theme';

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private window, or site data blocked. The choice still applies to this
    // page view; it simply will not be remembered.
  }
}

export function ThemeToggle({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    setChoice(stored === 'light' || stored === 'dark' ? stored : 'system');
  }, []);

  const options: { value: Choice; label: string }[] = [
    { value: 'light', label: copy.theme.light },
    { value: 'dark', label: copy.theme.dark },
    { value: 'system', label: copy.theme.system },
  ];

  return (
    <div className="theme-toggle" role="group" aria-label={copy.theme.label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          // Before mount nothing is pressed, which is honest: the component
          // genuinely does not know yet.
          aria-pressed={choice === option.value}
          onClick={() => {
            setChoice(option.value);
            apply(option.value);
          }}
        >
          <ThemeIcon kind={option.value} />
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Sun, moon, half-and-half. 18px on the same 1.4 stroke as the rest. */
function ThemeIcon({ kind }: { kind: Choice }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  if (kind === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.4 6.4 4.9 4.9M19.1 19.1l-1.5-1.5M17.6 6.4l1.5-1.5M4.9 19.1l1.5-1.5" />
      </svg>
    );
  }
  if (kind === 'dark') {
    return (
      <svg {...common}>
        <path d="M20 13.6A8.2 8.2 0 0 1 10.4 4a8.4 8.4 0 1 0 9.6 9.6Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
