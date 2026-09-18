import Link from 'next/link';
import { t, type Locale } from '@/lib/i18n';
import { ChevronLeft, ChevronRight } from './icons';
import { formatMonthYear as monthLabel } from '@/lib/time';

/**
 * The month grid, Monday first.
 *
 * Each day is a link rather than a button so the calendar works before
 * hydration and a particular day can be shared. The grid is always six rows,
 * which stops the panel changing height between a 28-day February and a
 * 31-day month that starts on a Sunday.
 */
export function MonthCalendar({
  locale,
  year,
  month,
  days,
  basePath,
  query,
  extras,
}: {
  locale: Locale;
  year: number;
  month: number;
  days: { iso: string; day: number; inMonth: boolean; disabled: boolean; selected: boolean }[];
  basePath: string;
  query: Record<string, string>;
  extras: string[];
}) {
  const copy = t(locale);

  const href = (iso: string) => {
    const params = new URLSearchParams(query);
    for (const extra of extras) params.append('extra', extra);
    params.set('date', iso);
    return `${basePath}?${params}`;
  };

  const shift = (delta: number) => {
    const probe = new Date(Date.UTC(year, month - 1 + delta, 1));
    const iso = `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, '0')}-01`;
    return href(iso);
  };

  return (
    <div className="calendar">
      <div className="calendar-head">
        <Link className="round-arrow" href={shift(-1)} aria-label={copy.booking.previousMonth}>
          <ChevronLeft size={20} />
        </Link>
        <h2 className="calendar-title">{monthLabel(year, month, locale)}</h2>
        <Link className="round-arrow" href={shift(1)} aria-label={copy.booking.nextMonth}>
          <ChevronRight size={20} />
        </Link>
      </div>

      <div className="calendar-grid" role="grid" aria-label={monthLabel(year, month, locale)}>
        {copy.booking.weekdays.map((weekday) => (
          <span key={weekday} className="calendar-weekday" role="columnheader">
            {weekday}
          </span>
        ))}
        {days.map((day) =>
          day.disabled ? (
            <span
              key={day.iso}
              className="calendar-day"
              data-outside={!day.inMonth}
              aria-disabled="true"
              style={{ color: '#bfb9a8' }}
            >
              {day.day}
            </span>
          ) : (
            <Link
              key={day.iso}
              className="calendar-day"
              href={href(day.iso)}
              data-outside={!day.inMonth}
              aria-pressed={day.selected}
              scroll={false}
            >
              {day.day}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
