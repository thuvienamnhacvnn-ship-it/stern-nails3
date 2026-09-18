import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { formatDuration, formatPrice } from '@/lib/money';
import { AdminShell, Forbidden } from '@/components/admin-shell';
import { ServiceRow } from '@/components/admin-service-row';

/**
 * The catalogue.
 *
 * Duration, price and publication are editable here; the name and the
 * description are not, because they are two-language content and belong in a
 * content editor the studio has not asked for yet. What is editable is exactly
 * what the booking flow reads, which is the point: the numbers a customer is
 * charged live in this table and nowhere else.
 *
 * Leaving the price empty is a real choice, not a mistake — it means "Preis auf
 * Anfrage", and the checkout refuses to take money for it.
 */
export default async function AdminServices() {
  const auth = await requireStaff('catalogue.write');
  if (!auth.ok && auth.reason === 'unauthenticated') redirect('/admin/login');

  const copy = t('de');

  if (!auth.ok) {
    return (
      <AdminShell current="services" role={auth.staff!.role} staffName={auth.staff!.displayName}>
        <Forbidden />
      </AdminShell>
    );
  }

  const services = await db.select().from(schema.service).orderBy(asc(schema.service.sortOrder));
  const variants = await db.select().from(schema.serviceVariant).orderBy(asc(schema.serviceVariant.sortOrder));

  return (
    <AdminShell current="services" role={auth.staff.role} staffName={auth.staff.displayName}>
      <div className="admin-head">
        <h1 className="admin-title">{copy.admin.nav.services}</h1>
        <p className="small muted">
          Preis leer lassen heißt „Preis auf Anfrage“ – dafür ist online keine Zahlung möglich.
        </p>
      </div>

      <div className="panel" style={{ overflow: 'auto', minHeight: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Leistung</th>
              <th scope="col">Varianten</th>
              <th scope="col">Dauer</th>
              <th scope="col">Preis</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={{
                  id: service.id,
                  name: service.nameDe,
                  category: service.category,
                  durationMinutes: service.durationMinutes,
                  priceCents: service.priceCents,
                  published: service.published,
                }}
                variantNames={variants
                  .filter((variant) => variant.serviceId === service.id)
                  .map((variant) => variant.nameDe)}
                labels={{
                  published: copy.admin.published,
                  unpublished: copy.admin.unpublished,
                  save: copy.admin.save,
                  publish: copy.admin.publish,
                  unpublish: copy.admin.unpublish,
                  durationHint: formatDuration(service.durationMinutes, 'de'),
                  priceHint: formatPrice(service.priceCents, 'de'),
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
