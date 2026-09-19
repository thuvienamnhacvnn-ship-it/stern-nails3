import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';

/**
 * PATCH /api/admin/settings — the studio's own record.
 *
 * Owner only. These fields decide what the imprint says and how the booking
 * engine behaves, which is a different kind of change from editing a price.
 *
 * Empty strings become null rather than empty text, because "not supplied yet"
 * is a state the customer pages check for: an empty-string phone number would
 * render a `tel:` link to nowhere.
 */
const optionalText = z
  .string()
  .max(400)
  .transform((value) => (value.trim() === '' ? null : value.trim()));

const Body = z.object({
  street: optionalText,
  postalCode: optionalText,
  city: optionalText,
  phone: optionalText,
  email: optionalText,
  legalEntity: optionalText,
  legalRepresentative: optionalText,
  registerCourt: optionalText,
  registerNumber: optionalText,
  vatId: optionalText,
  instagram: optionalText,
  facebook: optionalText,
  tiktok: optionalText,
  youtube: optionalText,
  cancellationPolicy: z.string().max(4000).transform((v) => (v.trim() === '' ? null : v.trim())),
  // Bounded here as well as in the form: the form is a convenience, this is the
  // rule. A zero-minute hold or a 10-year horizon would break availability.
  holdMinutes: z.number().int().min(2).max(60),
  bufferMinutes: z.number().int().min(0).max(120),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingHorizonDays: z.number().int().min(1).max(365),
});

export async function PATCH(request: Request) {
  const auth = await requireStaff('settings.write');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === 'unauthenticated' ? 401 : 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const [before] = await db.select().from(schema.businessSettings).limit(1);
  if (!before) return NextResponse.json({ error: 'not_initialised' }, { status: 409 });

  const [after] = await db
    .update(schema.businessSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.businessSettings.id, before.id))
    .returning();

  // Which fields moved, not their contents: the audit log is read by people and
  // should not become a second copy of the studio's details.
  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter(
    (key) => String(before[key] ?? '') !== String(after[key] ?? ''),
  );

  await audit({
    actorType: 'staff',
    actorId: auth.staff.id,
    actorLabel: auth.staff.displayName,
    action: 'settings.updated',
    entity: 'business_settings',
    entityId: after.id,
    after: { changedFields: changed },
  });

  return NextResponse.json({ ok: true, changed });
}
