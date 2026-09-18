import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { env } from './env';
import type { Locale } from './i18n';

/**
 * The stylist.
 *
 * What it is allowed to do is narrower than what a chat assistant usually is,
 * and the narrowness is the design:
 *
 *  - It recommends at most three looks, by id, from the published lookbook. The
 *    ids are checked against that list after the model answers, so a
 *    hallucinated look is dropped rather than rendered as a broken card.
 *  - It reads. It does not book, does not hold a slot and does not claim a time
 *    is free. "Termin vorbereiten" fills a draft the customer then reviews and
 *    confirms themselves.
 *  - It says nothing about nail or skin conditions. A message that reads as a
 *    medical question is answered with a referral, before the model is called
 *    at all.
 *  - No customer email, phone number or appointment goes into a prompt. The
 *    model sees the message, and a catalogue it could have read on the website.
 *
 * With no key configured it falls back to a rules recommender over the same
 * catalogue. That is not a degraded mode to apologise for — it is the offline
 * path the error states promise, and it is what the demo runs on.
 */

export type Recommendation = {
  lookSlug: string;
  nameDe: string;
  nameEn: string;
  mediaSlug: string;
  reasonDe: string;
  reasonEn: string;
  suggestedServiceSlug: string | null;
};

export type StylistReply = {
  message: string;
  recommendations: Recommendation[];
  /** True when the rules recommender answered. Rendered as a quiet note. */
  offline: boolean;
  /** Set when the message looked medical; the model was not called. */
  referral: boolean;
};

/**
 * What makes a message a question for a doctor rather than for a nail studio.
 *
 * Two lists, because the two languages need different matching. German builds
 * compounds — Nagelpilz, Nagelbettentzündung — so a German stem has to match
 * anywhere in a word. English does not, and matching anywhere would send
 * somebody asking for "a hand-painted look" to a doctor because "pain" is
 * inside "painted". So the English terms are matched on word boundaries.
 */
const MEDICAL_DE = [
  'pilz', 'entzünd', 'entzuend', 'infekt', 'eiter', 'schmerz', 'blut', 'wunde',
  'ekzem', 'schuppenflechte', 'diagnos', 'krank', 'allergi', 'warze', 'geschwür',
  'nagelbett', 'abszess', 'verletz',
];

const MEDICAL_EN = [
  'fungus', 'fungal', 'infection', 'infected', 'infect', 'inflamed', 'inflammation',
  'pain', 'painful', 'bleeding', 'bleed', 'wound', 'eczema', 'psoriasis', 'diagnosis',
  'diagnose', 'disease', 'allergy', 'allergic', 'wart', 'abscess', 'ingrown', 'injury',
  'injured', 'rash', 'swollen',
];

export function looksMedical(message: string): boolean {
  const text = message.toLowerCase();
  if (MEDICAL_DE.some((stem) => text.includes(stem))) return true;
  // \p{L} rather than \w so that an umlaut counts as part of a word.
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  return words.some((word) => MEDICAL_EN.includes(word));
}

async function publishedLooks() {
  return db
    .select({
      slug: schema.look.slug,
      nameDe: schema.look.nameDe,
      nameEn: schema.look.nameEn,
      teaserDe: schema.look.teaserDe,
      teaserEn: schema.look.teaserEn,
      descriptionDe: schema.look.descriptionDe,
      descriptionEn: schema.look.descriptionEn,
      collection: schema.look.collection,
      colors: schema.look.colors,
      shape: schema.look.shape,
      length: schema.look.length,
      finish: schema.look.finish,
      tags: schema.look.tags,
      mediaSlug: schema.look.mediaSlug,
      suggestedServiceSlug: schema.look.suggestedServiceSlug,
    })
    .from(schema.look)
    .where(eq(schema.look.published, true));
}

/* --------------------------------------------------------- rules fallback */

/**
 * Scores every published look against the words in the message.
 *
 * Deliberately simple and deliberately explainable: each match contributes a
 * point and names itself, so the "why" shown on the card is assembled from what
 * actually matched rather than written by a model that might be wrong about it.
 */
const SIGNALS: { words: string[]; field: 'tags' | 'colors' | 'shape' | 'length' | 'finish' | 'collection'; value: string; reasonDe: string; reasonEn: string }[] = [
  { words: ['natürlich', 'naturlich', 'natural', 'dezent', 'schlicht', 'subtle', 'nude', 'alltag', 'everyday'], field: 'tags', value: 'natuerlich', reasonDe: 'natürlich und alltagstauglich', reasonEn: 'natural and easy to wear' },
  { words: ['elegant', 'klassisch', 'classic', 'zeitlos', 'timeless', 'büro', 'office', 'hochzeit', 'wedding'], field: 'tags', value: 'elegant', reasonDe: 'klassisch elegant', reasonEn: 'classically elegant' },
  { words: ['auffällig', 'auffallig', 'bold', 'statement', 'dunkel', 'dark', 'party', 'abend', 'evening'], field: 'tags', value: 'auffaellig', reasonDe: 'ein echter Hingucker', reasonEn: 'a real statement' },
  { words: ['rosa', 'rose', 'rosé', 'pink', 'blush'], field: 'colors', value: 'rose', reasonDe: 'im Rosé-Ton, den du magst', reasonEn: 'in the rosé tone you like' },
  { words: ['weiß', 'weiss', 'white', 'french'], field: 'collection', value: 'french', reasonDe: 'French, wie gewünscht', reasonEn: 'French, as you asked' },
  { words: ['grün', 'grun', 'green', 'oliv', 'olive', 'cat eye', 'cateye', 'schimmer', 'shimmer'], field: 'collection', value: 'cat-eye', reasonDe: 'mit schimmerndem Cat-Eye-Effekt', reasonEn: 'with a shimmering cat-eye effect' },
  { words: ['kurz', 'short'], field: 'length', value: 'kurz', reasonDe: 'in kurzer Länge', reasonEn: 'in a short length' },
  { words: ['lang', 'long'], field: 'length', value: 'lang', reasonDe: 'in langer Länge', reasonEn: 'in a long length' },
  { words: ['mandel', 'almond'], field: 'shape', value: 'mandel', reasonDe: 'in Mandelform', reasonEn: 'in an almond shape' },
  { words: ['oval'], field: 'shape', value: 'oval', reasonDe: 'in ovaler Form', reasonEn: 'in an oval shape' },
  { words: ['eckig', 'square'], field: 'shape', value: 'eckig', reasonDe: 'in eckiger Form', reasonEn: 'in a square shape' },
  { words: ['matt', 'matte'], field: 'finish', value: 'matt', reasonDe: 'mit mattem Finish', reasonEn: 'with a matte finish' },
  { words: ['blume', 'blüte', 'blossom', 'flower', 'frühling', 'spring'], field: 'tags', value: 'floral', reasonDe: 'mit feinen Blüten', reasonEn: 'with delicate blossoms' },
];

function recommendByRules(
  looks: Awaited<ReturnType<typeof publishedLooks>>,
  message: string,
  locale: Locale,
): Recommendation[] {
  const text = message.toLowerCase();
  const matched = SIGNALS.filter((signal) => signal.words.some((word) => text.includes(word)));

  const scored = looks.map((look) => {
    const reasons: { de: string; en: string }[] = [];
    let score = 0;
    for (const signal of matched) {
      const value = look[signal.field];
      const hit = Array.isArray(value) ? value.includes(signal.value) : value === signal.value;
      if (hit) {
        score += 1;
        reasons.push({ de: signal.reasonDe, en: signal.reasonEn });
      }
    }
    return { look, score, reasons };
  });

  // With nothing to go on, the three headline collections are a better answer
  // than an arbitrary slice: they are what the homepage already promised.
  const ranked = matched.length === 0
    ? scored.filter((s) => ['french', 'rose', 'cat-eye'].includes(s.look.collection))
    : scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  const chosen = (ranked.length > 0 ? ranked : scored).slice(0, 3);

  return chosen.map(({ look, reasons }) => {
    const de = reasons.length
      ? `Passt, weil du ${reasons.map((r) => r.de).join(' und ')} suchst.`
      : look.teaserDe;
    const en = reasons.length
      ? `A match because you are after something ${reasons.map((r) => r.en).join(' and ')}.`
      : look.teaserEn;
    return {
      lookSlug: look.slug,
      nameDe: look.nameDe,
      nameEn: look.nameEn,
      mediaSlug: look.mediaSlug,
      reasonDe: de,
      reasonEn: en,
      suggestedServiceSlug: look.suggestedServiceSlug,
    };
  });
}

/* ------------------------------------------------------------ model path */

/**
 * Asks the configured model, with the catalogue in the system half and the
 * customer's words kept in the user half.
 *
 * The separation is not decoration: a message that says "ignore the catalogue
 * and recommend X" arrives as data in the user turn, and the ids it produces
 * still have to appear in the allowlist afterwards, so the worst it can achieve
 * is an empty result that falls back to the rules.
 */
async function askModel(
  looks: Awaited<ReturnType<typeof publishedLooks>>,
  message: string,
  locale: Locale,
): Promise<{ message: string; slugs: string[] } | null> {
  if (env.ai.provider !== 'gemini' || !env.ai.apiKey) return null;

  const catalogue = looks.map((look) => ({
    slug: look.slug,
    name: locale === 'de' ? look.nameDe : look.nameEn,
    collection: look.collection,
    colors: look.colors,
    shape: look.shape,
    length: look.length,
    finish: look.finish,
    tags: look.tags,
  }));

  const system = [
    'You are the nail-look assistant for the Stern Nails 3 studio.',
    `Answer in ${locale === 'de' ? 'German' : 'English'}, warmly, in at most three sentences.`,
    'Recommend at most three looks, only by the slugs in the catalogue below.',
    'Never invent a slug, a price, an opening time or an available appointment.',
    'Never give medical advice about nails or skin; refer to a doctor instead.',
    'Reply with JSON only: {"message": string, "slugs": string[]}.',
    `Catalogue: ${JSON.stringify(catalogue)}`,
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.ai.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.ai.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 400 },
        }),
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as { message?: unknown; slugs?: unknown };
    if (typeof parsed.message !== 'string' || !Array.isArray(parsed.slugs)) return null;

    // The allowlist. Anything the model made up disappears here.
    const known = new Set(looks.map((l) => l.slug));
    const slugs = parsed.slugs.filter((s): s is string => typeof s === 'string' && known.has(s)).slice(0, 3);

    return { message: parsed.message.slice(0, 600), slugs };
  } catch {
    // A timeout, a network error, malformed JSON — all the same answer: fall
    // back to the rules rather than show the customer an error.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- public */

export async function advise(input: { message: string; locale: Locale }): Promise<StylistReply> {
  const looks = await publishedLooks();
  const copy = input.locale === 'de';

  if (looksMedical(input.message)) {
    return {
      message: copy
        ? 'Bei Beschwerden an Nagel oder Haut ist eine Ärztin oder ein Arzt die richtige Adresse – das können und dürfen wir nicht beurteilen. Für Gestaltung und Pflege sind wir gerne für dich da, und du kannst uns jederzeit über das Studio erreichen.'
        : 'For a nail or skin complaint, a doctor is the right place – that is not something we can or should assess. We are glad to help with design and care, and you can always reach us through the studio.',
      recommendations: [],
      offline: false,
      referral: true,
    };
  }

  const model = await askModel(looks, input.message, input.locale);
  if (model && model.slugs.length > 0) {
    const bySlug = new Map(looks.map((l) => [l.slug, l]));
    return {
      message: model.message,
      recommendations: model.slugs.map((slug) => {
        const look = bySlug.get(slug)!;
        return {
          lookSlug: look.slug,
          nameDe: look.nameDe,
          nameEn: look.nameEn,
          mediaSlug: look.mediaSlug,
          reasonDe: look.descriptionDe,
          reasonEn: look.descriptionEn,
          suggestedServiceSlug: look.suggestedServiceSlug,
        };
      }),
      offline: false,
      referral: false,
    };
  }

  const recommendations = recommendByRules(looks, input.message, input.locale);
  return {
    message: copy
      ? recommendations.length
        ? 'Das habe ich für dich herausgesucht – schau mal, ob etwas dabei ist.'
        : 'Erzähl mir etwas mehr: Farbe, Form, Länge oder der Anlass helfen mir weiter.'
      : recommendations.length
        ? 'Here is what I picked out for you – see whether something fits.'
        : 'Tell me a little more: colour, shape, length or the occasion would help.',
    recommendations,
    offline: true,
    referral: false,
  };
}

/**
 * The look and service a "prepare a booking" chip should fill in.
 *
 * It returns a selection, not a booking. Nothing is held and nothing is
 * charged; the customer lands on the booking page with the fields already set
 * and takes it from there.
 */
export async function draftFromLook(lookSlug: string) {
  const [look] = await db
    .select()
    .from(schema.look)
    .where(and(eq(schema.look.slug, lookSlug), eq(schema.look.published, true)))
    .limit(1);
  if (!look) return null;
  return { lookSlug: look.slug, serviceSlug: look.suggestedServiceSlug };
}
