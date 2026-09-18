import 'server-only';

import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto';

/**
 * Secrets, and how they are stored.
 *
 * Nothing that opens a door is written to the database in a readable form: a
 * gift-card code, a sign-in link, a session cookie and a manage-my-booking link
 * are all stored as SHA-256 of the value. A stolen database dump is then a list
 * of hashes, not a set of working keys. The plaintext exists exactly once, in
 * the response or the email that hands it over.
 */

/**
 * A URL-safe random string. 32 bytes of entropy, base64url, which is more than
 * enough that guessing is not an attack even at the rate a booking reference is
 * probed.
 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * The human-facing gift-card code: groups of four from an alphabet with no
 * 0/O/1/I, because it gets read off a PDF and typed in by hand. Still 20
 * characters from a 32-symbol alphabet — 100 bits — so it is unguessable
 * despite being friendly.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomVoucherCode(): string {
  const raw = randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i += 1) {
    if (i > 0 && i % 5 === 0) out += '-';
    out += CODE_ALPHABET[raw[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Codes are compared case- and dash-insensitively; people retype them badly. */
export function normaliseVoucherCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashVoucherCode(code: string): string {
  return hashToken(normaliseVoucherCode(code));
}

/**
 * Password hashing for the handful of staff accounts.
 *
 * scrypt from node's own crypto, because every alternative worth having is a
 * native module and this workstation blocks unsigned native bindings. The
 * parameters are the node defaults raised to 2^15 rounds, which costs about
 * 100 ms here — slow enough to matter offline, fast enough for a login form.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024,
  });
  // Constant time: a length mismatch would otherwise leak through the compare.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Webhook signatures.
 *
 * The demo provider signs with the same scheme the real ones use — HMAC over
 * the raw body with a shared secret — so the verification path in the webhook
 * handler is exercised by the tests rather than bypassed in demo mode and
 * discovered to be broken on the first real event.
 */
export function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signPayload(rawBody, secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * A booking reference a person can read out on the phone. Random, not
 * sequential: a counter would let anybody walk the confirmation pages of
 * everyone who booked before them.
 */
export function bookingReference(): string {
  const raw = randomBytes(8);
  let out = 'SN-';
  for (let i = 0; i < 8; i += 1) {
    if (i === 4) out += '-';
    out += CODE_ALPHABET[raw[i] % CODE_ALPHABET.length];
  }
  return out;
}
