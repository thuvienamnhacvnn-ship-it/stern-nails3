'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { path, t, type Locale } from '@/lib/i18n';
import { ArrowRight, CalendarIcon, Leaf, Users } from './icons';

/**
 * The floating booking bar from the home and services screens.
 *
 * It is a form, not three decorative selects: submitting it navigates to the
 * booking page with the chosen service, member of staff and date already in the
 * query string, so the customer arrives at step three rather than step one.
 *
 * Nothing is validated into an error here. An empty service simply lands on the
 * first step, which is where choosing one belongs.
 */
export function BookingDock({
  locale,
  services,
  staff,
  compact = false,
  onHero = false,
  defaultService,
}: {
  locale: Locale;
  services: { slug: string; name: string }[];
  staff: { slug: string; name: string }[];
  /** The mobile variant drops the team field, as the mobile screen does. */
  compact?: boolean;
  /** On the banner the bar is smoked glass over the photograph, not a cream
   *  pill on a cream page. */
  onHero?: boolean;
  defaultService?: string;
}) {
  const router = useRouter();
  const copy = t(locale);
  const [service, setService] = useState(defaultService ?? '');
  const [member, setMember] = useState('');
  const [date, setDate] = useState('');

  // `min` keeps the native picker from offering a date in the past; the server
  // decides what is actually bookable regardless of what arrives.
  const today = new Date().toISOString().slice(0, 10);

  /** `22.09.2026` in German, `22 Sep 2026` in English. */
  function formatChosen(value: string, forLocale: Locale) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(forLocale === 'de' ? 'de-DE' : 'en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: forLocale === 'de' ? '2-digit' : 'short',
      year: 'numeric',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams();
    if (service) query.set('service', service);
    if (member) query.set('staff', member);
    if (date) query.set('date', date);
    router.push(`${path(locale, 'booking')}${query.size ? `?${query}` : ''}`);
  }

  return (
    <form className={`dock${onHero ? ' dock--onHero' : ''}`} onSubmit={submit}>
      <div className="dock-fields">
        <div className="dock-field">
          <Leaf size={22} />
          <div className="dock-field-body">
            <label className="dock-field-label" htmlFor="dock-service">
              {copy.dock.service}
            </label>
            <select id="dock-service" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">{copy.dock.choose}</option>
              {services.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {compact ? null : (
          <div className="dock-field dock-field--team">
            <Users size={22} />
            <div className="dock-field-body">
              <label className="dock-field-label" htmlFor="dock-staff">
                {copy.dock.team}
              </label>
              <select id="dock-staff" value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="">{copy.dock.any}</option>
                {staff.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="dock-field dock-field--date">
          <CalendarIcon size={22} />
          <div className="dock-field-body">
            <label className="dock-field-label" htmlFor="dock-date">
              {copy.dock.date}
            </label>
            {/*
              A real <input type="date"> — the brief asks for an accessible
              date picker, and the native one is the only control that already
              works with a screen reader, a keyboard and a phone's own picker.
              It is laid over the text below and made transparent, because an
              empty one renders the browser's locale placeholder (mm/dd/yyyy on
              a US-English browser) where the design says "Bitte wählen". The
              input keeps its label, its focus ring and its whole keyboard
              behaviour; only its paint is borrowed.
            */}
            <span className="dock-date">
              <span aria-hidden="true">{date ? formatChosen(date, locale) : copy.dock.choose}</span>
              <input
                id="dock-date"
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </span>
          </div>
        </div>
      </div>

      <button type="submit" className={`btn ${onHero ? 'btn--cream' : 'btn--primary'}`}>
        {compact ? copy.nav.book : copy.dock.find}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
