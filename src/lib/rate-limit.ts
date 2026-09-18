import 'server-only';

/**
 * A small in-process rate limiter.
 *
 * It is a Map with a sliding window, which is exactly right for one node
 * process and exactly wrong for several: behind more than one instance this
 * needs to move to the database or to Redis. It is here because an unlimited
 * stylist endpoint is an unlimited bill, and an unlimited login endpoint is an
 * invitation.
 *
 * Buckets live on globalThis so a hot reload does not reset everyone's budget.
 */
declare global {
  // eslint-disable-next-line no-var
  var __sternRateLimit: Map<string, number[]> | undefined;
}

const buckets = (globalThis.__sternRateLimit ??= new Map<string, number[]>());

export type Limit = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, max: number, windowSeconds: number, now = Date.now()): Limit {
  const window = windowSeconds * 1000;
  const hits = (buckets.get(key) ?? []).filter((at) => at > now - window);

  if (hits.length >= max) {
    buckets.set(key, hits);
    const retry = Math.ceil((hits[0] + window - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retry) };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Cheap housekeeping: without it the map grows one key per address forever.
  if (buckets.size > 5000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((at) => at <= now - window)) buckets.delete(bucketKey);
    }
  }

  return { allowed: true, remaining: max - hits.length, retryAfterSeconds: 0 };
}

/**
 * A caller key from the request.
 *
 * `x-forwarded-for` is only trustworthy behind our own proxy, which is why the
 * value is used for rate limiting and for nothing else — never for
 * authorisation, never written to a record as a fact about the user.
 */
export function callerKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim() || 'local';
  return `${scope}:${ip}`;
}
