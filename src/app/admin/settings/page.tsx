import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { env, integrationStatus } from '@/lib/env';
import { fieldLabel, missingBeforeLive, settings } from '@/lib/settings';
import { recentNotifications } from '@/lib/notify';
import { formatLongDate, formatTime } from '@/lib/time';
import { AdminShell, Forbidden } from '@/components/admin-shell';
import { SettingsForm } from '@/components/admin-settings-form';
import { CheckCircle, Mail } from '@/components/icons';

/**
 * Settings, the go-live checklist, the outbox and the audit log.
 *
 * This page is the honest answer to "is this thing live". The integration list
 * is computed from the actual environment, not from a note somebody wrote: if
 * it says mail is going to the outbox, that is because the outbox adapter is
 * what is loaded.
 *
 * The missing-fields list is the same computation the imprint page uses, so the
 * two can never disagree about what is still needed.
 */
export default async function AdminSettings() {
  const auth = await requireStaff('settings.write');
  if (!auth.ok && auth.reason === 'unauthenticated') redirect('/admin/login');

  const copy = t('de');
  if (!auth.ok) {
    return (
      <AdminShell current="settings" role={auth.staff!.role} staffName={auth.staff!.displayName}>
        <Forbidden />
      </AdminShell>
    );
  }

  const config = await settings();
  const missing = missingBeforeLive(config);
  const integrations = integrationStatus();
  const outbox = await recentNotifications(15);
  const trail = await db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(20);

  const INTEGRATION_LABEL: Record<string, string> = {
    email: 'E-Mail-Versand',
    payments: 'Zahlungen',
    ai: 'KI Stylist',
    whatsapp: 'WhatsApp',
  };

  return (
    <AdminShell current="settings" role={auth.staff.role} staffName={auth.staff.displayName}>
      <div className="admin-head">
        <h1 className="admin-title">{copy.admin.nav.settings}</h1>
        {env.demoMode ? <span className="badge">{copy.common.demo}</span> : null}
      </div>

      <div className="stack stack--3" style={{ minHeight: 0, overflowY: 'auto', paddingBottom: 'var(--s4)' }}>
        {missing.length > 0 ? (
          <section className="panel panel--pad stack stack--2">
            <h2 className="serif" style={{ fontSize: 26 }}>
              {copy.admin.pendingContent}
            </h2>
            <p className="small muted">
              Solange eines dieser Felder leer ist, blendet die Website den entsprechenden Teil aus, statt einen
              Platzhalter zu zeigen. Impressum und Kontaktbereich bleiben unvollständig.
            </p>
            <ul className="stack stack--1" style={{ margin: 0, paddingLeft: '1.1em' }}>
              {missing.map((field) => (
                <li key={field} className="small">
                  {fieldLabel(field, 'de')}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="notice notice--sage">
            <CheckCircle size={20} />
            <span>Alle Pflichtangaben sind hinterlegt.</span>
          </p>
        )}

        <section className="panel panel--pad stack stack--2">
          <h2 className="serif" style={{ fontSize: 26 }}>
            Studio-Daten
          </h2>
          <SettingsForm
            initial={{
              street: config?.street ?? '',
              postalCode: config?.postalCode ?? '',
              city: config?.city ?? '',
              phone: config?.phone ?? '',
              email: config?.email ?? '',
              legalEntity: config?.legalEntity ?? '',
              legalRepresentative: config?.legalRepresentative ?? '',
              registerCourt: config?.registerCourt ?? '',
              registerNumber: config?.registerNumber ?? '',
              vatId: config?.vatId ?? '',
              cancellationPolicy: config?.cancellationPolicy ?? '',
              holdMinutes: config?.holdMinutes ?? 10,
              bufferMinutes: config?.bufferMinutes ?? 10,
              minNoticeMinutes: config?.minNoticeMinutes ?? 120,
              bookingHorizonDays: config?.bookingHorizonDays ?? 90,
            }}
          />
        </section>

        <section className="panel panel--pad stack stack--2">
          <h2 className="serif" style={{ fontSize: 26 }}>
            {copy.admin.integrations}
          </h2>
          <table className="admin-table">
            <tbody>
              {integrations.map((row) => (
                <tr key={row.key}>
                  <td className="strong">{INTEGRATION_LABEL[row.key] ?? row.key}</td>
                  <td>
                    <span className={row.live ? 'badge badge--sage' : 'badge'}>
                      {row.live ? copy.admin.live : copy.admin.mock}
                    </span>
                  </td>
                  <td className="tiny muted">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel panel--pad stack stack--2">
          <h2 className="serif" style={{ fontSize: 26 }}>
            {copy.admin.outbox}
          </h2>
          {outbox.length === 0 ? (
            <p className="small muted">Noch nichts versendet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Zeit</th>
                  <th scope="col">An</th>
                  <th scope="col">Betreff</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {outbox.map((job) => (
                  <tr key={job.id}>
                    <td className="tiny muted">{formatTime(job.createdAt)}</td>
                    <td className="tiny">{job.toAddress}</td>
                    <td>
                      <span className="row row--tight">
                        <Mail size={16} />
                        {job.subject}
                      </span>
                      {job.lastError ? <span className="tiny field-error">{job.lastError}</span> : null}
                    </td>
                    <td className="tiny">{job.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel panel--pad stack stack--2">
          <h2 className="serif" style={{ fontSize: 26 }}>
            {copy.admin.auditLog}
          </h2>
          {trail.length === 0 ? (
            <p className="small muted">Noch keine Änderungen.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Zeit</th>
                  <th scope="col">Wer</th>
                  <th scope="col">Was</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {trail.map((entry) => (
                  <tr key={entry.id}>
                    <td className="tiny muted">
                      {formatLongDate(entry.createdAt, 'de')} {formatTime(entry.createdAt)}
                    </td>
                    <td className="tiny">{entry.actorLabel ?? entry.actorType}</td>
                    <td className="strong tiny">{entry.action}</td>
                    <td className="tiny muted" style={{ maxWidth: 380, wordBreak: 'break-word' }}>
                      {entry.before ? `vorher: ${JSON.stringify(entry.before)} ` : ''}
                      {entry.after ? `nachher: ${JSON.stringify(entry.after)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
