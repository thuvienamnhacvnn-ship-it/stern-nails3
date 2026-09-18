import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { formatCents } from '@/lib/money';
import { formatLongDate } from '@/lib/time';
import { AdminShell, Forbidden } from '@/components/admin-shell';

/**
 * The gift-card ledger.
 *
 * Every movement, in order, with the balance it left behind. That is what makes
 * a card auditable: the balance column on the voucher is a cache of this, and
 * if the two ever disagree the ledger is right.
 *
 * Codes are not here and cannot be. Only the hash is stored, so this page shows
 * the first four characters — enough to match a customer's card to a row, and
 * useless to anybody reading over a shoulder.
 */
export default async function AdminVouchers() {
  const auth = await requireStaff('vouchers.read');
  if (!auth.ok && auth.reason === 'unauthenticated') redirect('/admin/login');

  const copy = t('de');
  if (!auth.ok) {
    return (
      <AdminShell current="vouchers" role={auth.staff!.role} staffName={auth.staff!.displayName}>
        <Forbidden />
      </AdminShell>
    );
  }

  const vouchers = await db.select().from(schema.voucher).orderBy(desc(schema.voucher.createdAt)).limit(50);
  const ledger = await db
    .select()
    .from(schema.voucherLedger)
    .orderBy(desc(schema.voucherLedger.createdAt))
    .limit(120);

  const issued = vouchers.reduce((sum, v) => sum + (v.status === 'pending_payment' ? 0 : v.initialCents), 0);
  const outstanding = vouchers.reduce((sum, v) => sum + v.balanceCents, 0);

  return (
    <AdminShell current="vouchers" role={auth.staff.role} staffName={auth.staff.displayName}>
      <div className="admin-head">
        <h1 className="admin-title">{copy.admin.nav.vouchers}</h1>
        <div className="row">
          <span className="small muted">
            Ausgestellt <span className="strong">{formatCents(issued, 'de')}</span>
          </span>
          <span className="small muted">
            Offenes Guthaben <span className="strong">{formatCents(outstanding, 'de')}</span>
          </span>
        </div>
      </div>

      <div className="stack stack--3" style={{ minHeight: 0, overflowY: 'auto' }}>
        <div className="panel" style={{ overflow: 'auto' }}>
          <table className="admin-table">
            <caption className="sr-only">Gutscheine</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Status</th>
                <th scope="col">Wert</th>
                <th scope="col">Guthaben</th>
                <th scope="col">Empfängerin</th>
                <th scope="col">Gültig bis</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Noch kein Gutschein ausgestellt.
                  </td>
                </tr>
              ) : (
                vouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td>
                      <span className="strong" style={{ letterSpacing: '0.08em' }}>
                        {voucher.codeHint}
                        ····
                      </span>
                      {voucher.isDemo ? (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          {copy.common.demo}
                        </span>
                      ) : null}
                    </td>
                    <td>{voucher.status}</td>
                    <td>{formatCents(voucher.initialCents, 'de')}</td>
                    <td className="strong">{formatCents(voucher.balanceCents, 'de')}</td>
                    <td className="tiny muted">{voucher.recipientEmail ?? '—'}</td>
                    <td className="tiny muted">
                      {voucher.expiresAt ? formatLongDate(voucher.expiresAt, 'de') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ overflow: 'auto' }}>
          <table className="admin-table">
            <caption className="sr-only">Buchungen auf Gutscheinen</caption>
            <thead>
              <tr>
                <th scope="col">Zeitpunkt</th>
                <th scope="col">Vorgang</th>
                <th scope="col">Betrag</th>
                <th scope="col">Guthaben danach</th>
                <th scope="col">Notiz</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Noch keine Bewegungen.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => (
                  <tr key={entry.id}>
                    <td className="tiny muted">{formatLongDate(entry.createdAt, 'de')}</td>
                    <td>{entry.kind}</td>
                    <td className={entry.deltaCents < 0 ? '' : 'strong'}>
                      {entry.deltaCents < 0 ? '−' : '+'}
                      {formatCents(Math.abs(entry.deltaCents), 'de')}
                    </td>
                    <td>{formatCents(entry.balanceAfterCents, 'de')}</td>
                    <td className="tiny muted">{entry.note ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
