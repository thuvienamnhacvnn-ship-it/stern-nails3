/**
 * The database.
 *
 * Three rules run through the whole schema and explain most of its shape:
 *
 *  - Money is integer cents, everywhere, always. There is no `numeric` column
 *    holding euros and no float anywhere near a price.
 *  - Instants are `timestamptz` held in UTC. Berlin's clock is a display
 *    concern; a booking that survives the March and October changeovers has to
 *    be stored as a moment, not as wall time.
 *  - Anything a customer can see a price or a name for is snapshotted onto the
 *    booking when it is made. Editing a service later must not rewrite what
 *    somebody already agreed to pay.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------- enums */

export const bookingStatus = pgEnum('booking_status', [
  'draft',
  'held',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
]);

export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const paymentMethod = pgEnum('payment_method', ['on_site', 'card', 'paypal', 'voucher']);

/** Whether an image is the studio's own photograph or a generated concept. */
export const mediaSource = pgEnum('media_source', ['real_photo', 'ai_concept', 'logo']);

/** Nothing generated is published without a human saying so. */
export const approval = pgEnum('approval_status', ['draft', 'pending_review', 'approved']);

export const staffRole = pgEnum('staff_role', ['owner', 'manager', 'staff']);

export const voucherStatus = pgEnum('voucher_status', ['pending_payment', 'active', 'depleted', 'cancelled']);

export const ledgerKind = pgEnum('voucher_ledger_kind', ['issued', 'redeemed', 'refunded']);

export const notificationKind = pgEnum('notification_kind', [
  'booking_confirmation',
  'booking_cancelled',
  'booking_rescheduled',
  'voucher_issued',
  'login_link',
]);

export const notificationStatus = pgEnum('notification_status', ['queued', 'sent', 'failed']);

/* -------------------------------------------------------- business settings */

/**
 * One row. Every field the studio owner still has to supply is nullable and
 * starts null on purpose: the UI hides a phone link rather than printing an
 * invented number, and the go-live checklist is literally "which of these are
 * still null".
 */
export const businessSettings = pgTable('business_settings', {
  id: id(),
  name: text().notNull().default('Stern Nails 3'),
  tagline: text(),
  street: text(),
  postalCode: text(),
  city: text(),
  country: text().default('DE'),
  phone: text(),
  email: text(),
  website: text(),
  instagram: text(),
  facebook: text(),
  tiktok: text(),
  youtube: text(),
  /** IANA zone. Everything user-facing is rendered through this. */
  timezone: text().notNull().default('Europe/Berlin'),
  /** Minutes a slot stays reserved while somebody finishes checkout. */
  holdMinutes: integer().notNull().default(10),
  /** Minutes of turnaround added after every appointment. */
  bufferMinutes: integer().notNull().default(10),
  /** How far ahead the calendar opens. */
  bookingHorizonDays: integer().notNull().default(90),
  /** Shortest notice accepted for an online booking. */
  minNoticeMinutes: integer().notNull().default(120),
  cancellationPolicy: text(),
  depositPolicy: text(),
  legalEntity: text(),
  legalRepresentative: text(),
  registerCourt: text(),
  registerNumber: text(),
  vatId: text(),
  /** Payment methods the owner has actually switched on. */
  paymentMethods: jsonb().$type<string[]>().notNull().default(sql`'["on_site"]'::jsonb`),
  /** Demo mode puts a badge on every page and refuses real money. */
  demoMode: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------- media asset */

export const mediaAsset = pgTable('media_asset', {
  id: id(),
  /** Key into public/media/manifest.json, e.g. `nail-french`. */
  slug: text().notNull().unique(),
  sourceType: mediaSource().notNull(),
  altDe: text().notNull(),
  altEn: text().notNull(),
  /** CSS object-position, so a crop follows the subject instead of the centre. */
  focalPoint: text().notNull().default('50% 50%'),
  width: integer().notNull(),
  height: integer().notNull(),
  approvalStatus: approval().notNull().default('draft'),
  /** Shown under generated interiors. Null for the studio's own photographs. */
  disclosureDe: text(),
  disclosureEn: text(),
  createdAt: createdAt(),
});

/* ----------------------------------------------------------------- services */

export const service = pgTable(
  'service',
  {
    id: id(),
    /** Stable human key used in URLs and in the seed. */
    slug: text().notNull().unique(),
    category: text().notNull(), // manikuere | modellage | pedikuere | extras
    nameDe: text().notNull(),
    nameEn: text().notNull(),
    teaserDe: text().notNull(),
    teaserEn: text().notNull(),
    descriptionDe: text().notNull(),
    descriptionEn: text().notNull(),
    durationMinutes: integer().notNull(),
    /**
     * Null means "Preis auf Anfrage". It is not zero: a service whose price the
     * owner has not confirmed must never become a 0,00 € checkout.
     */
    priceCents: integer(),
    mediaSlug: text(),
    sortOrder: integer().notNull().default(0),
    published: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('service_category_idx').on(t.category)],
);

export const serviceVariant = pgTable('service_variant', {
  id: id(),
  serviceId: uuid().notNull().references(() => service.id, { onDelete: 'cascade' }),
  slug: text().notNull(),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  /** Added to the service duration; may be negative. */
  durationDeltaMinutes: integer().notNull().default(0),
  /** Added to the service price. Ignored while the service is price-on-request. */
  priceDeltaCents: integer().notNull().default(0),
  sortOrder: integer().notNull().default(0),
  isDefault: boolean().notNull().default(false),
});

export const addOn = pgTable('add_on', {
  id: id(),
  slug: text().notNull().unique(),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  durationMinutes: integer().notNull().default(0),
  priceCents: integer(),
  sortOrder: integer().notNull().default(0),
  published: boolean().notNull().default(false),
});

/** Which add-ons may be combined with which service. Anything not listed here
 *  cannot be selected — the UI hides it and the server refuses it. */
export const serviceAddOn = pgTable(
  'service_add_on',
  {
    serviceId: uuid().notNull().references(() => service.id, { onDelete: 'cascade' }),
    addOnId: uuid().notNull().references(() => addOn.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.addOnId] })],
);

/* -------------------------------------------------------------------- staff */

export const staff = pgTable('staff', {
  id: id(),
  slug: text().notNull().unique(),
  displayName: text().notNull(),
  /** Initials stand in until the studio supplies portraits. */
  initials: text().notNull(),
  roleTitleDe: text().notNull().default('Nail Designerin'),
  roleTitleEn: text().notNull().default('Nail designer'),
  role: staffRole().notNull().default('staff'),
  email: text(),
  /** Argon-free: a salted SHA-256 via node:crypto scrypt, see lib/password.ts. */
  passwordHash: text(),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
});

export const staffService = pgTable(
  'staff_service',
  {
    staffId: uuid().notNull().references(() => staff.id, { onDelete: 'cascade' }),
    serviceId: uuid().notNull().references(() => service.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
);

/** A chair, a pedicure spa, a UV lamp — anything an appointment consumes and
 *  that two appointments cannot share. */
export const resource = pgTable('resource', {
  id: id(),
  slug: text().notNull().unique(),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  capacity: integer().notNull().default(1),
});

export const serviceResource = pgTable(
  'service_resource',
  {
    serviceId: uuid().notNull().references(() => service.id, { onDelete: 'cascade' }),
    resourceId: uuid().notNull().references(() => resource.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.resourceId] })],
);

/** Recurring weekly hours. Local wall time, because that is what a rota is:
 *  "Tuesdays from nine" does not shift when the clocks do. */
export const workSchedule = pgTable('work_schedule', {
  id: id(),
  staffId: uuid().notNull().references(() => staff.id, { onDelete: 'cascade' }),
  /** 1 = Monday … 7 = Sunday, matching ISO-8601. */
  weekday: integer().notNull(),
  startMinute: integer().notNull(), // minutes from local midnight
  endMinute: integer().notNull(),
});

export const timeOff = pgTable(
  'time_off',
  {
    id: id(),
    /** Null = the whole studio is closed (a holiday). */
    staffId: uuid().references(() => staff.id, { onDelete: 'cascade' }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    reason: text(),
  },
  (t) => [index('time_off_range_idx').on(t.startsAt, t.endsAt)],
);

/* -------------------------------------------------------------------- looks */

export const look = pgTable(
  'look',
  {
    id: id(),
    slug: text().notNull().unique(),
    nameDe: text().notNull(),
    nameEn: text().notNull(),
    teaserDe: text().notNull(),
    teaserEn: text().notNull(),
    descriptionDe: text().notNull(),
    descriptionEn: text().notNull(),
    collection: text().notNull(), // french | rose | cat-eye
    colors: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    shape: text().notNull(), // oval | mandel | eckig | rund
    length: text().notNull(), // kurz | mittel | lang
    finish: text().notNull(), // glanz | matt | schimmer
    tags: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    mediaSlug: text().notNull(),
    /** Look → the service it is usually booked with. A reference, not a product. */
    suggestedServiceSlug: text(),
    published: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('look_collection_idx').on(t.collection)],
);

/* ---------------------------------------------------------------- customers */

export const customer = pgTable('customer', {
  id: id(),
  email: text().notNull().unique(),
  firstName: text(),
  lastName: text(),
  phone: text(),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  /** Off unless the box was ticked. Booking is not consent. */
  marketingOptIn: boolean().notNull().default(false),
  marketingOptInAt: timestamp({ withTimezone: true }),
  notes: text(),
  createdAt: createdAt(),
});

/** Short-lived, single-use tokens: sign-in links and self-service booking links.
 *  Only the hash is stored, so a leaked database row is not a working link. */
export const authToken = pgTable(
  'auth_token',
  {
    id: id(),
    tokenHash: text().notNull().unique(),
    customerId: uuid().references(() => customer.id, { onDelete: 'cascade' }),
    /** For manage-my-booking links, which do not require an account. */
    bookingId: uuid(),
    purpose: text().notNull(), // login | manage_booking
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('auth_token_expiry_idx').on(t.expiresAt)],
);

export const session = pgTable('session', {
  id: id(),
  tokenHash: text().notNull().unique(),
  customerId: uuid().references(() => customer.id, { onDelete: 'cascade' }),
  staffId: uuid().references(() => staff.id, { onDelete: 'cascade' }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const favorite = pgTable(
  'favorite',
  {
    customerId: uuid().notNull().references(() => customer.id, { onDelete: 'cascade' }),
    lookId: uuid().notNull().references(() => look.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.lookId] })],
);

/* ----------------------------------------------------------------- bookings */

export const booking = pgTable(
  'booking',
  {
    id: id(),
    /** Unguessable. This is what a confirmation email links to, so an
     *  incrementing number would let anybody walk other people's appointments. */
    reference: text().notNull().unique(),
    status: bookingStatus().notNull().default('draft'),
    customerId: uuid().references(() => customer.id, { onDelete: 'set null' }),
    /** Copied at booking time; a customer editing their profile later must not
     *  rewrite the name the studio has on the day. */
    contactFirstName: text(),
    contactLastName: text(),
    contactEmail: text(),
    contactPhone: text(),
    staffId: uuid().references(() => staff.id, { onDelete: 'set null' }),
    /** True when the customer said "Egal" and the server picked. */
    staffAny: boolean().notNull().default(true),
    resourceId: uuid().references(() => resource.id, { onDelete: 'set null' }),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    /** Sum of the snapshotted item prices. Null while a price is on request. */
    totalCents: integer(),
    /** What the voucher took off the total. */
    discountCents: integer().notNull().default(0),
    voucherId: uuid(),
    lookId: uuid().references(() => look.id, { onDelete: 'set null' }),
    notes: text(),
    isDemo: boolean().notNull().default(true),
    confirmedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancellationReason: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('booking_range_idx').on(t.startsAt, t.endsAt),
    index('booking_staff_idx').on(t.staffId, t.startsAt),
    index('booking_status_idx').on(t.status),
  ],
);

/**
 * A line on the booking, frozen. `serviceId` is kept for reporting but nothing
 * user-facing reads through it: the name, duration and price on this row are
 * what was agreed.
 */
export const bookingItem = pgTable('booking_item', {
  id: id(),
  bookingId: uuid().notNull().references(() => booking.id, { onDelete: 'cascade' }),
  kind: text().notNull(), // service | variant | add_on
  serviceId: uuid().references(() => service.id, { onDelete: 'set null' }),
  variantId: uuid().references(() => serviceVariant.id, { onDelete: 'set null' }),
  addOnId: uuid().references(() => addOn.id, { onDelete: 'set null' }),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  durationMinutes: integer().notNull(),
  /** Null = price on request; the booking total is then null too. */
  priceCents: integer(),
  sortOrder: integer().notNull().default(0),
});

/**
 * A slot reservation with a deadline. Conflict detection reads holds as well as
 * bookings, so two people cannot both reach checkout for the same 14:00.
 * Expired rows are ignored by availability and swept by the reconciliation job.
 */
export const bookingHold = pgTable(
  'booking_hold',
  {
    id: id(),
    bookingId: uuid().notNull().references(() => booking.id, { onDelete: 'cascade' }),
    staffId: uuid().notNull().references(() => staff.id, { onDelete: 'cascade' }),
    resourceId: uuid().references(() => resource.id, { onDelete: 'set null' }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    releasedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('booking_hold_window_idx').on(t.staffId, t.startsAt, t.endsAt)],
);

/* ----------------------------------------------------------------- payments */

export const payment = pgTable(
  'payment',
  {
    id: id(),
    bookingId: uuid().references(() => booking.id, { onDelete: 'set null' }),
    voucherId: uuid(),
    provider: text().notNull(), // demo | stripe | paypal | on_site
    /** The provider's id for the intent/order. Unique so a replayed webhook
     *  finds the same row instead of creating a second one. */
    providerRef: text(),
    /** Sent with the create call so a double submit cannot charge twice. */
    idempotencyKey: text().notNull().unique(),
    method: paymentMethod().notNull(),
    status: paymentStatus().notNull().default('pending'),
    amountCents: integer().notNull(),
    refundedCents: integer().notNull().default(0),
    currency: text().notNull().default('EUR'),
    isDemo: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_provider_ref_idx').on(t.provider, t.providerRef)],
);

/**
 * Every webhook that arrives, kept whole. `providerEventId` is unique, which is
 * the entire duplicate-delivery defence; `occurredAt` is the provider's own
 * clock, which is how an out-of-order "failed" after a "paid" is recognised and
 * ignored rather than applied.
 */
export const paymentEvent = pgTable(
  'payment_event',
  {
    id: id(),
    paymentId: uuid().references(() => payment.id, { onDelete: 'cascade' }),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    type: text().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    payload: jsonb().notNull(),
    /** Set when the event actually changed something. */
    appliedAt: timestamp({ withTimezone: true }),
    /** Why it was not applied — "late", "duplicate", "unknown booking". */
    ignoredReason: text(),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex('payment_event_unique_idx').on(t.provider, t.providerEventId)],
);

/* ----------------------------------------------------------------- vouchers */

export const voucher = pgTable('voucher', {
  id: id(),
  /** Only the hash. The plain code is shown once, in the PDF and the email,
   *  and never written to a log. */
  codeHash: text().notNull().unique(),
  /** First four characters, for support ("the one ending in…" is worse). */
  codeHint: text().notNull(),
  status: voucherStatus().notNull().default('pending_payment'),
  initialCents: integer().notNull(),
  /** Derived from the ledger on every write, inside the same transaction. */
  balanceCents: integer().notNull(),
  purchaserEmail: text(),
  recipientName: text(),
  recipientEmail: text(),
  message: text(),
  deliverAt: timestamp({ withTimezone: true }),
  expiresAt: timestamp({ withTimezone: true }),
  isDemo: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const voucherLedger = pgTable(
  'voucher_ledger',
  {
    id: id(),
    voucherId: uuid().notNull().references(() => voucher.id, { onDelete: 'cascade' }),
    kind: ledgerKind().notNull(),
    /** Positive for issued/refunded, negative for redeemed. */
    deltaCents: integer().notNull(),
    balanceAfterCents: integer().notNull(),
    bookingId: uuid().references(() => booking.id, { onDelete: 'set null' }),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index('voucher_ledger_voucher_idx').on(t.voucherId)],
);

/* ------------------------------------------------------------ notifications */

/**
 * Outbound mail as rows. A queue rather than a send call means a provider
 * outage is a retry, not a lost confirmation, and in demo mode the whole thing
 * is visible in the admin outbox instead of reaching a real inbox.
 */
export const notificationJob = pgTable(
  'notification_job',
  {
    id: id(),
    kind: notificationKind().notNull(),
    channel: text().notNull().default('email'), // email | whatsapp
    toAddress: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    /** The .ics for a confirmation, inline. */
    attachment: text(),
    attachmentName: text(),
    bookingId: uuid().references(() => booking.id, { onDelete: 'cascade' }),
    voucherId: uuid().references(() => voucher.id, { onDelete: 'cascade' }),
    status: notificationStatus().notNull().default('queued'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notification_status_idx').on(t.status)],
);

/* --------------------------------------------------------------- audit log */

/** Price changes, cancellations and refunds, with who and from what to what. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorType: text().notNull(), // staff | customer | system
    actorId: uuid(),
    actorLabel: text(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: uuid(),
    before: jsonb(),
    after: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId)],
);

/* -------------------------------------------------------------- relations */

export const serviceRelations = relations(service, ({ many }) => ({
  variants: many(serviceVariant),
  addOns: many(serviceAddOn),
}));

export const serviceVariantRelations = relations(serviceVariant, ({ one }) => ({
  service: one(service, { fields: [serviceVariant.serviceId], references: [service.id] }),
}));

export const bookingRelations = relations(booking, ({ many, one }) => ({
  items: many(bookingItem),
  holds: many(bookingHold),
  staff: one(staff, { fields: [booking.staffId], references: [staff.id] }),
  look: one(look, { fields: [booking.lookId], references: [look.id] }),
}));

export const bookingItemRelations = relations(bookingItem, ({ one }) => ({
  booking: one(booking, { fields: [bookingItem.bookingId], references: [booking.id] }),
}));

export const voucherRelations = relations(voucher, ({ many }) => ({
  ledger: many(voucherLedger),
}));
