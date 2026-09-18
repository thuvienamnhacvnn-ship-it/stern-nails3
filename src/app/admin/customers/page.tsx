import { redirect } from 'next/navigation';
import { desc, eq, ilike, or } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { formatLongDate } from '@/lib/time';
import { AdminShell, Forbidden } from '@/components/admin-shell';
import { Search as SearchIcon } from '@/components/icons';

/**
 * Customers.
 *
 * A read-only list on purpose. Editing somebody else's name, address or consent
 * flag from a staff screen is a data-protection question the studio has not
 * answered yet, and a screen that cannot write cannot get that wrong. What it
 * does show is the consent state, because "did they agree to marketing" is the
 * question this table exists to settle.
 *
 * Behind `calendar.read.all`: a member of staff sees the appointments assigned
 * to them, not the studio's customer list.
 */
export default async function AdminCustomers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireStaff('calendar.read.all');
  if (!auth.ok && auth.reason === 'unauthenticated') redirect('/admin/login');

  const copy = t('de');
  if (!auth.ok) {
    return (
      <AdminShell current="customers" role={auth.staff!.role} staffName={auth.staff!.displayName}>
        <Forbidden />
      </AdminShell>
    );
  }

  const query = await searchParams;
  const term = (typeof query.q === 'string' ? query.q : '').trim();

  const customers = await db
    .select()
    .from(schema.customer)
    .where(
      term
        ? or(
            // ilike, not a LIKE on a lowercased column: names have umlauts and
            // the studio types them the way they feel like on the day.
            ilike(schema.customer.email, `%${term}%`),
            ilike(schema.customer.firstName, `%${term}%`),
            ilike(schema.customer.lastName, `%${term}%`),
          )
        : undefined,
    )
    .orderBy(desc(schema.customer.createdAt))
    .limit(60);

  const bookings = await db
    .select({ customerId: schema.booking.customerId, status: schema.booking.status })
    .from(schema.booking);

  const countFor = (customerId: string) =>
    bookings.filter((b) => b.customerId === customerId && b.status !== 'cancelled').length;

  return (
    <AdminShell current="customers" role={auth.staff.role} staffName={auth.staff.displayName}>
      <div className="admin-head">
        <h1 className="admin-title">{copy.admin.nav.customers}</h1>
        <form method="get" className="search" style={{ minHeight: 44, maxWidth: 360 }}>
          <SearchIcon size={20} aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={term}
            placeholder={copy.admin.searchCustomer}
            aria-label={copy.admin.searchCustomer}
          />
        </form>
      </div>

      <div className="panel" style={{ overflow: 'auto', minHeight: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">E-Mail</th>
              <th scope="col">Telefon</th>
              <th scope="col">Termine</th>
              <th scope="col">Werbung</th>
              <th scope="col">Seit</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {term ? 'Keine Treffer.' : 'Noch keine Kundinnen erfasst.'}
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="strong">
                    {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="tiny">{customer.email}</td>
                  <td className="tiny muted">{customer.phone ?? '—'}</td>
                  <td>{countFor(customer.id)}</td>
                  <td>
                    {customer.marketingOptIn ? (
                      <span className="badge badge--sage">Einwilligung</span>
                    ) : (
                      <span className="tiny muted">keine</span>
                    )}
                  </td>
                  <td className="tiny muted">{formatLongDate(customer.createdAt, 'de')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
