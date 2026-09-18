import 'server-only';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { env } from './env';

/**
 * Outbound messages.
 *
 * Every message is a row first and a network call second. That ordering is the
 * whole design: a provider outage becomes a retry instead of a lost
 * confirmation, and in demo mode there is no second step at all — the message
 * is written to the database and to .data/outbox/, where the admin outbox page
 * and the test suite can both read it.
 *
 * WhatsApp is deliberately inert. It needs a number the studio owns, a business
 * account, and the customer's own choice; until all three exist, queueing one
 * would be a message nobody can deliver.
 */

type QueueInput = {
  kind: (typeof schema.notificationKind.enumValues)[number];
  to: string;
  subject: string;
  body: string;
  attachment?: string;
  attachmentName?: string;
  bookingId?: string;
  voucherId?: string;
  channel?: 'email' | 'whatsapp';
};

export async function queueEmail(input: QueueInput) {
  const [job] = await db
    .insert(schema.notificationJob)
    .values({
      kind: input.kind,
      channel: input.channel ?? 'email',
      toAddress: input.to,
      subject: input.subject,
      body: input.body,
      attachment: input.attachment ?? null,
      attachmentName: input.attachmentName ?? null,
      bookingId: input.bookingId ?? null,
      voucherId: input.voucherId ?? null,
    })
    .returning();

  // Sending happens right away rather than on a timer, because there is no
  // worker process here; a failure just leaves the row queued for the next
  // `flushNotifications` to retry.
  await deliver(job);
  return job;
}

async function deliver(job: typeof schema.notificationJob.$inferSelect) {
  try {
    if (env.email.provider === 'outbox') {
      /*
       * The file copy is for the person running the demo: it is far easier to
       * open .data/outbox/ than to query a WebAssembly Postgres. The row stays
       * the source of truth.
       */
      const dir = join(process.cwd(), '.data', 'outbox');
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeTo = job.toAddress.replace(/[^a-z0-9@._-]/gi, '_');
      writeFileSync(
        join(dir, `${stamp}-${job.kind}-${safeTo}.txt`),
        `To: ${job.toAddress}\nSubject: ${job.subject}\n\n${job.body}\n${
          job.attachment ? `\n--- ${job.attachmentName} ---\n${job.attachment}` : ''
        }`,
        'utf8',
      );
    } else {
      // A real provider goes here. Nothing is stubbed to look like it worked:
      // an unconfigured provider name fails the job, visibly.
      throw new Error(`email provider "${env.email.provider}" is not implemented`);
    }

    await db
      .update(schema.notificationJob)
      .set({ status: 'sent', sentAt: new Date(), attempts: job.attempts + 1 })
      .where(eq(schema.notificationJob.id, job.id));
  } catch (error) {
    await db
      .update(schema.notificationJob)
      .set({
        status: 'failed',
        attempts: job.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(schema.notificationJob.id, job.id));
  }
}

/** Retries whatever failed. Called from the admin outbox and from the tests. */
export async function flushNotifications(maxAttempts = 5) {
  const stuck = await db
    .select()
    .from(schema.notificationJob)
    .where(and(eq(schema.notificationJob.status, 'failed'), lt(schema.notificationJob.attempts, maxAttempts)))
    .limit(50);

  for (const job of stuck) await deliver(job);
  return stuck.length;
}

/** What the admin outbox page shows. */
export async function recentNotifications(limit = 40) {
  return db
    .select()
    .from(schema.notificationJob)
    .orderBy(sql`${schema.notificationJob.createdAt} desc`)
    .limit(limit);
}
