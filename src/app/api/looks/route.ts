import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

/**
 * GET /api/looks — the published lookbook.
 *
 * Filtering happens on the server page rather than here; this endpoint is the
 * plain list, which is what the stylist's allowlist and any future client
 * would want.
 */
export async function GET() {
  const looks = await db
    .select()
    .from(schema.look)
    .where(eq(schema.look.published, true))
    .orderBy(asc(schema.look.sortOrder));

  return NextResponse.json({
    looks: looks.map((look) => ({
      slug: look.slug,
      nameDe: look.nameDe,
      nameEn: look.nameEn,
      teaserDe: look.teaserDe,
      teaserEn: look.teaserEn,
      collection: look.collection,
      colors: look.colors,
      shape: look.shape,
      length: look.length,
      finish: look.finish,
      tags: look.tags,
      mediaSlug: look.mediaSlug,
      suggestedServiceSlug: look.suggestedServiceSlug,
      // Every one of these is a designed image, and the client has to label it
      // as inspiration rather than as a photograph of finished work.
      isInspiration: true,
    })),
  });
}
