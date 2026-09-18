'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';

/**
 * The time chips.
 *
 * Choosing one writes `time` into the URL with `replace`, so the summary panel
 * updates from the server without adding a history entry per tap — pressing
 * back should leave the booking, not step through every time you considered.
 */
export function SlotPicker({
  locale,
  slots,
  selected,
}: {
  locale: Locale;
  slots: { label: string; startsAt: string }[];
  selected: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const copy = t(locale);

  function choose(label: string) {
    const next = new URLSearchParams(params.toString());
    next.set('time', label);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="slot-grid" role="group" aria-label={copy.booking.chooseTime}>
      {slots.map((slot) => (
        <button
          key={slot.startsAt}
          type="button"
          className="slot"
          aria-pressed={selected === slot.label}
          onClick={() => choose(slot.label)}
        >
          {slot.label}
        </button>
      ))}
    </div>
  );
}
