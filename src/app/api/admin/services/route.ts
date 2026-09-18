import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';

/**
 * PATCH /api/admin/services — change duration, price or publication.
 *
 * Every write is audited with the values on both sides. A price change is the
 * single most consequential edit in this application: it decides what the next
 * customer is charged, and "it said fifty yesterday" has to be answerable from
 * the record rather than from memory.
 *
 * `priceCents: null` is meaningful and is accepted — it is how a service is
 * moved back to "Preis auf Anfrage", which also switches off online payment for
 * it. Zero is *not* the same thing and is not treated as such anywhere.
 */
const Body = z.object({
  serviceId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(600),
  priceCents: z.number().int().min(0).max(1000000).nullable(),
  published: z.boolean(),
});

export async function PATCH(request: Request) {
  const auth = await requireStaff('catalogue.write');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === 'unauthenticated' ? 401 : 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [before] = await db
    .select()
    .from(schema.service)
    .where(eq(schema.service.id, parsed.data.serviceId))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'unknown_service' }, { status: 404 });

  const [after] = await db
    .update(schema.service)
    .set({
      durationMinutes: parsed.data.durationMinutes,
      priceCents: parsed.data.priceCents,
      published: parsed.data.published,
    })
    .where(eq(schema.service.id, parsed.data.serviceId))
    .returning();

  await audit({
    actorType: 'staff',
    actorId: auth.staff.id,
    actorLabel: auth.staff.displayName,
    action: 'service.updated',
    entity: 'service',
    entityId: after.id,
    before: {
      durationMinutes: before.durationMinutes,
      priceCents: before.priceCents,
      published: before.published,
    },
    after: {
      durationMinutes: after.durationMinutes,
      priceCents: after.priceCents,
      published: after.published,
    },
  });

  return NextResponse.json({
    slug: after.slug,
    durationMinutes: after.durationMinutes,
    priceCents: after.priceCents,
    published: after.published,
  });
}
