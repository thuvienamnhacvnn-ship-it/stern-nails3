import Link from 'next/link';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { path, t, type Locale } from '@/lib/i18n';
import { currentCustomer, signInWithToken } from '@/lib/auth';
import { formatCents, formatDuration } from '@/lib/money';
import { formatLongDate, formatTime } from '@/lib/time';
import { hasPhoto, type PhotoId } from '@/lib/media';
import { env } from '@/lib/env';
import { Photo } from '@/components/image';
import { Motto, Petal } from '@/components/shell';
import { ArrowRight, CalendarIcon, Clock, Coins, Gift, Heart, User } from '@/components/icons';
import { SignInForm } from '@/components/sign-in-form';
import { CancelBooking } from '@/components/cancel-booking';

/**
 * The customer's own area, following 08-account.
 *
 * Every query here is filtered by the signed-in customer's id, taken from the
 * session cookie — never from anything in the URL. That is the whole
 * authorisation model on this page, and it is why customer A cannot reach
 * customer B's appointment by changing a number.
 */
export async function AccountPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);

  // Arriving from a sign-in link. The token is consumed here and the page then
  // redirects to itself, so the link cannot be replayed from history and the
  // token does not sit in the address bar.
  const token = typeof query.token === 'string' ? query.token : null;
  if (token) {
    const customerId = await signInWithToken(token);
    if (customerId) redirect(path(locale, 'account'));
  }

  const customer = await currentCustomer();
  if (!customer) return <SignedOut locale={locale} />;

  const now = new Date();

  const upcoming = await db
    .select()
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.customerId, customer.id),
        inArray(schema.booking.status, ['confirmed', 'pending_payment']),
        gte(schema.booking.startsAt, now),
      ),
    )
    .orderBy(schema.booking.startsAt)
    .limit(5);

  const past = await db
    .select()
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.customerId, customer.id),
        inArray(schema.booking.status, ['confirmed', 'completed', 'cancelled', 'no_show']),
        lt(schema.booking.startsAt, now),
      ),
    )
    .orderBy(desc(schema.booking.startsAt))
    .limit(5);

  const next = upcoming[0] ?? null;
  const nextItems = next
    ? await db.select().from(schema.bookingItem).where(eq(schema.bookingItem.bookingId, next.id))
    : [];
  const nextService = nextItems.find((item) => item.kind === 'service');

  const favorites = await db
    .select({ look: schema.look })
    .from(schema.favorite)
    .innerJoin(schema.look, eq(schema.look.id, schema.favorite.lookId))
    .where(eq(schema.favorite.customerId, customer.id))
    .orderBy(desc(schema.favorite.createdAt))
    .limit(3);

  const vouchers = await db
    .select()
    .from(schema.voucher)
    .where(and(eq(schema.voucher.recipientEmail, customer.email), eq(schema.voucher.status, 'active')))
    .limit(3);

  const balance = vouchers.reduce((sum, voucher) => sum + voucher.balanceCents, 0);
  const initials = [customer.firstName?.[0], customer.lastName?.[0]].filter(Boolean).join('').toUpperCase();

  return (
    <div className="account">
      <Petal position="bl" />

      <aside className="account-side desktop-only">
        <div className="account-user">
          <span className="account-avatar">{initials || <User size={24} />}</span>
          <span className="stack" style={{ gap: 2 }}>
            <span className="serif" style={{ fontSize: 24 }}>
              {copy.account.title}
            </span>
            <span className="tiny muted">{copy.account.greeting}</span>
          </span>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: 0 }} />

        <nav className="account-nav" aria-label={copy.account.title}>
          <Link href={path(locale, 'account')} aria-current="page">
            <CalendarIcon size={20} />
            {copy.account.nav.bookings}
          </Link>
          <Link href={`${path(locale, 'looks')}?favorites=1`}>
            <Heart size={20} />
            {copy.account.nav.favorites}
          </Link>
          <Link href={path(locale, 'vouchers')}>
            <Gift size={20} />
            {copy.account.nav.vouchers}
          </Link>
          <Link href={`${path(locale, 'account')}?tab=profil`}>
            <User size={20} />
            {copy.account.nav.profile}
          </Link>
        </nav>

        <form action="/api/account/sign-out" method="post" style={{ marginTop: 'auto' }}>
          <button type="submit" className="btn btn--text small">
            {copy.account.signOut}
          </button>
        </form>

        <div className="desktop-only">
          <Motto locale={locale} />
        </div>
      </aside>

      <section className="account-main">
        <div className="stack stack--1">
          <h1 className="account-title">{copy.account.title}</h1>
          <p className="lede" style={{ fontSize: 20 }}>
            {copy.account.subtitle}
          </p>
        </div>

        <div className="panel panel--pad stack stack--2">
          <h2 className="serif" style={{ fontSize: 28 }}>
            {copy.account.nextAppointment}
          </h2>

          {next && next.startsAt ? (
            <div className="card next-appointment">
              <div className="media next-appointment-media">
                <Photo id="care-still-life" alt="" sizes="(max-width: 1099px) 100vw, 300px" focalPoint="50% 40%" />
              </div>
              <div className="next-appointment-body">
                <div className="stack stack--1">
                  <span className="eyebrow">{locale === 'de' ? nextService?.nameDe : nextService?.nameEn}</span>
                  <span className="next-appointment-when">
                    {formatLongDate(next.startsAt, locale)}
                    <br />
                    {formatTime(next.startsAt)} Uhr
                  </span>
                  <span className="row small muted" style={{ marginTop: 8 }}>
                    <span className="row row--tight">
                      <Clock size={18} />
                      {formatDuration(nextService?.durationMinutes ?? 0, locale)}
                    </span>
                    {next.totalCents !== null ? (
                      <span className="row row--tight">
                        <Coins size={18} />
                        {formatCents(next.totalCents - next.discountCents, locale)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="stack stack--1">
                  <Link className="btn btn--primary" href={`${path(locale, 'booking')}?rebook=${next.reference}`}>
                    {copy.account.reschedule}
                    <ArrowRight size={18} />
                  </Link>
                  <CancelBooking locale={locale} bookingId={next.id} />
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>{copy.account.noAppointment}</h3>
              <p className="lede">{copy.account.noAppointmentHint}</p>
              <Link className="btn btn--primary" href={path(locale, 'looks')}>
                {copy.nav.looks}
                <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </div>

        <div className="account-cards">
          <div className="panel panel--pad stack stack--2">
            <div className="row row--between">
              <h2 className="serif" style={{ fontSize: 28 }}>
                {copy.account.yourFavorites}
              </h2>
              <Link className="btn btn--text small" href={`${path(locale, 'looks')}?favorites=1`}>
                {copy.account.seeAll}
                <ArrowRight size={16} />
              </Link>
            </div>

            {favorites.length === 0 ? (
              <div className="stack stack--1">
                <p className="small">{copy.account.noFavorites}</p>
                <p className="tiny muted">{copy.account.noFavoritesHint}</p>
              </div>
            ) : (
              <ul className="favorite-row" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {favorites.map(({ look }) => (
                  <li key={look.id} className="favorite-item">
                    <div className="media">
                      {hasPhoto(look.mediaSlug) ? (
                        <Photo id={look.mediaSlug as PhotoId} alt="" sizes="(max-width: 1099px) 40vw, 200px" />
                      ) : null}
                    </div>
                    <div className="row row--between row--nowrap">
                      <span className="stack" style={{ gap: 0 }}>
                        <span className="serif" style={{ fontSize: 20 }}>
                          {locale === 'de' ? look.nameDe : look.nameEn}
                        </span>
                        <span className="tiny muted truncate">
                          {locale === 'de' ? look.teaserDe : look.teaserEn}
                        </span>
                      </span>
                      <Link
                        className="round-arrow round-arrow--sm"
                        href={`${path(locale, 'looks')}?look=${look.slug}`}
                        aria-label={`${copy.stylist.viewLook}: ${locale === 'de' ? look.nameDe : look.nameEn}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel panel--pad stack stack--2">
            <div className="row row--between">
              <h2 className="serif" style={{ fontSize: 28 }}>
                {copy.account.yourVouchers}
              </h2>
              <Link className="btn btn--text small" href={path(locale, 'vouchers')}>
                {copy.account.seeAll}
                <ArrowRight size={16} />
              </Link>
            </div>

            {vouchers.length === 0 ? (
              <p className="small muted">{copy.account.noVouchers}</p>
            ) : (
              <div className="voucher-card">
                <span className="voucher-card-icon">
                  <Gift size={26} />
                </span>
                <span className="serif" style={{ fontSize: 24 }}>
                  {copy.account.voucherBalance}
                </span>
                <span className="voucher-card-amount">{formatCents(balance, locale)}</span>
                <span className="tiny muted" style={{ maxWidth: '22ch' }}>
                  {copy.account.voucherBalanceHint}
                </span>
              </div>
            )}
          </div>
        </div>

        {past.length > 0 ? (
          <div className="panel panel--pad stack stack--2">
            <h2 className="serif" style={{ fontSize: 28 }}>
              {copy.account.pastAppointments}
            </h2>
            <ul className="stack stack--1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {past.map((item) => (
                <li key={item.id} className="row row--between small" style={{ paddingBlock: 8, borderBottom: '1px solid var(--hairline-soft)' }}>
                  <span>{item.startsAt ? formatLongDate(item.startsAt, locale) : ''}</span>
                  <span className="muted">{item.reference}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <a className="btn btn--text small" href="/api/account/export">
            {copy.account.exportData}
          </a>
          <Link className="btn btn--text small" href={path(locale, 'privacy')}>
            {copy.account.deleteData}
          </Link>
        </div>
      </section>
    </div>
  );
}

function SignedOut({ locale }: { locale: Locale }) {
  const copy = t(locale);
  return (
    <div className="account" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Petal position="bl" />
      <section
        className="account-main"
        style={{ maxWidth: 520, marginInline: 'auto', alignContent: 'center', minHeight: '60vh' }}
      >
        <div className="stack stack--1">
          <h1 className="serif" style={{ fontSize: 'clamp(34px, 4vw, 54px)' }}>
            {copy.account.signInTitle}
          </h1>
          <p className="lede">{copy.account.signInIntro}</p>
        </div>
        <SignInForm locale={locale} demoMode={env.demoMode} />
      </section>
    </div>
  );
}
