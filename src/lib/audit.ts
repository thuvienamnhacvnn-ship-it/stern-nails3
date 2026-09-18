import 'server-only';

import { db, schema } from '@/db/client';

/**
 * The audit trail.
 *
 * Price changes, cancellations and refunds are written here with who did it and
 * what the values were on both sides. It is append-only by convention — nothing
 * in the application updates or deletes a row — and it is what the owner reads
 * when a customer says the price was different yesterday.
 *
 * Nothing sensitive goes in `before`/`after`: identifiers and amounts, never a
 * voucher code or a token.
 */
export async function audit(entry: {
  actorType: 'staff' | 'customer' | 'system';
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await db.insert(schema.auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before === undefined ? null : (entry.before as object),
    after: entry.after === undefined ? null : (entry.after as object),
  });
}
