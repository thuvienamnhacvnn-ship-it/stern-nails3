# Handover

What works, what is pretending, and what the studio has to supply before this
is a live website.

---

## 1. Integrations

The admin's **Einstellungen** page prints this same list from the actual
environment, so it can never drift from what the code is doing.

| | State | What it does today | To make it real |
|---|---|---|---|
| **E-Mail** | not configured | Every message is written to `notification_job` and to `.data/outbox/`, and shown in the admin outbox. Nothing is sent. | An account with a transactional provider. Implement the adapter in `src/lib/notify.ts` and set `EMAIL_PROVIDER` / `EMAIL_FROM`. A provider name with no adapter behind it fails the job visibly rather than silently. |
| **Zahlungen** | not configured | Card and PayPal run on the built-in fake: it creates an intent, signs its own webhook and moves nothing. Paying in the studio is real and needs no provider. | A merchant account. Implement the adapter in `src/lib/payments.ts`, set `PAYMENT_PROVIDER` and `PAYMENT_WEBHOOK_SECRET`, and point the provider's webhook at `/api/payments/webhook`. Test with a sandbox key before `DEMO_MODE=0`. |
| **KI Stylist** | offline recommender | Suggestions come from a rules engine over the published lookbook. No network call, no key, no cost. | `AI_PROVIDER=gemini` and `AI_API_KEY`. The allowlist, the medical refusal and the "never books anything" rule apply either way. |
| **WhatsApp** | off | Nothing is queued. | A number the studio owns, a business account, and a way for the customer to choose it. Until all three exist, queueing a message would produce something nobody can deliver. |

**Nothing above may be described as live while it says "not configured".** That
is the whole reason the list is generated rather than written down.

## 2. What the studio has to enter

These fields are `null` in the database and the site is built to hide what is
missing rather than print a placeholder. The imprint says so at the top, the
studio page omits the contact block, and the admin's go-live list counts them.

- Firmierung (the legal name)
- Vertretungsberechtigte Person
- Straße, PLZ, Ort
- Telefon
- E-Mail
- Registergericht and Registernummer, if the business is registered
- Umsatzsteuer-ID, if there is one
- Stornierungs- und Aufbewahrungshinweis

Enter them under **Admin → Einstellungen**. The imprint and the contact block
fill in as each one lands; no code change is needed.

An invented address on a real salon's website is worse than a visible gap, so
none was invented.

## 3. What is demo data

Everything the customer can see a number or a name for:

- **Prices and durations.** Plausible, and proposals only. Edit them under
  **Admin → Leistungen**. Leaving a price empty means "Preis auf Anfrage", which
  also switches off online payment for that service — that is deliberate, and it
  is how *Nail Art* is seeded.
- **The catalogue itself.** Maniküre / Modellage / Pediküre / Extras and the
  seven services in them are a starting point for the studio to approve.
- **Team A, B and C.** Named that way on purpose: putting invented colleagues on
  a real studio's website is a different thing from showing an example price.
  Replace them with the real people and their own portraits; until a portrait
  exists the initials stand in.
- **Opening hours.** Tuesday to Saturday, 09:00–18:30, Saturday to 15:00.
- **Gift-card values.** 25 / 50 / 100 € are illustrative.
- **The six looks.** Real entries, but every image is a designed set of tips, not
  a photograph of work this studio has done. Each card says "Inspiration" for
  exactly that reason.

## 4. Images

- `assets/interiors/real-*.jpg` are the studio's own photographs. They carry no
  caption.
- Everything else generated — the wide salon view, the pedicure room, the care
  still life, all six nail sets — is a concept render and is labelled
  **Konzeptvisualisierung** or **Inspiration** wherever it appears at any size.
- Their approval state is `pending_review` in the database and visible under
  **Admin → Looks**. Someone at the studio should look at each one and decide
  whether it may be used as an introduction to the premises at all.
- The logo is used as delivered. The `05` in the original file is the design
  option number and appears nowhere on the site.
- **People appear in two of the studio's own photographs.** `real-salon` and
  `real-manicure` show somebody at a work station. Publishing a recognisable
  person needs that person's agreement, and it is not ours to assume — before
  go-live, either get it, choose a frame without them, or adjust the focal point
  in `media_asset` so the crop excludes them. The crop is a field in the
  database, so this needs no code change.

## 5. Before go-live

1. Fill in every field in section 2.
2. Approve or replace the catalogue, the prices and the opening hours.
3. Replace Team A/B/C with the real team.
4. Look at each concept image and decide whether it may be published.
5. Have the imprint and the privacy notice read by someone qualified. The
   privacy text describes what the application actually does — which is the part
   we can write — but it is not legal advice.
6. Configure mail, then payments, each with a sandbox first.
7. Set `DEMO_MODE=0` and `PUBLIC_URL` to the real domain. Change
   `ADMIN_SEED_PASSWORD` and every staff password.
8. Move the database to a Postgres server if the site will run on more than one
   process. The schema is unchanged; PGlite is a directory, not a dialect.
9. Re-run `npm test` and `npm run shots` against the production build.

Checkout stays refused for any service whose price has not been confirmed, in
demo mode and out of it. That is not a demo restriction.

## 6. Things worth knowing before changing anything

- **One process on the database.** PGlite allows a single handle on `.data/pg`.
  `npm run db:migrate` and `npm run db:seed` refuse to run while the dev server
  is up; that guard exists because ignoring the rule corrupts the database
  rather than erroring.
- **Session cookies follow the connection, not the build.** `secure` is set from
  whether the request arrived over HTTPS. Deriving it from `NODE_ENV` means a
  production build served over plain HTTP — a LAN demo, a tunnel, the first hour
  of a new server — sets a cookie the browser drops, and every login silently
  succeeds while nobody is ever signed in.
- **Grid tracks are `minmax(0, 1fr)`, never `1fr`.** A bare `1fr` will not go
  below its content, so one unbreakable row quietly makes the page wider than
  the phone and the right edge is cut off with no scrollbar to explain it.
- **Prices are snapshotted onto the booking.** Editing a service does not change
  what somebody already agreed to pay, and the test suite holds that line.
- **The audit log is the answer to "it said fifty yesterday".** Price changes,
  cancellations and refunds are recorded with both values and who did it.
