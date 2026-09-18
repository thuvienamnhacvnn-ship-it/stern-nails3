import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { availability } from '@/lib/availability';
import { priceSelection, BookingError } from '@/lib/booking';
import { formatDuration, formatPrice } from '@/lib/money';
import { BERLIN, formatLongDate, isoDate, monthGrid, parseIsoDate, zonedPartsToUtc } from '@/lib/time';
import { hasPhoto, type PhotoId } from '@/lib/media';
import { env } from '@/lib/env';
import { Photo } from '@/components/image';
import { Motto, Petal } from '@/components/shell';
import { CalendarIcon, Clock, Users } from '@/components/icons';
import { Stepper } from '@/components/stepper';
import { SlotPicker } from '@/components/slot-picker';
import { MonthCalendar } from '@/components/month-calendar';
import { StaffPicker } from '@/components/staff-picker';

/**
 * Choosing a time, following 04-booking and 12-mobile-booking.
 *
 * The whole draft is in the query string — service, variant, extras, look,
 * member of staff, date, time. Nothing is held until the customer presses
 * Weiter, which is deliberate: a slot reserved the moment somebody glanced at
 * the calendar would take the studio's Saturday out of circulation for every
 * browser tab left open.
 *
 * Availability is computed here, on the server, from the rota and everything
 * already booked or held. The list the page shows is advisory; the hold and the
 * confirmation each re-check, and the customer is told plainly when a slot goes
 * between looking and choosing.
 */

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);
const many = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

export async function BookingPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const now = new Date();

  const services = await db
    .select()
    .from(schema.service)
    .where(eq(schema.service.published, true))
    .orderBy(asc(schema.service.sortOrder));

  const staff = await db
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.active, true))
    .orderBy(asc(schema.staff.sortOrder));

  const serviceSlug = one(query.service) ?? one(query.leistung);
  const variantSlug = one(query.variant) ?? null;
  const extraSlugs = many(query.extra);
  const lookSlug = one(query.look) ?? null;
  const staffSlug = one(query.staff) ?? one(query.team) ?? null;

  const service = services.find((s) => s.slug === serviceSlug) ?? null;
  const member = staff.find((s) => s.slug === staffSlug) ?? null;

  // Nothing chosen yet: this is step one, and the page becomes the service
  // picker rather than an empty calendar.
  if (!service) {
    return <ChooseService locale={locale} services={services} query={query} />;
  }

  let priced: Awaited<ReturnType<typeof priceSelection>> | null = null;
  let pricingError: string | null = null;
  try {
    priced = await priceSelection({
      serviceSlug: service.slug,
      variantSlug,
      addOnSlugs: extraSlugs,
      lookSlug,
    });
  } catch (error) {
    // A tampered or stale URL — an add-on that is no longer allowed on this
    // service, say. Fall back to the plain service rather than 500.
    pricingError = error instanceof BookingError ? error.code : 'unknown';
    priced = await priceSelection({ serviceSlug: service.slug });
  }

  const today = isoDate(now, BERLIN);
  const requestedDate = one(query.date) ?? one(query.datum) ?? today;
  const parsed = parseIsoDate(requestedDate) ?? parseIsoDate(today)!;
  const date = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;

  const { slots, nextAvailableDate } = await availability({
    date,
    timing: {
      serviceId: priced.serviceId,
      durationMinutes: priced.durationMinutes,
      resourceIds: priced.resourceIds,
    },
    staffId: member?.id ?? null,
    now,
  });

  const selectedTime = one(query.time) ?? one(query.zeit) ?? null;
  const selectedSlot = slots.find((slot) => slot.label === selectedTime) ?? null;

  const look = lookSlug
    ? (await db.select().from(schema.look).where(eq(schema.look.slug, lookSlug)).limit(1))[0]
    : undefined;

  const dayInstant = zonedPartsToUtc({ ...parsed, hour: 12, minute: 0 }, BERLIN);

  // Which days in the visible month are worth offering at all. The rota decides
  // it — a closed Monday should not look clickable.
  const rota = await db
    .select({ weekday: schema.workSchedule.weekday })
    .from(schema.workSchedule);
  const openWeekdays = new Set(rota.map((r) => r.weekday));

  const grid = monthGrid(parsed.year, parsed.month);
  const horizonEnd = new Date(now.getTime() + 90 * 86400000);

  const days = grid.map((cell) => {
    const instant = zonedPartsToUtc({ ...cell, hour: 12, minute: 0 }, BERLIN);
    const weekday = new Date(Date.UTC(cell.year, cell.month - 1, cell.day)).getUTCDay() || 7;
    const iso = `${cell.year}-${String(cell.month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    return {
      ...cell,
      iso,
      disabled: iso < today || instant > horizonEnd || !openWeekdays.has(weekday),
      selected: iso === date,
    };
  });

  const serviceName = locale === 'de' ? service.nameDe : service.nameEn;

  return (
    <div className="booking">
      <Petal position="tl" />
      <Petal position="bl" />

      <section className="booking-rail desktop-only">
        <h2 className="booking-rail-title">
          Schöne
          <br />
          Nägel.
          <br />
          Schöner
          <br />
          Alltag.
        </h2>
        <hr className="rule" />
        <Motto locale={locale} />
      </section>

      <section className="booking-main">
        <Stepper locale={locale} current={3} />

        <div className="stack stack--1">
          <h1 className="booking-title">{copy.booking.title}</h1>
          <p className="lede">{copy.booking.subtitle}</p>
          {pricingError ? <p className="tiny muted">{copy.common.errorHint}</p> : null}
        </div>

        <div className="booking-panel">
          <div>
            <MonthCalendar
              locale={locale}
              year={parsed.year}
              month={parsed.month}
              days={days}
              basePath={path(locale, 'booking')}
              query={{
                service: service.slug,
                ...(variantSlug ? { variant: variantSlug } : {}),
                ...(lookSlug ? { look: lookSlug } : {}),
                ...(staffSlug ? { staff: staffSlug } : {}),
              }}
              extras={extraSlugs}
            />
          </div>

          <div className="stack stack--3">
            <div className="stack stack--1">
              <h2 style={{ fontSize: 26 }}>{copy.booking.time}</h2>
              <p className="small muted">
                {copy.booking.availableOn}
                <br />
                {formatLongDate(dayInstant, locale)}
              </p>
            </div>

            {slots.length === 0 ? (
              <div className="notice notice--sage">
                <span>
                  {copy.booking.noSlots}
                  {nextAvailableDate ? (
                    <>
                      {' '}
                      {copy.booking.noSlotsHint}{' '}
                      <Link
                        className="strong"
                        href={`${path(locale, 'booking')}?service=${service.slug}&date=${nextAvailableDate}`}
                      >
                        {formatLongDate(
                          zonedPartsToUtc({ ...parseIsoDate(nextAvailableDate)!, hour: 12, minute: 0 }, BERLIN),
                          locale,
                        )}
                      </Link>
                      .
                    </>
                  ) : (
                    <> {copy.booking.noSlotsContact}</>
                  )}
                </span>
              </div>
            ) : (
              <SlotPicker
                locale={locale}
                slots={slots.map((slot) => ({ label: slot.label, startsAt: slot.startsAt }))}
                selected={selectedTime}
              />
            )}

            <div className="field">
              <label htmlFor="staff-picker">{copy.booking.team}</label>
              <StaffPicker
                locale={locale}
                action={path(locale, 'booking')}
                hidden={[
                  { name: 'service', value: service.slug },
                  ...(variantSlug ? [{ name: 'variant', value: variantSlug }] : []),
                  ...extraSlugs.map((slug) => ({ name: 'extra', value: slug })),
                  ...(lookSlug ? [{ name: 'look', value: lookSlug }] : []),
                  { name: 'date', value: date },
                ]}
                staff={staff.map((item) => ({ slug: item.slug, name: item.displayName }))}
                selected={staffSlug}
              />
            </div>
          </div>
        </div>
      </section>

      <aside className="booking-summary" aria-label={copy.booking.yourSelection}>
        <Petal position="tr" />
        {env.demoMode ? <span className="badge">{copy.common.demo}</span> : null}
        <h2 className="booking-summary-title">{copy.booking.yourSelection}</h2>

        <div className="row row--nowrap" style={{ gap: 'var(--s2)', alignItems: 'flex-start' }}>
          <div className="media" style={{ width: 120, aspectRatio: '1 / 1', borderRadius: 12, flex: 'none' }}>
            {look && hasPhoto(look.mediaSlug) ? (
              <Photo id={look.mediaSlug as PhotoId} alt="" sizes="120px" />
            ) : service.mediaSlug && hasPhoto(service.mediaSlug) ? (
              <Photo id={service.mediaSlug as PhotoId} alt="" sizes="120px" />
            ) : null}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {look ? (
              <span className="serif" style={{ fontSize: 26 }}>
                {locale === 'de' ? look.nameDe : look.nameEn}
              </span>
            ) : null}
            <span className="serif" style={{ fontSize: look ? 20 : 26 }}>
              {serviceName}
            </span>
            <span className="small muted" style={{ marginTop: 8 }}>
              {formatDuration(priced.durationMinutes, locale)}
            </span>
            <span className="small muted">{formatPrice(priced.totalCents, locale)}</span>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: 0 }} />

        <div className="stack stack--2">
          <span className="booking-summary-row">
            <CalendarIcon size={20} />
            {formatLongDate(dayInstant, locale)}
          </span>
          <span className="booking-summary-row">
            <Clock size={20} />
            {selectedSlot ? `${selectedSlot.label} Uhr` : copy.booking.chooseTime}
          </span>
          <span className="booking-summary-row">
            <Users size={20} />
            {copy.booking.team}: {member?.displayName ?? copy.booking.anyStaff}
          </span>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: 0 }} />

        <div className="row row--between">
          <span className="serif" style={{ fontSize: 24 }}>
            {copy.booking.total}
          </span>
          <span className="serif" style={{ fontSize: 28 }}>
            {formatPrice(priced.totalCents, locale)}
          </span>
        </div>

        {priced.totalCents === null ? <p className="tiny muted">{copy.booking.priceOnRequestNote}</p> : null}
      </aside>

      <div className="booking-actions" style={{ gridColumn: '1 / -1' }}>
        <Link className="btn btn--ghost" href={path(locale, 'services')}>
          {copy.booking.back}
        </Link>
        <ContinueButton
          locale={locale}
          disabled={!selectedSlot}
          selection={{
            serviceSlug: service.slug,
            variantSlug,
            addOnSlugs: extraSlugs,
            lookSlug,
            staffSlug,
            startsAt: selectedSlot?.startsAt ?? null,
          }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- step one view */

function ChooseService({
  locale,
  services,
  query,
}: {
  locale: Locale;
  services: (typeof schema.service.$inferSelect)[];
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const lookSlug = one(query.look);

  return (
    <div className="booking">
      <Petal position="tl" />
      <section className="booking-rail desktop-only">
        <h2 className="booking-rail-title">
          Schöne
          <br />
          Nägel.
          <br />
          Schöner
          <br />
          Alltag.
        </h2>
        <hr className="rule" />
        <Motto locale={locale} />
      </section>

      <section className="booking-main" style={{ gridColumn: 'span 2' }}>
        <Stepper locale={locale} current={1} />
        <div className="stack stack--1">
          <h1 className="booking-title">{copy.booking.title}</h1>
          <p className="lede">{copy.booking.chooseServiceFirst}</p>
        </div>

        <ul className="service-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {services.map((service) => (
            <li key={service.id} className="card">
              {service.mediaSlug && hasPhoto(service.mediaSlug) ? (
                <div className="media service-card-media">
                  <Photo id={service.mediaSlug as PhotoId} alt="" sizes="(max-width: 1099px) 50vw, 260px" />
                </div>
              ) : null}
              <div className="service-card-body">
                <h2 className="service-card-title">{locale === 'de' ? service.nameDe : service.nameEn}</h2>
                <p className="small muted">{locale === 'de' ? service.teaserDe : service.teaserEn}</p>
              </div>
              <div className="service-card-foot">
                <span className="small muted">
                  {formatDuration(service.durationMinutes, locale)} · {formatPrice(service.priceCents, locale)}
                </span>
                <Link
                  className="round-arrow"
                  href={`${path(locale, 'booking')}?service=${service.slug}${lookSlug ? `&look=${lookSlug}` : ''}`}
                  aria-label={`${copy.booking.next}: ${locale === 'de' ? service.nameDe : service.nameEn}`}
                >
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- the CTA */

import { HoldAndContinue } from '@/components/hold-and-continue';

function ContinueButton(props: React.ComponentProps<typeof HoldAndContinue>) {
  return <HoldAndContinue {...props} />;
}
