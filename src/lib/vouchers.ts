import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { hashVoucherCode, normaliseVoucherCode, randomVoucherCode } from './crypto';
import { formatCents } from './money';
import { queueEmail } from './notify';
import { audit } from './audit';
import { env } from './env';
import type { Locale } from './i18n';

/**
 * Gift cards.
 *
 * Two rules shape this file:
 *
 *  - A code exists only after money has arrived. `createVoucherOrder` makes a
 *    row with no code and status `pending_payment`; `issueVoucher` is what a
 *    paid webhook calls, and it is the only thing that mints one.
 *  - The balance is the ledger. Every movement writes a row with the resulting
 *    balance, and a redemption is a conditional UPDATE that only succeeds while
 *    the balance is still what it was — so two simultaneous redemptions cannot
 *    both spend the same twenty euros.
 *
 * The plain code is returned exactly once, to the caller that mints it, and
 * goes into the email. Nothing writes it to a log.
 */

export class VoucherError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'VoucherError';
  }
}

/** Amounts the owner has approved. Anything else is refused server-side. */
export async function allowedAmounts(): Promise<number[]> {
  // Seeded values; the admin vouchers page is where these will be edited once
  // the studio has decided on a real range.
  return [2500, 5000, 10000];
}

export async function createVoucherOrder(input: {
  amountCents: number;
  recipientName?: string | null;
  recipientEmail?: string | null;
  purchaserEmail?: string | null;
  message?: string | null;
  deliverAt?: Date | null;
}) {
  const allowed = await allowedAmounts();
  if (!allowed.includes(input.amountCents)) throw new VoucherError('amount_not_allowed');

  const [row] = await db
    .insert(schema.voucher)
    .values({
      // Placeholders until payment settles. The unique index is on the hash, so
      // a random one keeps unpaid orders from colliding with each other.
      codeHash: `pending:${crypto.randomUUID()}`,
      codeHint: '····',
      status: 'pending_payment',
      initialCents: input.amountCents,
      balanceCents: 0,
      recipientName: input.recipientName?.trim() || null,
      recipientEmail: input.recipientEmail?.trim().toLowerCase() || null,
      purchaserEmail: input.purchaserEmail?.trim().toLowerCase() || null,
      message: input.message?.trim() || null,
      deliverAt: input.deliverAt ?? null,
      // Three years is the German default for a gift card without a stated term.
      expiresAt: new Date(Date.now() + 3 * 365 * 86400000),
      isDemo: env.demoMode,
    })
    .returning();

  return row;
}

/**
 * Mints the code and sends it. Called from the paid-payment path, never from a
 * request handler that has only seen a return URL.
 */
export async function issueVoucher(voucherId: string, locale: Locale = 'de') {
  const [existing] = await db.select().from(schema.voucher).where(eq(schema.voucher.id, voucherId)).limit(1);
  if (!existing) throw new VoucherError('unknown_voucher');
  // Issuing twice for a replayed webhook would mint a second code for money
  // that was paid once.
  if (existing.status !== 'pending_payment') return { voucher: existing, code: null as string | null };

  const code = randomVoucherCode();

  const voucher = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.voucher)
      .set({
        codeHash: hashVoucherCode(code),
        codeHint: normaliseVoucherCode(code).slice(0, 4),
        status: 'active',
        balanceCents: existing.initialCents,
      })
      .where(and(eq(schema.voucher.id, voucherId), eq(schema.voucher.status, 'pending_payment')))
      .returning();
    if (!row) throw new VoucherError('already_issued');

    await tx.insert(schema.voucherLedger).values({
      voucherId,
      kind: 'issued',
      deltaCents: existing.initialCents,
      balanceAfterCents: existing.initialCents,
      note: 'payment settled',
    });
    return row;
  });

  await audit({
    actorType: 'system',
    actorLabel: 'payment webhook',
    action: 'voucher.issued',
    entity: 'voucher',
    entityId: voucherId,
    // The hint, never the code.
    after: { amountCents: voucher.initialCents, codeHint: voucher.codeHint },
  });

  const to = voucher.recipientEmail ?? voucher.purchaserEmail;
  if (to) {
    const amount = formatCents(voucher.initialCents, locale);
    await queueEmail({
      kind: 'voucher_issued',
      to,
      subject: locale === 'de' ? `Dein Gutschein über ${amount}` : `Your ${amount} gift card`,
      body:
        locale === 'de'
          ? `Hallo ${voucher.recipientName ?? ''},\n\ndu hast einen Gutschein über ${amount} für Stern Nails 3 erhalten.\n\nCode: ${code}\n${voucher.message ? `\n„${voucher.message}“\n` : ''}\nEinlösbar bei deiner Buchung auf ${env.publicUrl}/de/termin\n${env.demoMode ? '\nHinweis: Demomodus – dieser Gutschein hat keinen echten Gegenwert.\n' : ''}\nStern Nails 3`
          : `Hello ${voucher.recipientName ?? ''},\n\nyou have received a ${amount} gift card for Stern Nails 3.\n\nCode: ${code}\n${voucher.message ? `\n"${voucher.message}"\n` : ''}\nRedeem it when you book at ${env.publicUrl}/en/booking\n${env.demoMode ? '\nNote: demo mode – this card has no real value.\n' : ''}\nStern Nails 3`,
      voucherId,
    });
  }

  return { voucher, code };
}

export async function findByCode(code: string) {
  const normalised = normaliseVoucherCode(code);
  if (normalised.length < 8) return null;
  const [row] = await db
    .select()
    .from(schema.voucher)
    .where(eq(schema.voucher.codeHash, hashVoucherCode(normalised)))
    .limit(1);
  return row ?? null;
}

/**
 * Spends from a gift card.
 *
 * The UPDATE carries `balance_cents = <what we read>` in its WHERE clause.
 * Under two concurrent redemptions the second update matches no row, and the
 * caller gets `insufficient_balance` instead of a card that has paid for more
 * than it was worth.
 */
export async function redeem(input: {
  code: string;
  amountCents: number;
  bookingId: string;
  now?: Date;
}): Promise<{ appliedCents: number; balanceCents: number; voucherId: string }> {
  const now = input.now ?? new Date();
  const voucher = await findByCode(input.code);
  if (!voucher) throw new VoucherError('unknown_code');
  /*
   * Order matters for the message the customer gets. A card that has been spent
   * is `depleted`, not `active`, so checking the status first would report the
   * useless "not valid" for the very common case of a card with nothing left on
   * it. Empty is checked first so the checkout can say so plainly.
   */
  if (voucher.status === 'depleted' || voucher.balanceCents <= 0) throw new VoucherError('empty');
  if (voucher.status !== 'active') throw new VoucherError('not_active');
  if (voucher.expiresAt && voucher.expiresAt <= now) throw new VoucherError('expired');

  const applied = Math.min(voucher.balanceCents, input.amountCents);

  return db.transaction(async (tx) => {
    const after = voucher.balanceCents - applied;
    const [updated] = await tx
      .update(schema.voucher)
      .set({ balanceCents: after, status: after === 0 ? 'depleted' : 'active' })
      .where(
        and(
          eq(schema.voucher.id, voucher.id),
          // The optimistic guard. Without it, two redemptions both read 50 €
          // and both write 30 €.
          eq(schema.voucher.balanceCents, voucher.balanceCents),
          eq(schema.voucher.status, 'active'),
        ),
      )
      .returning();
    if (!updated) throw new VoucherError('insufficient_balance');

    await tx.insert(schema.voucherLedger).values({
      voucherId: voucher.id,
      kind: 'redeemed',
      deltaCents: -applied,
      balanceAfterCents: after,
      bookingId: input.bookingId,
    });

    await tx
      .update(schema.booking)
      .set({
        voucherId: voucher.id,
        discountCents: sql`${schema.booking.discountCents} + ${applied}`,
        updatedAt: now,
      })
      .where(eq(schema.booking.id, input.bookingId));

    return { appliedCents: applied, balanceCents: after, voucherId: voucher.id };
  });
}

/** The ledger for one card, newest first, for the admin page. */
export async function ledgerFor(voucherId: string) {
  return db
    .select()
    .from(schema.voucherLedger)
    .where(eq(schema.voucherLedger.voucherId, voucherId))
    .orderBy(sql`${schema.voucherLedger.createdAt} desc`);
}
