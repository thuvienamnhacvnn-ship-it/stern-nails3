import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { isLocale, path, ROUTES, t, type Locale } from '@/lib/i18n';
import { bookingForManageToken } from '@/lib/booking';
import { formatCents, formatDuration } from '@/lib/money';
import { formatLongDate, formatTime } from '@/lib/time';
import { env } from '@/lib/env';
import { DemoBanner, Footer, Header, MobileNav, Petal } from '@/components/shell';
import { CalendarIcon, CheckCircle, Clock } from '@/components/icons';
import { CancelBooking } from '@/components/cancel-booking';

/**
 * The confirmation, and the page the emailed "manage your appointment" link
 * opens.
 *
 * The token in the path is the whole authorisation. It is random, stored only
 * as a hash, tied to exactly one booking and expires a day after the
 * appointment — so somebody who has the link can see and cancel that one
 * booking, and nothing else. Nothing about it can be derived from a booking
 * reference, which is why the reference can safely be printed here and read out
 * over the phone.
 */
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; page: string; token: string }>;
}) {
  const { locale: rawLocale, page: segment, token } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as Locale;

  // Only the confirmation route takes a token; every other page with a trailing
  // segment is a 404.
  if (segment !== ROUTES[locale].confirmation) notFound();

  const copy = t(locale);
  const booking = await bookingForManageToken(token);

  const body = booking ? (
    <Confirmed locale={locale} booking={booking} token={token} />
  ) : (
    <div className="confirm">
      <h1 className="confirm-title">{copy.common.notFound}</h1>
      <p className="lede">{copy.common.notFoundHint}</p>
      <Link className="btn btn--primary" href={path(locale, 'start')}>
        {copy.common.backHome}
      </Link>
    </div>
  );

  return (
    <div className="shell">
      <Header locale={locale} />
      <main className="shell-main" id="main">
        {body}
      </main>
      <div>
        {env.demoMode ? <DemoBanner locale={locale} /> : null}
        <Footer locale={locale} />
        <MobileNav locale={locale} />
      </div>
    </div>
  );
}

async function Confirmed({
  locale,
  booking,
  token,
}: {
  locale: Locale;
  booking: typeof schema.booking.$inferSelect;
  token: string;
}) {
  const copy = t(locale);
  const items = await db
    .select()
    .from(schema.bookingItem)
    .where(eq(schema.bookingItem.bookingId, booking.id))
    .orderBy(asc(schema.bookingItem.sortOrder));

  const service = items.find((item) => item.kind === 'service');
  const cancelled = booking.status === 'cancelled';

  return (
    <div className="confirm">
      <Petal position="tl" />
      <Petal position="br" />

      {cancelled ? null : <CheckCircle size={48} />}
      <h1 className="confirm-title">{cancelled ? copy.confirmation.cancelled : copy.confirmation.title}</h1>
      {cancelled ? null : <p className="lede">{copy.confirmation.subtitle}</p>}

      <div className="panel confirm-card">
        <span className="eyebrow">{locale === 'de' ? service?.nameDe : service?.nameEn}</span>

        {booking.startsAt ? (
          <>
            <span className="row row--tight">
              <CalendarIcon size={20} />
              {formatLongDate(booking.startsAt, locale)}
            </span>
            <span className="row row--tight">
              <Clock size={20} />
              {formatTime(booking.startsAt)} Uhr
              {service ? ` · ${formatDuration(service.durationMinutes, locale)}` : null}
            </span>
          </>
        ) : null}

        <hr style={{ border: 0, borderTop: '1px solid var(--hairline-soft)', margin: '4px 0' }} />

        <div className="row row--between">
          <span className="small muted">{copy.confirmation.reference}</span>
          <span className="strong" style={{ letterSpacing: '0.06em' }}>
            {booking.reference}
          </span>
        </div>

        {booking.totalCents !== null ? (
          <div className="row row--between">
            <span className="small muted">{copy.checkout.total}</span>
            <span className="strong">{formatCents(booking.totalCents - booking.discountCents, locale)}</span>
          </div>
        ) : null}

        {cancelled ? null : (
          <div className="row" style={{ marginTop: 'var(--s2)' }}>
            {/* The calendar file is generated per request from the booking row,
                so it stays correct if the appointment is moved. */}
            <a className="btn btn--ghost btn--sm" href={`/api/bookings/ics/${token}`} download>
              {copy.confirmation.addToCalendar}
            </a>
            <CancelBooking locale={locale} manageToken={token} />
          </div>
        )}
      </div>

      {env.demoMode ? <p className="tiny muted">{copy.confirmation.demoNote}</p> : null}

      <Link className="btn btn--text" href={path(locale, 'start')}>
        {copy.confirmation.backHome}
      </Link>
    </div>
  );
}
