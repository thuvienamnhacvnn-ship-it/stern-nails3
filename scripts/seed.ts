/**
 * Demo data.
 *
 * Every row this writes is an example. The service names and descriptions read
 * like a real catalogue because a demo with "Service A / 10,00 €" tells nobody
 * anything — but the prices, the durations, the three members of staff and the
 * opening hours are all proposals for the studio to approve, and the interface
 * says so on every page.
 *
 * Three things are deliberately *not* seeded, because inventing them would be
 * worse than leaving the page incomplete: the address, the phone number, and
 * the legal entity. Those stay null until the owner types them in, and the
 * site hides the map, the call link and the imprint body until they exist.
 *
 * Run after `npm run db:migrate`, with the dev server stopped.
 */
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { refuseIfDevServerRunning } from './guard-single-process';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/lib/crypto';

await refuseIfDevServerRunning();

const dir = process.env.DATABASE_DIR ?? '.data/pg';
const client = new PGlite(dir);
const db = drizzle(client, { schema, casing: 'snake_case' });

const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? 'stern-demo-2026';

// Wiping first makes the seed idempotent: run it twice and you get the same
// database, not two catalogues.
await db.execute(sql`
  truncate table
    audit_log, notification_job, voucher_ledger, voucher, payment_event, payment,
    booking_hold, booking_item, booking, favorite, session, auth_token, customer,
    look, service_resource, service_add_on, staff_service, work_schedule, time_off,
    resource, add_on, service_variant, service, staff, media_asset, business_settings
  restart identity cascade
`);

/* -------------------------------------------------------------- settings */

await db.insert(schema.businessSettings).values({
  name: 'Stern Nails 3',
  tagline: 'Schöne Nägel. Schöner Alltag.',
  // Address, phone, email and legal details are the owner's to supply. Leaving
  // them null is what makes the "missing before go-live" list honest.
  timezone: 'Europe/Berlin',
  holdMinutes: 10,
  bufferMinutes: 10,
  bookingHorizonDays: 90,
  minNoticeMinutes: 120,
  paymentMethods: ['on_site', 'card', 'paypal'],
  demoMode: true,
});

/* ----------------------------------------------------------------- media */

const MEDIA = [
  {
    slug: 'hero-banner', sourceType: 'ai_concept' as const, width: 1790, height: 879,
    altDe: 'Blick in den Salon: begrünte Wand mit beleuchtetem Stern-Nails-3-Schriftzug, Kirschblütenbaum und helle Arbeitsplätze',
    altEn: 'A view into the salon: a green plant wall with the illuminated Stern Nails 3 sign, a blossom tree and bright work stations',
    focalPoint: '52% 42%',
    disclosureDe: 'Konzeptvisualisierung', disclosureEn: 'Concept visualisation',
  },
  {
    slug: 'hero-salon-wide', sourceType: 'ai_concept' as const, width: 1672, height: 941,
    altDe: 'Salonraum mit begrünter Wand, Kirschblütenbaum und hellen Arbeitsplätzen',
    altEn: 'Salon room with a green plant wall, blossom tree and bright work stations',
    focalPoint: '55% 45%',
    disclosureDe: 'Konzeptvisualisierung', disclosureEn: 'Concept visualisation',
  },
  {
    slug: 'studio-portrait', sourceType: 'ai_concept' as const, width: 1086, height: 1448,
    altDe: 'Blick in den Salon im Hochformat', altEn: 'Portrait view into the salon',
    disclosureDe: 'Konzeptvisualisierung', disclosureEn: 'Concept visualisation',
  },
  {
    slug: 'pedicure-wide', sourceType: 'ai_concept' as const, width: 1448, height: 1086,
    altDe: 'Pediküre-Bereich mit Fußbad und Sessel', altEn: 'Pedicure area with a foot bath and chair',
    disclosureDe: 'Konzeptvisualisierung', disclosureEn: 'Concept visualisation',
  },
  {
    slug: 'care-still-life', sourceType: 'ai_concept' as const, width: 1086, height: 1448,
    altDe: 'Pflegeprodukte, Handtuch und Badesalz auf einem Tablett',
    altEn: 'Care products, a towel and bath salt on a tray',
    disclosureDe: 'Konzeptvisualisierung', disclosureEn: 'Concept visualisation',
  },
  {
    slug: 'real-salon', sourceType: 'real_photo' as const, width: 1600, height: 900,
    altDe: 'Unser Studio mit begrünter Wand und hellen Arbeitsplätzen',
    altEn: 'Our studio with its plant wall and bright work stations',
    // These are wide rooms. Cropped to a tall column on their centre point they
    // land on an empty stretch of wall, so each names the part worth keeping.
    focalPoint: '46% 62%',
  },
  {
    slug: 'real-manicure', sourceType: 'real_photo' as const, width: 1600, height: 900,
    altDe: 'Maniküre-Arbeitsplätze mit Lackregal', altEn: 'Manicure stations with the polish shelf',
    focalPoint: '52% 74%',
  },
  {
    slug: 'real-pedicure', sourceType: 'real_photo' as const, width: 1600, height: 900,
    altDe: 'Pediküre-Bereich mit Sesseln', altEn: 'Pedicure area with its chairs',
    focalPoint: '50% 64%',
  },
  {
    slug: 'real-detail', sourceType: 'real_photo' as const, width: 900, height: 1600,
    altDe: 'Detail im Studio', altEn: 'A detail in the studio', focalPoint: '50% 42%',
  },
  {
    slug: 'real-treatment', sourceType: 'real_photo' as const, width: 900, height: 1600,
    altDe: 'Behandlungsplatz', altEn: 'A treatment space', focalPoint: '50% 42%',
  },
  {
    slug: 'nail-french', sourceType: 'ai_concept' as const, width: 1254, height: 1254,
    altDe: 'Fünf Nagelspitzen im French-Look mit weißer Spitze',
    altEn: 'Five nail tips in a French look with a white tip',
    disclosureDe: 'Inspiration', disclosureEn: 'Inspiration',
  },
  {
    slug: 'nail-rose', sourceType: 'ai_concept' as const, width: 1254, height: 1254,
    altDe: 'Fünf Nagelspitzen in zartem Rosé', altEn: 'Five nail tips in a soft rosé',
    disclosureDe: 'Inspiration', disclosureEn: 'Inspiration',
  },
  {
    slug: 'nail-cat-eye', sourceType: 'ai_concept' as const, width: 1254, height: 1254,
    altDe: 'Fünf Nagelspitzen in dunklem Oliv mit Cat-Eye-Schimmer',
    altEn: 'Five nail tips in dark olive with a cat-eye shimmer',
    disclosureDe: 'Inspiration', disclosureEn: 'Inspiration',
  },
  {
    slug: 'nail-nude', sourceType: 'ai_concept' as const, width: 1254, height: 1254,
    altDe: 'Fünf Nagelspitzen in Nude mit feinen Linien',
    altEn: 'Five nail tips in nude with fine lines',
    disclosureDe: 'Inspiration', disclosureEn: 'Inspiration',
  },
  {
    slug: 'nail-blossom', sourceType: 'ai_concept' as const, width: 1254, height: 1254,
    altDe: 'Fünf Nagelspitzen in Rosa mit kleinen weißen Blüten',
    altEn: 'Five nail tips in pink with small white blossoms',
    disclosureDe: 'Inspiration', disclosureEn: 'Inspiration',
  },
  {
    slug: 'nail-pearl', sourceType: 'ai_concept' as const, width: 1254, height: 1254,
    altDe: 'Fünf Nagelspitzen in cremigem Perlmutt', altEn: 'Five nail tips in a creamy pearl',
    disclosureDe: 'Inspiration', disclosureEn: 'Inspiration',
  },
];

await db.insert(schema.mediaAsset).values(
  MEDIA.map((m) => ({
    ...m,
    // The studio's own photographs are approved; generated ones wait for a
    // human, and the interface labels them until then.
    approvalStatus: m.sourceType === 'real_photo' ? ('approved' as const) : ('pending_review' as const),
  })),
);

/* -------------------------------------------------------------- services */

const services = await db
  .insert(schema.service)
  .values([
    {
      slug: 'klassische-manikuere', category: 'manikuere', sortOrder: 1, published: true,
      nameDe: 'Klassische Maniküre', nameEn: 'Classic manicure',
      teaserDe: 'Zeit für das Wesentliche. Natürlich gepflegt, spürbar schön.',
      teaserEn: 'Time for the essentials. Naturally cared for, visibly good.',
      descriptionDe: 'Nagelform, Nagelhautpflege und eine sanfte Handmassage. Der Klassiker für gepflegte Hände – mit oder ohne Farbe.',
      descriptionEn: 'Shaping, cuticle care and a gentle hand massage. The classic for well-kept hands – with or without colour.',
      durationMinutes: 45, priceCents: 4000, mediaSlug: 'nail-nude',
    },
    {
      slug: 'french-manikuere', category: 'manikuere', sortOrder: 2, published: true,
      nameDe: 'French Maniküre', nameEn: 'French manicure',
      teaserDe: 'Der zeitlose Klassiker. Frisch, elegant, immer passend.',
      teaserEn: 'The timeless classic. Fresh, elegant, always right.',
      descriptionDe: 'Maniküre mit sauber gezogener French-Spitze in Weiß oder Creme. Hält, was ein guter Auftritt verspricht.',
      descriptionEn: 'A manicure with a cleanly drawn French tip in white or cream. Everything a good first impression needs.',
      durationMinutes: 60, priceCents: 5000, mediaSlug: 'nail-french',
    },
    {
      slug: 'gel-modellage', category: 'modellage', sortOrder: 3, published: true,
      nameDe: 'Gel-Modellage', nameEn: 'Gel extensions',
      teaserDe: 'Länge, Form und Halt. Für Nägel, die mitmachen.',
      teaserEn: 'Length, shape and staying power. For nails that keep up.',
      descriptionDe: 'Aufbau in Gel, in deiner Wunschform und -länge. Inklusive Farbe oder Design nach Absprache.',
      descriptionEn: 'A gel build-up in the shape and length you want, including colour or artwork as agreed.',
      durationMinutes: 90, priceCents: 6500, mediaSlug: 'nail-cat-eye',
    },
    {
      slug: 'auffuellen', category: 'modellage', sortOrder: 4, published: true,
      nameDe: 'Auffüllen', nameEn: 'Infill',
      teaserDe: 'Nachziehen, was schon schön ist.', teaserEn: 'A top-up for what is already good.',
      descriptionDe: 'Auffüllen der bestehenden Modellage nach drei bis vier Wochen, inklusive Neuversiegelung.',
      descriptionEn: 'Refilling an existing set after three to four weeks, resealed as new.',
      durationMinutes: 60, priceCents: 4500, mediaSlug: 'nail-pearl',
    },
    {
      slug: 'pedikuere', category: 'pedikuere', sortOrder: 5, published: true,
      nameDe: 'Pediküre', nameEn: 'Pedicure',
      teaserDe: 'Pflege, die dich trägt. Für ein rundum gutes Gefühl.',
      teaserEn: 'Care that carries you. For a feeling that lasts.',
      descriptionDe: 'Fußbad, Nagelpflege, Hornhautbehandlung und eine entspannende Massage.',
      descriptionEn: 'A foot bath, nail care, callus treatment and a relaxing massage.',
      durationMinutes: 60, priceCents: 4800, mediaSlug: 'pedicure-wide',
    },
    {
      slug: 'nail-art', category: 'extras', sortOrder: 6, published: true,
      nameDe: 'Nail Art', nameEn: 'Nail art',
      teaserDe: 'Dein Design. Von fein bis auffällig.', teaserEn: 'Your design. From delicate to bold.',
      descriptionDe: 'Handgemalte Designs, Blüten, Linien oder Chrome. Preis nach Aufwand – wir sprechen vorher darüber.',
      descriptionEn: 'Hand-painted designs, blossoms, lines or chrome. Priced by effort – we agree it first.',
      durationMinutes: 30,
      // Genuinely open: what this costs depends on the design. Zero would be a
      // lie and a number would be a guess, so it stays "Preis auf Anfrage" and
      // cannot be paid for online.
      priceCents: null,
      mediaSlug: 'nail-blossom',
    },
    {
      slug: 'intensivpflege', category: 'extras', sortOrder: 7, published: true,
      nameDe: 'Intensivpflege', nameEn: 'Intensive care',
      teaserDe: 'Extra Pflege. Extra Glow.', teaserEn: 'Extra care. Extra glow.',
      descriptionDe: 'Für sichtbar gesündere und stärkere Nägel – mit Öl, Maske und Massage.',
      descriptionEn: 'For visibly healthier, stronger nails – with oil, a mask and a massage.',
      durationMinutes: 30, priceCents: 2500, mediaSlug: 'care-still-life',
    },
  ])
  .returning();

const bySlug = new Map(services.map((s) => [s.slug, s]));

await db.insert(schema.serviceVariant).values([
  { serviceId: bySlug.get('klassische-manikuere')!.id, slug: 'ohne-lack', nameDe: 'Ohne Lack', nameEn: 'No polish', isDefault: true, sortOrder: 1 },
  { serviceId: bySlug.get('klassische-manikuere')!.id, slug: 'mit-farblack', nameDe: 'Mit Farblack', nameEn: 'With colour', priceDeltaCents: 800, durationDeltaMinutes: 15, sortOrder: 2 },
  { serviceId: bySlug.get('klassische-manikuere')!.id, slug: 'mit-french', nameDe: 'Mit French', nameEn: 'With French', priceDeltaCents: 1200, durationDeltaMinutes: 15, sortOrder: 3 },
  { serviceId: bySlug.get('french-manikuere')!.id, slug: 'klassisch', nameDe: 'Klassisch weiß', nameEn: 'Classic white', isDefault: true, sortOrder: 1 },
  { serviceId: bySlug.get('french-manikuere')!.id, slug: 'soft', nameDe: 'Soft Creme', nameEn: 'Soft cream', sortOrder: 2 },
  { serviceId: bySlug.get('gel-modellage')!.id, slug: 'kurz', nameDe: 'Kurz', nameEn: 'Short', isDefault: true, sortOrder: 1 },
  { serviceId: bySlug.get('gel-modellage')!.id, slug: 'mittel', nameDe: 'Mittel', nameEn: 'Medium', priceDeltaCents: 500, durationDeltaMinutes: 15, sortOrder: 2 },
  { serviceId: bySlug.get('gel-modellage')!.id, slug: 'lang', nameDe: 'Lang', nameEn: 'Long', priceDeltaCents: 1000, durationDeltaMinutes: 30, sortOrder: 3 },
  { serviceId: bySlug.get('pedikuere')!.id, slug: 'klassisch', nameDe: 'Klassisch', nameEn: 'Classic', isDefault: true, sortOrder: 1 },
  { serviceId: bySlug.get('pedikuere')!.id, slug: 'mit-lack', nameDe: 'Mit Lack', nameEn: 'With polish', priceDeltaCents: 700, durationDeltaMinutes: 15, sortOrder: 2 },
]);

const addOns = await db
  .insert(schema.addOn)
  .values([
    { slug: 'intensivpflege', nameDe: 'Intensivpflege', nameEn: 'Intensive care', durationMinutes: 15, priceCents: 1200, published: true, sortOrder: 1 },
    { slug: 'handmassage', nameDe: 'Handmassage', nameEn: 'Hand massage', durationMinutes: 10, priceCents: 900, published: true, sortOrder: 2 },
    { slug: 'paraffinbad', nameDe: 'Paraffinbad', nameEn: 'Paraffin bath', durationMinutes: 15, priceCents: 1400, published: true, sortOrder: 3 },
  ])
  .returning();

const addOnBySlug = new Map(addOns.map((a) => [a.slug, a]));

// Which extras go with which service. The pedicure does not take a hand
// massage, and the server refuses the combination rather than silently
// dropping it.
await db.insert(schema.serviceAddOn).values([
  { serviceId: bySlug.get('klassische-manikuere')!.id, addOnId: addOnBySlug.get('intensivpflege')!.id },
  { serviceId: bySlug.get('klassische-manikuere')!.id, addOnId: addOnBySlug.get('handmassage')!.id },
  { serviceId: bySlug.get('klassische-manikuere')!.id, addOnId: addOnBySlug.get('paraffinbad')!.id },
  { serviceId: bySlug.get('french-manikuere')!.id, addOnId: addOnBySlug.get('intensivpflege')!.id },
  { serviceId: bySlug.get('french-manikuere')!.id, addOnId: addOnBySlug.get('handmassage')!.id },
  { serviceId: bySlug.get('gel-modellage')!.id, addOnId: addOnBySlug.get('intensivpflege')!.id },
  { serviceId: bySlug.get('pedikuere')!.id, addOnId: addOnBySlug.get('paraffinbad')!.id },
  { serviceId: bySlug.get('pedikuere')!.id, addOnId: addOnBySlug.get('intensivpflege')!.id },
]);

/* --------------------------------------------------------------- resource */

const [pedicureChair] = await db
  .insert(schema.resource)
  .values({ slug: 'pedikuere-platz', nameDe: 'Pediküre-Platz', nameEn: 'Pedicure station', capacity: 1 })
  .returning();

await db.insert(schema.serviceResource).values({ serviceId: bySlug.get('pedikuere')!.id, resourceId: pedicureChair.id });

/* ------------------------------------------------------------------ staff */

/*
 * "Team A/B/C" rather than invented names, and initials rather than portraits.
 * The design screens show names because a picture needs something in the box;
 * putting fictional colleagues on a real studio's website is a different thing
 * entirely. The studio replaces these with its own people.
 */
const staff = await db
  .insert(schema.staff)
  .values([
    {
      slug: 'team-a', displayName: 'Team A', initials: 'A', role: 'owner', sortOrder: 1,
      email: 'admin@stern-nails.demo', passwordHash: hashPassword(ADMIN_PASSWORD),
    },
    { slug: 'team-b', displayName: 'Team B', initials: 'B', role: 'manager', sortOrder: 2, email: 'manager@stern-nails.demo', passwordHash: hashPassword(ADMIN_PASSWORD) },
    { slug: 'team-c', displayName: 'Team C', initials: 'C', role: 'staff', sortOrder: 3, email: 'team@stern-nails.demo', passwordHash: hashPassword(ADMIN_PASSWORD) },
  ])
  .returning();

// Everybody can do everything except that only Team B and C take the pedicure,
// so the availability engine has something real to resolve.
await db.insert(schema.staffService).values(
  staff.flatMap((member) =>
    services
      .filter((service) => service.slug !== 'pedikuere' || member.slug !== 'team-a')
      .map((service) => ({ staffId: member.id, serviceId: service.id })),
  ),
);

// Tuesday to Saturday, 09:00–18:30, with Saturday short. Local wall time, so
// the rota does not shift when the clocks do.
await db.insert(schema.workSchedule).values(
  staff.flatMap((member) => [
    { staffId: member.id, weekday: 2, startMinute: 9 * 60, endMinute: 18 * 60 + 30 },
    { staffId: member.id, weekday: 3, startMinute: 9 * 60, endMinute: 18 * 60 + 30 },
    { staffId: member.id, weekday: 4, startMinute: 9 * 60, endMinute: 18 * 60 + 30 },
    { staffId: member.id, weekday: 5, startMinute: 9 * 60, endMinute: 18 * 60 + 30 },
    { staffId: member.id, weekday: 6, startMinute: 9 * 60, endMinute: 15 * 60 },
  ]),
);

/* ------------------------------------------------------------------ looks */

await db.insert(schema.look).values([
  {
    slug: 'french-classic', collection: 'french', sortOrder: 1, published: true,
    nameDe: 'French Classic', nameEn: 'French Classic',
    teaserDe: 'Zeitlos. Elegant. Immer schön.', teaserEn: 'Timeless. Elegant. Always right.',
    descriptionDe: 'Der zeitlose Klassiker – frisch, elegant und immer passend. Für einen stilvollen Auftritt in jeder Situation.',
    descriptionEn: 'The timeless classic – fresh, elegant and always right. For a considered look in any situation.',
    colors: ['rose', 'weiss'], shape: 'oval', length: 'mittel', finish: 'glanz',
    tags: ['french', 'klassisch', 'zeitlos', 'elegant'],
    mediaSlug: 'nail-french', suggestedServiceSlug: 'french-manikuere',
  },
  {
    slug: 'rose-allure', collection: 'rose', sortOrder: 2, published: true,
    nameDe: 'Rosé Allure', nameEn: 'Rosé Allure',
    teaserDe: 'Zart. Feminin. Zeitlos.', teaserEn: 'Soft. Feminine. Timeless.',
    descriptionDe: 'Ein sanfter Rosé-Ton für einen stilvollen, modernen Auftritt – perfekt im Alltag und zu besonderen Momenten.',
    descriptionEn: 'A soft rosé for a modern, considered look – at home in everyday life and on the big days.',
    colors: ['rose'], shape: 'mandel', length: 'mittel', finish: 'glanz',
    tags: ['rose', 'elegant', 'natuerlich'],
    mediaSlug: 'nail-rose', suggestedServiceSlug: 'klassische-manikuere',
  },
  {
    slug: 'cat-eye-olive', collection: 'cat-eye', sortOrder: 3, published: true,
    nameDe: 'Cat Eye Olive', nameEn: 'Cat Eye Olive',
    teaserDe: 'Magisch. Tief. Anders.', teaserEn: 'Magnetic. Deep. Different.',
    descriptionDe: 'Der faszinierende Schimmer des Cat Eye Looks setzt elegante Akzente und verleiht deinem Style das gewisse Etwas.',
    descriptionEn: 'The cat-eye shimmer catches the light and gives the whole look something of its own.',
    colors: ['oliv', 'gruen'], shape: 'mandel', length: 'lang', finish: 'schimmer',
    tags: ['cat-eye', 'auffaellig', 'abend'],
    mediaSlug: 'nail-cat-eye', suggestedServiceSlug: 'gel-modellage',
  },
  {
    slug: 'nude-grace', collection: 'french', sortOrder: 4, published: true,
    nameDe: 'Nude Grace', nameEn: 'Nude Grace',
    teaserDe: 'Natürlich. Modern. Besonders.', teaserEn: 'Natural. Modern. Particular.',
    descriptionDe: 'Ein warmer Nude-Ton mit feiner Linienführung – zurückhaltend und trotzdem nicht zu übersehen.',
    descriptionEn: 'A warm nude with fine linework – understated, and still impossible to miss.',
    colors: ['nude', 'gold'], shape: 'mandel', length: 'kurz', finish: 'glanz',
    tags: ['natuerlich', 'elegant', 'alltag'],
    mediaSlug: 'nail-nude', suggestedServiceSlug: 'klassische-manikuere',
  },
  {
    slug: 'blush-bloom', collection: 'rose', sortOrder: 5, published: true,
    nameDe: 'Blush Bloom', nameEn: 'Blush Bloom',
    teaserDe: 'Romantisch. Ausdrucksstark.', teaserEn: 'Romantic. Expressive.',
    descriptionDe: 'Kleine weiße Blüten auf zartem Rosa – wie ein Frühlingstag an deinen Händen.',
    descriptionEn: 'Small white blossoms on a soft pink – a spring morning on your hands.',
    colors: ['rose', 'weiss'], shape: 'oval', length: 'mittel', finish: 'glanz',
    tags: ['floral', 'rose', 'auffaellig'],
    mediaSlug: 'nail-blossom', suggestedServiceSlug: 'nail-art',
  },
  {
    slug: 'soft-luxury', collection: 'french', sortOrder: 6, published: true,
    nameDe: 'Soft Luxury', nameEn: 'Soft Luxury',
    teaserDe: 'Dezent. Edel. Unvergänglich.', teaserEn: 'Understated. Fine. Lasting.',
    descriptionDe: 'Cremiges Perlmutt mit einem Hauch Schimmer. Ruhig, hochwertig und alltagstauglich.',
    descriptionEn: 'Creamy pearl with a hint of shimmer. Calm, refined and easy to live with.',
    colors: ['nude', 'perlmutt'], shape: 'oval', length: 'mittel', finish: 'schimmer',
    tags: ['elegant', 'natuerlich', 'zeitlos'],
    mediaSlug: 'nail-pearl', suggestedServiceSlug: 'klassische-manikuere',
  },
]);

await client.close();

console.log(`seeded ${dir}`);
console.log(`  ${services.length} services, ${staff.length} staff, 6 looks, ${MEDIA.length} media assets`);
console.log(`  admin sign-in: admin@stern-nails.demo / ${ADMIN_PASSWORD}`);
console.log('  address, phone and legal details left null on purpose — the studio fills those in.');
