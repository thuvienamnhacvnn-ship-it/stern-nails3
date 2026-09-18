import 'server-only';

import { db, schema } from '@/db/client';

/**
 * The studio's own record, and what is still missing from it.
 *
 * Every optional field starts null and stays null until the owner fills it in.
 * The UI reads `contactReady` to decide whether to render a phone link at all,
 * rather than printing a placeholder — a made-up number on a real website is
 * worse than no number.
 */
export type Settings = typeof schema.businessSettings.$inferSelect;

export async function settings(): Promise<Settings | null> {
  const [row] = await db.select().from(schema.businessSettings).limit(1);
  return row ?? null;
}

/** Fields the owner has to supply before the site can go live. */
export const REQUIRED_BEFORE_LIVE = [
  'street', 'postalCode', 'city', 'phone', 'email',
  'legalEntity', 'legalRepresentative', 'cancellationPolicy',
] as const;

export function missingBeforeLive(row: Settings | null): string[] {
  if (!row) return [...REQUIRED_BEFORE_LIVE];
  return REQUIRED_BEFORE_LIVE.filter((field) => {
    const value = row[field];
    return value === null || value === undefined || value === '';
  });
}

/**
 * What each missing field is called, in each language.
 *
 * Lives here rather than in either page because both the public imprint and the
 * admin checklist print this list, and a visitor being told the site is missing
 * "legalRepresentative" is a column name leaking onto a website.
 */
export const FIELD_LABEL: Record<(typeof REQUIRED_BEFORE_LIVE)[number], { de: string; en: string }> = {
  street: { de: 'Straße und Hausnummer', en: 'Street and number' },
  postalCode: { de: 'PLZ', en: 'Postcode' },
  city: { de: 'Ort', en: 'Town' },
  phone: { de: 'Telefonnummer', en: 'Phone number' },
  email: { de: 'E-Mail-Adresse', en: 'Email address' },
  legalEntity: { de: 'Firmierung', en: 'Legal name' },
  legalRepresentative: { de: 'Vertretungsberechtigte Person', en: 'Authorised representative' },
  cancellationPolicy: { de: 'Stornierungsbedingungen', en: 'Cancellation policy' },
};

export function fieldLabel(field: string, locale: 'de' | 'en'): string {
  return FIELD_LABEL[field as keyof typeof FIELD_LABEL]?.[locale] ?? field;
}

export function contactReady(row: Settings | null) {
  return {
    address: Boolean(row?.street && row?.postalCode && row?.city),
    phone: Boolean(row?.phone),
    email: Boolean(row?.email),
    map: Boolean(row?.street && row?.city),
  };
}
