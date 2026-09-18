import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

/**
 * GET /api/services — the published catalogue.
 *
 * Only published rows, and only the fields a customer-facing client needs.
 * `priceCents` is null for anything the studio has not priced, and it stays
 * null the whole way to the interface, which renders "Preis auf Anfrage".
 */
export async function GET() {
  const services = await db
    .select()
    .from(schema.service)
    .where(eq(schema.service.published, true))
    .orderBy(asc(schema.service.sortOrder));

  const variants = await db.select().from(schema.serviceVariant).orderBy(asc(schema.serviceVariant.sortOrder));

  const extras = await db
    .select({ serviceId: schema.serviceAddOn.serviceId, addOn: schema.addOn })
    .from(schema.serviceAddOn)
    .innerJoin(schema.addOn, eq(schema.addOn.id, schema.serviceAddOn.addOnId))
    .where(eq(schema.addOn.published, true));

  return NextResponse.json({
    services: services.map((service) => ({
      slug: service.slug,
      category: service.category,
      nameDe: service.nameDe,
      nameEn: service.nameEn,
      teaserDe: service.teaserDe,
      teaserEn: service.teaserEn,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      mediaSlug: service.mediaSlug,
      variants: variants
        .filter((variant) => variant.serviceId === service.id)
        .map((variant) => ({
          slug: variant.slug,
          nameDe: variant.nameDe,
          nameEn: variant.nameEn,
          priceDeltaCents: variant.priceDeltaCents,
          durationDeltaMinutes: variant.durationDeltaMinutes,
          isDefault: variant.isDefault,
        })),
      addOns: extras
        .filter((extra) => extra.serviceId === service.id)
        .map(({ addOn }) => ({
          slug: addOn.slug,
          nameDe: addOn.nameDe,
          nameEn: addOn.nameEn,
          priceCents: addOn.priceCents,
          durationMinutes: addOn.durationMinutes,
        })),
    })),
  });
}
