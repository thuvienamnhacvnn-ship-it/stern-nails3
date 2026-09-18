import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { formatCents, formatDuration, formatPrice } from '@/lib/money';
import { formatLongDate, formatTime } from '@/lib/time';
import { activeHold } from '@/lib/booking';
import { hasPhoto, type PhotoId } from '@/lib/media';
import { settings } from '@/lib/settings';
import { env } from '@/lib/env';
import { currentCustomer } from '@/lib/auth';
import { Photo } from '@/components/image';
import { Motto, Petal } from '@/components/shell';
import { CalendarIcon, Clock } from '@/components/icons';
import { Stepper } from '@/components/stepper';
import { CheckoutForm } from '@/components/checkout-form';

/**
 * Review and confirm, following 05-checkout.
 *
 * Everything shown here is read back from the booking row, not from the URL:
 * the items, the duration and the total were written when the slot was held,
 * from the service records, and this page is a mirror of that. A tampered query
 * string changes nothing it shows and nothing it charges.
 */
export async function CheckoutPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const bookingId = typeof query.booking === 'string' ? query.booking : null;

  if (!bookingId) return <Expired locale={locale} reason="missing" />;

  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId)).limit(1);
  if (!booking) return <Expired locale={locale} reason="missing" />;

  // Already done: a refresh of the checkout page after confirming should land
  // on the confirmation, not offer to book it again.
  if (booking.status === 'confirmed') {
    return <AlreadyConfirmed locale={locale} reference={booking.reference} />;
  }

  const hold = await activeHold(bookingId);
  if (!hold) return <Expired locale={locale} reason="hold" />;

  const items = await db
    .select()
    .from(schema.bookingItem)
    .where(eq(schema.bookingItem.bookingId, bookingId))
    .orderBy(asc(schema.bookingItem.sortOrder));

  const [serviceItem] = items.filter((item) => item.kind === 'service');
  const service = serviceItem?.serviceId
    ? (await db.select().from(schema.service).where(eq(schema.service.id, serviceItem.serviceId)).limit(1))[0]
    : undefined;

  const look = booking.lookId
    ? (await db.select().from(schema.look).where(eq(schema.look.id, booking.lookId)).limit(1))[0]
    : undefined;

  const config = await settings();
  const customer = await currentCustomer();

  // Only the methods the owner has switched on. In demo mode card and PayPal
  // run on the fake provider and say so.
  const methods = (config?.paymentMethods ?? ['on_site']).filter((method) =>
    ['on_site', 'card', 'paypal'].includes(method),
  ) as ('on_site' | 'card' | 'paypal')[];

  const name = (row: { nameDe: string; nameEn: string }) => (locale === 'de' ? row.nameDe : row.nameEn);
  const mediaSlug = look?.mediaSlug ?? service?.mediaSlug ?? null;

  return (
    <div className="checkout">
      <Petal position="tl" />
      <Petal position="br" />

      <section className="checkout-rail desktop-only">
        <Motto locale={locale} />
        <p className="script" style={{ fontSize: 40, lineHeight: 1.2 }}>
          Schöne Nägel.
          <br />
          Schöner Alltag.
        </p>
      </section>

      <section className="checkout-main">
        <Stepper locale={locale} current={4} />
        <div className="stack stack--1">
          <h1 className="checkout-title">{copy.checkout.title}</h1>
          <p className="lede">{copy.checkout.subtitle}</p>
        </div>

        <CheckoutForm
          locale={locale}
          bookingId={booking.id}
          methods={methods}
          demoMode={env.demoMode}
          canPayOnline={booking.totalCents !== null}
          holdExpiresAt={hold.expiresAt.toISOString()}
          defaults={{
            firstName: customer?.firstName ?? '',
            lastName: customer?.lastName ?? '',
            email: customer?.email ?? '',
            phone: customer?.phone ?? '',
          }}
        />
      </section>

      <aside className="checkout-summary" aria-label={copy.checkout.yourAppointment}>
        <div className="media checkout-summary-media">
          {mediaSlug && hasPhoto(mediaSlug) ? (
            <Photo id={mediaSlug as PhotoId} alt="" sizes="(max-width: 1099px) 100vw, 420px" focalPoint="70% 50%" />
          ) : null}
          <span className="overlay">
            <span className="serif" style={{ fontSize: 34 }}>
              {service ? name(service) : ''}
            </span>
            <span className="small muted">{formatDuration(booking.endsAt && booking.startsAt
              ? Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000)
              : (serviceItem?.durationMinutes ?? 0), locale)}</span>
            <span className="tiny muted" style={{ maxWidth: '22ch', marginTop: 8 }}>
              {service ? (locale === 'de' ? service.teaserDe : service.teaserEn) : ''}
            </span>
          </span>
        </div>

        <div className="checkout-summary-body">
          <h2 className="serif" style={{ fontSize: 26 }}>
            {copy.checkout.yourAppointment}
          </h2>
          {booking.startsAt ? (
            <>
              <span className="row row--tight small">
                <CalendarIcon size={20} />
                {formatLongDate(booking.startsAt, locale)}
              </span>
              <span className="row row--tight small">
                <Clock size={20} />
                {formatTime(booking.startsAt)} Uhr
              </span>
            </>
          ) : null}

          <hr style={{ border: 0, borderTop: '1px solid var(--hairline-soft)', margin: '8px 0' }} />

          <h2 className="serif" style={{ fontSize: 26 }}>
            {copy.checkout.priceSummary}
          </h2>
          {items
            // A variant that costs nothing extra is part of what was chosen,
            // not a line on the bill; printing "Klassisch weiß … 0,00 €" reads
            // like a mistake.
            .filter((item) => item.kind === 'service' || item.priceCents === null || item.priceCents !== 0)
            .map((item) => (
              <div key={item.id} className="summary-line small">
                <span className="muted">
                  {name(item)}
                  {item.kind === 'service' ? ` ${formatDuration(item.durationMinutes, locale)}` : null}
                </span>
                <span>
                  {item.priceCents === null
                    ? formatPrice(null, locale)
                    : `${item.kind === 'service' ? '' : '+ '}${formatCents(item.priceCents, locale)}`}
                </span>
              </div>
            ))}

          {/* The chosen variant still belongs on the page — just as part of the
              service, rather than as a zero-euro line item. */}
          {items.some((item) => item.kind === 'variant' && item.priceCents === 0) ? (
            <p className="tiny muted">
              {items.find((item) => item.kind === 'variant')
                ? name(items.find((item) => item.kind === 'variant')!)
                : null}
            </p>
          ) : null}

          {booking.discountCents > 0 ? (
            <div className="summary-line small">
              <span className="muted">{copy.checkout.voucherApplied}</span>
              <span>−{formatCents(booking.discountCents, locale)}</span>
            </div>
          ) : null}

          <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: '8px 0' }} />

          <div className="summary-line">
            <span className="summary-total">{copy.checkout.total}</span>
            <span className="summary-total">
              {booking.totalCents === null
                ? formatPrice(null, locale)
                : formatCents(Math.max(0, booking.totalCents - booking.discountCents), locale)}
            </span>
          </div>

          <p className="tiny muted">
            {copy.checkout.legal(copy.checkout.terms, copy.checkout.privacy)
              .replace(copy.checkout.terms, copy.checkout.terms)}
          </p>
          <p className="tiny">
            <Link href={path(locale, 'privacy')} style={{ textDecoration: 'underline' }}>
              {copy.checkout.privacy}
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}

function Expired({ locale, reason }: { locale: Locale; reason: 'missing' | 'hold' }) {
  const copy = t(locale);
  return (
    <div className="confirm">
      <h1 className="confirm-title">{reason === 'hold' ? copy.booking.holdExpired : copy.common.notFound}</h1>
      <p className="lede">{copy.common.notFoundHint}</p>
      <Link className="btn btn--primary" href={path(locale, 'booking')}>
        {copy.nav.book}
      </Link>
    </div>
  );
}

function AlreadyConfirmed({ locale, reference }: { locale: Locale; reference: string }) {
  const copy = t(locale);
  return (
    <div className="confirm">
      <h1 className="confirm-title">{copy.confirmation.title}</h1>
      <p className="lede">{copy.confirmation.subtitle}</p>
      <p className="small muted">
        {copy.confirmation.reference}: <span className="strong">{reference}</span>
      </p>
      <Link className="btn btn--primary" href={path(locale, 'start')}>
        {copy.confirmation.backHome}
      </Link>
    </div>
  );
}
