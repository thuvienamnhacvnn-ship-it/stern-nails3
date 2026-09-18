import Link from 'next/link';
import { path, t, type Locale } from '@/lib/i18n';
import { fieldLabel, missingBeforeLive, settings } from '@/lib/settings';

/**
 * Imprint and privacy notice.
 *
 * These two pages are why `business_settings` has so many nullable columns. A
 * German imprint is a legal document with named requirements, and filling it
 * with plausible placeholder text would be worse than leaving it visibly
 * incomplete — so each page renders what the owner has entered and says
 * plainly what is still missing.
 *
 * The privacy notice describes what this application actually does, which is
 * the only part we can write. It still has to be read and approved by the
 * studio before the site is public, and it says so at the top.
 */

export async function ImprintPage({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const config = await settings();
  const missing = missingBeforeLive(config);
  const de = locale === 'de';

  return (
    <article className="legal">
      <h1>{copy.common.imprint}</h1>

      {missing.length > 0 ? (
        <p className="notice">
          <span>
            {de
              ? 'Diese Seite ist noch nicht vollständig. Die folgenden Angaben trägt das Studio vor dem Livegang ein: '
              : 'This page is not complete yet. The studio will supply the following before going live: '}
            {missing.map((field) => fieldLabel(field, locale)).join(', ')}.
          </span>
        </p>
      ) : null}

      <section className="stack stack--1">
        <h2>{de ? 'Angaben gemäß § 5 DDG' : 'Provider identification'}</h2>
        <p>{config?.legalEntity ?? (de ? '— noch nicht hinterlegt —' : '— not supplied yet —')}</p>
        {config?.street ? (
          <p>
            {config.street}
            <br />
            {config.postalCode} {config.city}
          </p>
        ) : null}
        {config?.legalRepresentative ? (
          <p>
            {de ? 'Vertreten durch: ' : 'Represented by: '}
            {config.legalRepresentative}
          </p>
        ) : null}
      </section>

      <section className="stack stack--1">
        <h2>{de ? 'Kontakt' : 'Contact'}</h2>
        {config?.phone ? <p>{config.phone}</p> : null}
        {config?.email ? <p>{config.email}</p> : null}
        {!config?.phone && !config?.email ? <p>{copy.studio.contactPending}</p> : null}
      </section>

      {config?.registerCourt || config?.registerNumber ? (
        <section className="stack stack--1">
          <h2>{de ? 'Registereintrag' : 'Register entry'}</h2>
          <p>
            {config.registerCourt} {config.registerNumber}
          </p>
        </section>
      ) : null}

      {config?.vatId ? (
        <section className="stack stack--1">
          <h2>{de ? 'Umsatzsteuer-ID' : 'VAT identification number'}</h2>
          <p>{config.vatId}</p>
        </section>
      ) : null}

      <section className="stack stack--1">
        <h2>{de ? 'Streitschlichtung' : 'Dispute resolution'}</h2>
        <p>
          {de
            ? 'Die Erklärung zur Verbraucherschlichtung formuliert das Studio selbst; ohne diese Entscheidung bleibt dieser Abschnitt bewusst leer.'
            : 'The statement on consumer arbitration is the studio’s to make; until that decision this section stays deliberately empty.'}
        </p>
      </section>

      <p className="tiny muted">
        <Link href={path(locale, 'privacy')} style={{ textDecoration: 'underline' }}>
          {copy.common.privacy}
        </Link>
      </p>
    </article>
  );
}

export async function PrivacyPage({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const config = await settings();
  const de = locale === 'de';

  return (
    <article className="legal">
      <h1>{copy.common.privacy}</h1>

      <p className="notice">
        <span>
          {de
            ? 'Dieser Text beschreibt, was die Anwendung technisch tut. Er ersetzt keine Rechtsberatung und muss vor der Veröffentlichung vom Studio geprüft und freigegeben werden.'
            : 'This text describes what the application actually does. It is not legal advice and has to be reviewed and approved by the studio before publication.'}
        </span>
      </p>

      <section className="stack stack--1">
        <h2>{de ? 'Welche Daten wir erheben' : 'What we collect'}</h2>
        <p>
          {de
            ? 'Für eine Buchung: Vorname, Nachname und E-Mail-Adresse. Eine Telefonnummer ist freiwillig. Dazu die gewählte Leistung, der Termin und – falls angegeben – der gewünschte Nail Look.'
            : 'For a booking: first name, last name and email address. A phone number is optional. In addition the chosen service, the appointment and, if given, the nail look you picked.'}
        </p>
      </section>

      <section className="stack stack--1">
        <h2>Cookies</h2>
        <p>
          {de
            ? 'Wir setzen ein Cookie für deine Anmeldung und eines für die laufende Buchung. Beide sind für den Betrieb nötig. Statistik-, Werbe- oder Social-Media-Cookies setzen wir nicht, und wir laden keine externen Skripte, die welche setzen könnten.'
            : 'We set one cookie for your sign-in and one for the booking in progress. Both are necessary. We set no analytics, advertising or social cookies, and we load no external scripts that could set them.'}
        </p>
      </section>

      <section className="stack stack--1">
        <h2>{de ? 'Externe Dienste' : 'Third parties'}</h2>
        <p>
          {de
            ? 'Schriften liegen auf unserem eigenen Server; es wird keine Verbindung zu Google Fonts aufgebaut. Eine Karte binden wir nur ein, wenn eine Adresse hinterlegt ist und du zustimmst. Zahlungsdienstleister erhalten nur, was die Zahlung braucht; Kartendaten speichern wir nie.'
            : 'Fonts are served from our own server; no request goes to Google Fonts. A map is only embedded once an address exists and you agree to it. Payment providers receive only what the payment needs; we never store card details.'}
        </p>
      </section>

      <section className="stack stack--1">
        <h2>{de ? 'Werbung' : 'Marketing'}</h2>
        <p>
          {de
            ? 'E-Mail-Werbung erhältst du nur, wenn du das Kästchen bei der Buchung aktiv angehakt hast. Eine Buchung allein ist keine Einwilligung. Du kannst sie jederzeit widerrufen.'
            : 'You receive marketing email only if you actively ticked the box at checkout. A booking alone is not consent. You can withdraw it at any time.'}
        </p>
      </section>

      <section className="stack stack--1">
        <h2>{de ? 'Der KI Stylist' : 'The AI stylist'}</h2>
        <p>
          {de
            ? 'An das Sprachmodell geht nur deine Nachricht und unser veröffentlichtes Lookbook. Termine, E-Mail-Adressen und Telefonnummern werden nicht übermittelt. Der Stylist bucht nichts und stellt keine gesundheitlichen Aussagen an.'
            : 'Only your message and our published lookbook go to the language model. Appointments, email addresses and phone numbers are not sent. The stylist books nothing and makes no health claims.'}
        </p>
      </section>

      <section className="stack stack--1">
        <h2>{de ? 'Speicherdauer' : 'Retention'}</h2>
        <p>
          {config?.cancellationPolicy ??
            (de
              ? 'Die Aufbewahrungsfristen legt das Studio fest und trägt sie hier ein.'
              : 'Retention periods are set by the studio and entered here.')}
        </p>
      </section>

      <section className="stack stack--1">
        <h2>{de ? 'Deine Rechte' : 'Your rights'}</h2>
        <ul>
          <li>{de ? 'Auskunft über deine gespeicherten Daten' : 'Access to the data we hold about you'}</li>
          <li>{de ? 'Berichtigung falscher Daten' : 'Correction of anything wrong'}</li>
          <li>{de ? 'Löschung, soweit keine Aufbewahrungspflicht entgegensteht' : 'Deletion, unless a retention duty applies'}</li>
          <li>{de ? 'Datenübertragbarkeit' : 'Portability of your data'}</li>
        </ul>
        <p>
          {de
            ? 'In deinem Konto kannst du deine Daten exportieren. Für eine Löschung schreib uns – die Kontaktadresse steht im Impressum, sobald sie hinterlegt ist.'
            : 'You can export your data from your account. For deletion, write to us – the contact address is in the imprint once it has been entered.'}
        </p>
      </section>
    </article>
  );
}
