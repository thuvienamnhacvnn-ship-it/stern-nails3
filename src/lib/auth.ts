import 'server-only';

import { cookies, headers } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { hashToken, randomToken, verifyPassword } from './crypto';
import { addMinutes } from './time';
import { queueEmail } from './notify';
import { env } from './env';
import type { Locale } from './i18n';

/**
 * Sessions, for customers and for the team.
 *
 * Two separate cookies, because they are two separate trust levels and a staff
 * session must not be reachable by anything the customer site does. Both hold a
 * random token; only its hash is in the database, so a dump does not hand
 * anybody a working session.
 *
 * `secure` follows the connection, not NODE_ENV. Setting it from the build mode
 * means a production build served over plain HTTP — a LAN demo, a tunnel, the
 * first hour of a new VPS before the certificate lands — sets a cookie the
 * browser silently drops, and the site goes mute: every login "succeeds" and
 * nobody is ever logged in.
 */

const CUSTOMER_COOKIE = 'stern_session';
const STAFF_COOKIE = 'stern_staff';
const CUSTOMER_DAYS = 30;
const STAFF_HOURS = 12;

async function isSecureConnection(): Promise<boolean> {
  const list = await headers();
  const proto = list.get('x-forwarded-proto') ?? '';
  if (proto) return proto.split(',')[0].trim() === 'https';
  // No proxy header: fall back to the host, which is only https when Next is
  // terminating TLS itself.
  return (list.get('origin') ?? '').startsWith('https://');
}

async function setSessionCookie(name: string, token: string, expires: Date) {
  const jar = await cookies();
  jar.set(name, token, {
    httpOnly: true,
    // Lax, not Strict: a confirmation link arriving from the customer's own
    // email client is a cross-site navigation, and Strict would log them out
    // exactly when they click it.
    sameSite: 'lax',
    secure: await isSecureConnection(),
    path: '/',
    expires,
  });
}

/* ---------------------------------------------------------- customer side */

/**
 * Sends a sign-in link.
 *
 * The response is the same whether the address is known or not — an enumeration
 * of who has an account is not something a login form should hand out. In demo
 * mode the link is also returned to the caller so the page can show it, because
 * there is no inbox to check.
 */
export async function requestLoginLink(email: string, locale: Locale): Promise<{ demoLink: string | null }> {
  const address = email.trim().toLowerCase();
  const [customer] = await db
    .insert(schema.customer)
    .values({ email: address })
    .onConflictDoUpdate({ target: schema.customer.email, set: { email: address } })
    .returning();

  const token = randomToken();
  const expiresAt = addMinutes(new Date(), 30);
  await db.insert(schema.authToken).values({
    tokenHash: hashToken(token),
    customerId: customer.id,
    purpose: 'login',
    expiresAt,
  });

  const accountPath = locale === 'de' ? 'konto' : 'account';
  const link = `${env.publicUrl}/${locale}/${accountPath}?token=${token}`;

  await queueEmail({
    kind: 'login_link',
    to: address,
    subject: locale === 'de' ? 'Dein Anmeldelink für Stern Nails 3' : 'Your Stern Nails 3 sign-in link',
    body:
      locale === 'de'
        ? `Hallo,\n\nhier ist dein Anmeldelink. Er gilt 30 Minuten:\n\n${link}\n\nWenn du das nicht warst, ignorier diese E-Mail einfach.\n\nStern Nails 3`
        : `Hello,\n\nhere is your sign-in link. It is valid for 30 minutes:\n\n${link}\n\nIf this was not you, simply ignore this email.\n\nStern Nails 3`,
  });

  return { demoLink: env.demoMode ? link : null };
}

/** Consumes a sign-in token and starts a session. Single use. */
export async function signInWithToken(token: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(schema.authToken)
    .where(and(eq(schema.authToken.tokenHash, hashToken(token)), eq(schema.authToken.purpose, 'login')))
    .limit(1);
  if (!row || !row.customerId || row.usedAt || row.expiresAt <= now) return null;

  // Burning the token before the session exists means a replayed link is dead
  // even if the insert below fails.
  await db.update(schema.authToken).set({ usedAt: now }).where(eq(schema.authToken.id, row.id));

  const sessionToken = randomToken();
  const expiresAt = new Date(now.getTime() + CUSTOMER_DAYS * 86400000);
  await db.insert(schema.session).values({
    tokenHash: hashToken(sessionToken),
    customerId: row.customerId,
    expiresAt,
  });

  await db
    .update(schema.customer)
    .set({ emailVerifiedAt: now })
    .where(eq(schema.customer.id, row.customerId));

  await setSessionCookie(CUSTOMER_COOKIE, sessionToken, expiresAt);
  return row.customerId;
}

export async function currentCustomer() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ customer: schema.customer })
    .from(schema.session)
    .innerJoin(schema.customer, eq(schema.customer.id, schema.session.customerId))
    .where(and(eq(schema.session.tokenHash, hashToken(token)), gt(schema.session.expiresAt, new Date())))
    .limit(1);
  return row?.customer ?? null;
}

export async function signOutCustomer() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await db.delete(schema.session).where(eq(schema.session.tokenHash, hashToken(token)));
  jar.delete(CUSTOMER_COOKIE);
}

/* ------------------------------------------------------------- staff side */

export async function signInStaff(email: string, password: string) {
  const [member] = await db
    .select()
    .from(schema.staff)
    .where(and(eq(schema.staff.email, email.trim().toLowerCase()), eq(schema.staff.active, true)))
    .limit(1);

  // verifyPassword returns false for a null hash, so an account without a
  // password takes the same code path and the same time as a wrong one.
  if (!member || !verifyPassword(password, member.passwordHash)) return null;

  const token = randomToken();
  const expiresAt = new Date(Date.now() + STAFF_HOURS * 3600000);
  await db.insert(schema.session).values({ tokenHash: hashToken(token), staffId: member.id, expiresAt });
  await setSessionCookie(STAFF_COOKIE, token, expiresAt);
  return member;
}

export async function currentStaff() {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ staff: schema.staff })
    .from(schema.session)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.session.staffId))
    .where(and(eq(schema.session.tokenHash, hashToken(token)), gt(schema.session.expiresAt, new Date())))
    .limit(1);
  return row?.staff ?? null;
}

export async function signOutStaff() {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE)?.value;
  if (token) await db.delete(schema.session).where(eq(schema.session.tokenHash, hashToken(token)));
  jar.delete(STAFF_COOKIE);
}

/**
 * Whether a member of staff may do something.
 *
 * Checked on the server for every admin action, not just when drawing the menu:
 * hiding a button is a courtesy, and the endpoint behind it is the actual
 * boundary. `staff` may work their own calendar; changing what the studio sells
 * or how it is configured is a manager's job, and permissions belong to the
 * owner alone.
 */
export type Capability =
  | 'calendar.read.own'
  | 'calendar.read.all'
  | 'booking.update'
  | 'catalogue.write'
  | 'content.write'
  | 'vouchers.read'
  | 'settings.write'
  | 'staff.write';

const CAPABILITIES: Record<(typeof schema.staffRole.enumValues)[number], Capability[]> = {
  owner: [
    'calendar.read.own', 'calendar.read.all', 'booking.update',
    'catalogue.write', 'content.write', 'vouchers.read', 'settings.write', 'staff.write',
  ],
  manager: [
    'calendar.read.own', 'calendar.read.all', 'booking.update',
    'catalogue.write', 'content.write', 'vouchers.read',
  ],
  staff: ['calendar.read.own', 'booking.update'],
};

export function can(role: (typeof schema.staffRole.enumValues)[number], capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/** Throws unless the signed-in member of staff has the capability. */
export async function requireStaff(capability: Capability) {
  const member = await currentStaff();
  if (!member) return { ok: false as const, reason: 'unauthenticated' as const, staff: null };
  if (!can(member.role, capability)) return { ok: false as const, reason: 'forbidden' as const, staff: member };
  return { ok: true as const, reason: null, staff: member };
}
