import { redirect } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { fallbackSrc, hasPhoto, type PhotoId } from '@/lib/media';
import { AdminShell, Forbidden } from '@/components/admin-shell';
import { LookRow } from '@/components/admin-look-row';

/**
 * The lookbook and the media behind it.
 *
 * Publication is the only edit here, and it is the one that matters: an
 * unpublished look is invisible to the gallery, to the booking flow and to the
 * stylist's allowlist, all from the same flag. The thumbnail doubles as the
 * preview the brief asks for — what the owner approves is what the customer
 * sees.
 *
 * Generated images carry their disclosure text next to them, so the person
 * pressing publish can see they are approving a concept render rather than a
 * photograph of the studio's own work.
 */
export default async function AdminLooks() {
  const auth = await requireStaff('content.write');
  if (!auth.ok && auth.reason === 'unauthenticated') redirect('/admin/login');

  const copy = t('de');
  if (!auth.ok) {
    return (
      <AdminShell current="looks" role={auth.staff!.role} staffName={auth.staff!.displayName}>
        <Forbidden />
      </AdminShell>
    );
  }

  const looks = await db.select().from(schema.look).orderBy(asc(schema.look.sortOrder));
  const media = await db.select().from(schema.mediaAsset);
  const bySlug = new Map(media.map((asset) => [asset.slug, asset]));

  return (
    <AdminShell current="looks" role={auth.staff.role} staffName={auth.staff.displayName}>
      <div className="admin-head">
        <h1 className="admin-title">{copy.admin.nav.looks}</h1>
        <p className="small muted">
          Zurückgezogene Looks verschwinden aus Galerie, Buchung und KI Stylist.
        </p>
      </div>

      <div className="panel" style={{ overflow: 'auto', minHeight: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Bild</th>
              <th scope="col">Look</th>
              <th scope="col">Merkmale</th>
              <th scope="col">Bildquelle</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {looks.map((look) => {
              const asset = bySlug.get(look.mediaSlug);
              return (
                <LookRow
                  key={look.id}
                  look={{
                    id: look.id,
                    name: look.nameDe,
                    teaser: look.teaserDe,
                    collection: look.collection,
                    shape: look.shape,
                    length: look.length,
                    finish: look.finish,
                    published: look.published,
                    thumbnail: hasPhoto(look.mediaSlug) ? fallbackSrc(look.mediaSlug as PhotoId) : null,
                  }}
                  source={
                    asset
                      ? {
                          kind: asset.sourceType,
                          disclosure: asset.disclosureDe,
                          approval: asset.approvalStatus,
                          alt: asset.altDe,
                        }
                      : null
                  }
                  labels={{ published: copy.admin.published, unpublished: copy.admin.unpublished }}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
