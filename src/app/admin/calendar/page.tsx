import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { formatCents, formatDuration } from '@/lib/money';
import {
  BERLIN,
  addDays,
  formatLongDate,
  formatTime,
  isoDate,
  minutesIntoLocalDay,
  parseIsoDate,
  startOfLocalDay,
  zonedPartsToUtc,
} from '@/lib/time';
import { AdminShell } from '@/components/admin-shell';
import {
  CalendarIcon,
  CheckCircle,
  Clock,
  Dots,
  ListIcon,
  Mail,
  Note,
  Phone,
  Plus,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  Trash,
  User,
} from '@/components/icons';

/**
 * The studio calendar, following 10-admin.
 *
 * One column per member of staff, one row per hour, appointments positioned by
 * their real start and duration rather than laid out in a list — which is the
 * point of a day view: a gap in the afternoon has to be visible as a gap.
 *
 * `staff` may only see their own column. That is enforced here, by filtering the
 * query, and not by hiding a tab: the rule is that the server never sends a
 * member of staff a booking they are not entitled to.
 */

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 19;

export default async function AdminCalendar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireStaff('calendar.read.own');
  if (!auth.ok) redirect('/admin/login');
  const me = auth.staff;

  const copy = t('de');
  const query = await searchParams;
  const now = new Date();

  const requested = typeof query.date === 'string' ? query.date : isoDate(now, BERLIN);
  const date = parseIsoDate(requested) ?? parseIsoDate(isoDate(now, BERLIN))!;
  const dateIso = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;

  const dayStart = startOfLocalDay(date, BERLIN);
  const dayEnd = new Date(dayStart.getTime() + 26 * 3600000);

  const everyone = await db
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.active, true))
    .orderBy(asc(schema.staff.sortOrder));

  // A member of staff without `calendar.read.all` sees one column: their own.
  const columns = auth.staff.role === 'staff' ? everyone.filter((s) => s.id === me.id) : everyone;

  const bookings = await db
    .select()
    .from(schema.booking)
    .where(
      and(
        inArray(schema.booking.status, ['confirmed', 'pending_payment', 'completed', 'no_show']),
        lt(schema.booking.startsAt, dayEnd),
        gt(schema.booking.endsAt, dayStart),
        inArray(schema.booking.staffId, columns.map((s) => s.id)),
      ),
    )
    .orderBy(asc(schema.booking.startsAt));

  const items = bookings.length
    ? await db
        .select()
        .from(schema.bookingItem)
        .where(inArray(schema.bookingItem.bookingId, bookings.map((b) => b.id)))
    : [];

  const selectedId = typeof query.booking === 'string' ? query.booking : null;
  const selected = bookings.find((b) => b.id === selectedId) ?? bookings[0] ?? null;
  const selectedItems = selected ? items.filter((i) => i.bookingId === selected.id) : [];
  const selectedService = selectedItems.find((i) => i.kind === 'service');

  const customer = selected?.customerId
    ? (await db.select().from(schema.customer).where(eq(schema.customer.id, selected.customerId)).limit(1))[0]
    : undefined;

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const hourHeight = 60;
  const topFor = (instant: Date) => ((minutesIntoLocalDay(instant, BERLIN) - DAY_START_HOUR * 60) / 60) * hourHeight;

  const dayHref = (delta: number) => {
    const next = addDays(date, delta);
    return `/admin/calendar?date=${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`;
  };

  const initialsOf = (booking: typeof schema.booking.$inferSelect) =>
    [booking.contactFirstName?.[0], booking.contactLastName?.[0]].filter(Boolean).join('').toUpperCase() || '–';

  return (
    <AdminShell current="calendar" role={me.role} staffName={me.displayName}>
      <div className="admin-head">
        <div className="row row--tight">
          <h1 className="admin-title">{formatLongDate(zonedPartsToUtc({ ...date, hour: 12, minute: 0 }, BERLIN), 'de')}</h1>
          <Link className="round-arrow round-arrow--sm" href={dayHref(-1)} aria-label="Vorheriger Tag">
            <ChevronLeft size={18} />
          </Link>
          <Link className="round-arrow round-arrow--sm" href={dayHref(1)} aria-label="Nächster Tag">
            <ChevronRight size={18} />
          </Link>
        </div>

        <div className="row row--tight">
          <div className="row row--tight" role="group" aria-label="Ansicht">
            <span className="chip chip--sage" data-active="true">
              {copy.admin.day}
            </span>
            {/* The week view is not built. Showing a dead tab would be worse
                than leaving it out, so it is simply absent. */}
          </div>

          <form method="get" action="/admin/customers" className="search" style={{ minHeight: 44 }}>
            <SearchIcon size={20} aria-hidden="true" />
            <input type="search" name="q" placeholder={copy.admin.searchCustomer} aria-label={copy.admin.searchCustomer} />
          </form>

          <Link className="btn btn--primary btn--sm" href="/de/termin">
            <Plus size={18} />
            {copy.admin.newBooking}
          </Link>
        </div>
      </div>

      <div className="admin-board">
        <div className="calendar-board" style={{ ['--columns' as string]: String(columns.length) }}>
          <div className="calendar-board-head" style={{ gridColumn: 1 }} />
          {columns.map((member) => (
            <div key={member.id} className="calendar-board-head">
              <span className="account-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {member.initials}
              </span>
              <span className="stack" style={{ gap: 0 }}>
                <span className="strong small">{member.displayName}</span>
                <span className="tiny muted">{member.roleTitleDe}</span>
              </span>
            </div>
          ))}

          <div className="calendar-board-hours">
            {hours.map((hour) => (
              <div key={hour} className="calendar-hour" style={{ height: hourHeight }}>
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {columns.map((member) => (
            <div key={member.id} className="calendar-column">
              <div className="calendar-column-lines" aria-hidden="true">
                {hours.map((hour) => (
                  <div key={hour} style={{ height: hourHeight }} />
                ))}
              </div>

              {bookings
                .filter((booking) => booking.staffId === member.id && booking.startsAt && booking.endsAt)
                .map((booking) => {
                  const minutes = Math.round((booking.endsAt!.getTime() - booking.startsAt!.getTime()) / 60000);
                  const service = items.find((i) => i.bookingId === booking.id && i.kind === 'service');
                  return (
                    <Link
                      key={booking.id}
                      href={`/admin/calendar?date=${dateIso}&booking=${booking.id}`}
                      className="calendar-event"
                      data-tone={booking.status === 'confirmed' ? 'sage' : 'blush'}
                      aria-pressed={selected?.id === booking.id}
                      style={{
                        top: topFor(booking.startsAt!),
                        height: Math.max(36, (minutes / 60) * hourHeight - 6),
                      }}
                      scroll={false}
                    >
                      <span className="calendar-event-initials">{initialsOf(booking)}</span>
                      <span className="stack grow" style={{ gap: 0 }}>
                        <span className="small truncate">
                          {booking.contactFirstName} {booking.contactLastName}
                        </span>
                        <span className="tiny muted truncate">{service?.nameDe}</span>
                      </span>
                      <span className="tiny muted">{minutes} min</span>
                      {booking.status === 'confirmed' ? <CheckCircle size={16} /> : null}
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>

        <aside className="panel admin-detail" aria-label="Termindetails">
          {selected ? (
            <>
              <div className="row row--between">
                <span className="badge badge--sage">
                  <CheckCircle size={14} />
                  &nbsp;{selected.status === 'confirmed' ? copy.admin.confirmed : selected.status}
                </span>
                <span className="icon-button" aria-hidden="true">
                  <Dots size={20} />
                </span>
              </div>

              <h2 className="admin-detail-name">
                {selected.contactFirstName} {selected.contactLastName}
              </h2>

              {selected.contactPhone ? (
                <p className="admin-detail-row">
                  <Phone size={18} />
                  {selected.contactPhone}
                </p>
              ) : null}
              {selected.contactEmail ? (
                <p className="admin-detail-row">
                  <Mail size={18} />
                  {selected.contactEmail}
                </p>
              ) : null}
              <p className="admin-detail-row">
                <User size={18} />
                {customer ? copy.admin.regular : 'Gastbuchung'}
              </p>

              <hr style={{ border: 0, borderTop: '1px solid var(--hairline-soft)', margin: '4px 0' }} />

              {selected.startsAt && selected.endsAt ? (
                <>
                  <p className="admin-detail-row">
                    <CalendarIcon size={18} />
                    {formatLongDate(selected.startsAt, 'de')}
                  </p>
                  <p className="admin-detail-row">
                    <Clock size={18} />
                    {formatTime(selected.startsAt)} – {formatTime(selected.endsAt)} (
                    {formatDuration(Math.round((selected.endsAt.getTime() - selected.startsAt.getTime()) / 60000), 'de')})
                  </p>
                </>
              ) : null}

              <p className="admin-detail-row">
                <ListIcon size={18} />
                <span className="grow">{selectedService?.nameDe}</span>
                <span className="strong">
                  {selected.totalCents === null ? 'Preis auf Anfrage' : formatCents(selected.totalCents - selected.discountCents, 'de')}
                </span>
              </p>

              {selected.notes ? (
                <>
                  <span className="small muted">{copy.admin.notes}</span>
                  <p className="notice">
                    <Note size={18} />
                    <span>{selected.notes}</span>
                  </p>
                </>
              ) : null}

              <div className="row row--tight" style={{ marginTop: 'var(--s2)' }}>
                <Link className="btn btn--ghost btn--sm" href={`/de/termin?service=${selectedService?.serviceId ?? ''}`}>
                  <CalendarIcon size={16} />
                  {copy.admin.reschedule}
                </Link>
                {/* Cancelling is a POST with a CSRF-safe form, never a link a
                    crawler or a prefetch could follow. */}
                <form action="/api/admin/bookings/cancel" method="post">
                  <input type="hidden" name="bookingId" value={selected.id} />
                  <input type="hidden" name="date" value={dateIso} />
                  <button type="submit" className="btn btn--sm" style={{ color: '#9b3f3f', border: '1px solid #e3c9c6' }}>
                    <Trash size={16} />
                    {copy.admin.cancelBooking}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="stack stack--2">
              <h2 className="serif" style={{ fontSize: 26 }}>
                {copy.admin.noBookings}
              </h2>
              <p className="small muted">Wähle einen anderen Tag oder trag einen Termin ein.</p>
            </div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
