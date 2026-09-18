/**
 * Money is integer cents. There is no other representation in this codebase:
 * no euros as floats, no strings that get parsed back. Formatting happens once,
 * at the edge, here.
 */

export type Locale = 'de' | 'en';

const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(locale: Locale): Intl.NumberFormat {
  const key = locale;
  let existing = FORMATTERS.get(key);
  if (!existing) {
    existing = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    });
    FORMATTERS.set(key, existing);
  }
  return existing;
}

/** `50,00 €` in German, `€50.00` in English. */
export function formatCents(cents: number, locale: Locale = 'de'): string {
  return formatter(locale).format(cents / 100);
}

/**
 * A price line for something the owner has not priced yet.
 *
 * Null is never rendered as 0,00 €. A service without a confirmed price is
 * "Preis auf Anfrage" and cannot be checked out — that rule is enforced on the
 * server too, in the booking totals.
 */
export function formatPrice(cents: number | null, locale: Locale = 'de'): string {
  if (cents === null) return locale === 'de' ? 'Preis auf Anfrage' : 'Price on request';
  return formatCents(cents, locale);
}

/**
 * Adds prices where a single null poisons the sum: if any line is still
 * price-on-request, the total is on request too, not the sum of the rest.
 */
export function sumCents(values: (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

/** Minutes as `60 Min.` / `60 min`. */
export function formatDuration(minutes: number, locale: Locale = 'de'): string {
  return locale === 'de' ? `${minutes} Min.` : `${minutes} min`;
}
