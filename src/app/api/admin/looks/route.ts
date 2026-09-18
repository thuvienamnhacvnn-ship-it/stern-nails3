import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';

/**
 * PATCH /api/admin/looks — publish or withdraw a look.
 *
 * Withdrawing takes the look out of the gallery, out of the booking flow and
 * out of the stylist's allowlist, because all three read the same `published`
 * flag. Bookings that already reference it keep their reference: what somebody
 * agreed to is not rewritten by a later editorial decision.
 */
const Body = z.object({ lookId: z.string().uuid(), published: z.boolean() });

export async function PATCH(request: Request) {
  const auth = await requireStaff('content.write');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === 'unauthenticated' ? 401 : 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [before] = await db.select().from(schema.look).where(eq(schema.look.id, parsed.data.lookId)).limit(1);
  if (!before) return NextResponse.json({ error: 'unknown_look' }, { status: 404 });

  const [after] = await db
    .update(schema.look)
    .set({ published: parsed.data.published })
    .where(eq(schema.look.id, parsed.data.lookId))
    .returning();

  await audit({
    actorType: 'staff',
    actorId: auth.staff.id,
    actorLabel: auth.staff.displayName,
    action: parsed.data.published ? 'look.published' : 'look.unpublished',
    entity: 'look',
    entityId: after.id,
    before: { published: before.published },
    after: { published: after.published, slug: after.slug },
  });

  return NextResponse.json({ slug: after.slug, published: after.published });
}
