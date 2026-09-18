import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { currentCustomer } from '@/lib/auth';

/**
 * Favourites for a signed-in customer.
 *
 * POST adds one, DELETE removes one, PUT merges a whole list — which is what a
 * browser does once when its owner signs in, handing over the hearts they
 * tapped before they had an account.
 *
 * Every statement is scoped to the customer id from the session. A look slug
 * that does not exist is ignored rather than erroring: syncing a stale local
 * list should not fail because one look was withdrawn in the meantime.
 */

async function lookIdFor(slug: string) {
  const [look] = await db
    .select({ id: schema.look.id })
    .from(schema.look)
    .where(and(eq(schema.look.slug, slug), eq(schema.look.published, true)))
    .limit(1);
  return look?.id ?? null;
}

export async function POST(request: Request) {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = z.object({ lookSlug: z.string().min(1).max(80) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const lookId = await lookIdFor(parsed.data.lookSlug);
  if (!lookId) return NextResponse.json({ error: 'unknown_look' }, { status: 404 });

  await db
    .insert(schema.favorite)
    .values({ customerId: customer.id, lookId })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = z.object({ lookSlug: z.string().min(1).max(80) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const lookId = await lookIdFor(parsed.data.lookSlug);
  if (!lookId) return NextResponse.json({ ok: true });

  await db
    .delete(schema.favorite)
    .where(and(eq(schema.favorite.customerId, customer.id), eq(schema.favorite.lookId, lookId)));

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = z
    .object({ lookSlugs: z.array(z.string().min(1).max(80)).max(200) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  if (parsed.data.lookSlugs.length === 0) return NextResponse.json({ merged: 0 });

  const looks = await db
    .select({ id: schema.look.id })
    .from(schema.look)
    .where(and(eq(schema.look.published, true), inArray(schema.look.slug, parsed.data.lookSlugs)));

  if (looks.length === 0) return NextResponse.json({ merged: 0 });

  // A merge, not a replace: what is already on the account stays.
  await db
    .insert(schema.favorite)
    .values(looks.map((look) => ({ customerId: customer.id, lookId: look.id })))
    .onConflictDoNothing();

  return NextResponse.json({ merged: looks.length });
}
