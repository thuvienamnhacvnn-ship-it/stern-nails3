'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef } from 'react';
import { t, type Locale } from '@/lib/i18n';
import { Users } from './icons';

/**
 * The "Team" select on the booking page.
 *
 * It is a real <form method="get"> with a submit button, so it works with
 * JavaScript off and before hydration. Once hydrated, changing the select
 * navigates immediately and the button hides itself — which is the behaviour
 * the design shows, without the version that only works for people whose
 * scripts loaded.
 *
 * Changing who does the work changes which times are free, so this navigates
 * rather than filtering in place: the new slot list comes from the server.
 */
export function StaffPicker({
  locale,
  action,
  hidden,
  staff,
  selected,
}: {
  locale: Locale;
  action: string;
  /** The rest of the draft, carried across as hidden fields. */
  hidden: { name: string; value: string }[];
  staff: { slug: string; name: string }[];
  selected: string | null;
}) {
  const copy = t(locale);
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);

  function change(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set('staff', value);
    else next.delete('staff');
    // The chosen time may not exist for this person; the server decides, and a
    // stale `time` in the URL would show a selection that is not offered.
    next.delete('time');
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <form ref={form} method="get" action={action} className="stack stack--1">
      {hidden.map((field, index) => (
        <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />
      ))}

      <div className="row row--nowrap" style={{ gap: 10 }}>
        <span className="icon-button" aria-hidden="true">
          <Users size={20} />
        </span>
        <select
          id="staff-picker"
          name="staff"
          className="select grow"
          defaultValue={selected ?? ''}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">{copy.booking.anyStaff}</option>
          {staff.map((member) => (
            <option key={member.slug} value={member.slug}>
              {member.name}
            </option>
          ))}
        </select>
        {/* Hidden once scripts run; the select navigates on its own by then. */}
        <noscript>
          <button type="submit" className="btn btn--ghost btn--sm">
            {copy.common.confirm}
          </button>
        </noscript>
      </div>

      {selected ? null : <p className="tiny muted">{copy.booking.anyStaffHint}</p>}
    </form>
  );
}
