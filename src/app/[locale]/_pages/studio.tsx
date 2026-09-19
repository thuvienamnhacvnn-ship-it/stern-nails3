import Link from 'next/link';
import { db, schema } from '@/db/client';
import { brand } from '@/lib/media';
import { path, t, type Locale } from '@/lib/i18n';
import { contactReady, settings } from '@/lib/settings';
import type { PhotoId } from '@/lib/media';
import { Photo } from '@/components/image';
import { Petal } from '@/components/shell';
import { ArrowRight, ChevronLeft, ChevronRight, Gem, Heart, Leaf, Users } from '@/components/icons';

/**
 * The studio.
 *
 * One screen, like the start page: the word at the left, two photographs in the
 * middle, four notes down the right, all on the dark green the banner uses. The
 * big picture is cut to an arch and the second one leans over its corner, which
 * is the shape the design asks for and the reason the two are positioned rather
 * than laid out in a row.
 *
 * Two kinds of picture appear here and they are not interchangeable. The
 * studio's own photographs carry no caption; the generated interiors carry
 * "Konzeptvisualisierung" in the corner, because a render of a room that does
 * not exist, shown unlabelled on a real salon's website, is a claim about the
 * premises.
 *
 * The fourth note is the contact. It shows what the owner has entered and
 * nothing else — with no address there is no address, and the note says so
 * plainly. A placeholder would be worse than the gap.
 */

const ROOMS = {
  manikuere: ['real-salon', 'real-manicure'],
  pedikuere: ['real-pedicure', 'pedicure-wide'],
  ambiente: ['hero-salon-wide', 'real-detail'],
} as const;

type Room = keyof typeof ROOMS;

export async function StudioPage({
  locale,
  query,
}: {
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = t(locale);
  const requested = typeof query.raum === 'string' ? query.raum : typeof query.room === 'string' ? query.room : null;
  const room: Room = (Object.keys(ROOMS) as Room[]).includes(requested as Room) ? (requested as Room) : 'manikuere';

  const config = await settings();
  const ready = contactReady(config);

  const media = await db.select().from(schema.mediaAsset);
  const bySlug = new Map(media.map((asset) => [asset.slug, asset]));

  const shown = ROOMS[room];
  const rooms = Object.keys(ROOMS) as Room[];
  const index = rooms.indexOf(room);
  const roomAt = (offset: number) => rooms[(index + offset + rooms.length) % rooms.length];
  const roomHref = (target: Room) => `${path(locale, 'studio')}?raum=${target}`;

  /*
   * The contact note. Everything the studio has actually entered, and the
   * standing sentence about what is still missing when it has entered nothing.
   */
  const contactLines = [
    ready.address ? `${config?.street}, ${config?.postalCode} ${config?.city}` : null,
    ready.phone ? config?.phone : null,
    ready.email ? config?.email : null,
  ].filter((line): line is string => Boolean(line));

  const notes = [
    { title: copy.studio.highlights[0].title, body: copy.studio.highlights[0].body, icon: <Leaf size={20} /> },
    { title: copy.studio.highlights[1].title, body: copy.studio.highlights[1].body, icon: <Gem size={20} /> },
    { title: copy.studio.highlights[2].title, body: copy.studio.highlights[2].body, icon: <Heart size={20} /> },
    {
      title: copy.studio.contactTitle,
      body: contactLines.length > 0 ? contactLines.join(' · ') : copy.studio.contactPending,
      icon: <Users size={20} />,
    },
  ];

  const flower = brand('flower');

  return (
    <div className="studio">
      <Petal position="tl" />
      <Petal position="br" />

      <div className="studio-grid">
        {/* ------------------------------------------------------- the word */}
        <section className="studio-copy">
          <span className="studio-eyebrow">{copy.studio.eyebrow}</span>

          <h1 className="studio-title">
            {copy.studio.titleLead}
            <span className="studio-title-accent">{copy.studio.titleAccent}</span>
          </h1>

          <p className="studio-intro">{copy.studio.intro}</p>

          <div className="studio-actions">
            <Link className="btn btn--cream" href={path(locale, 'booking')}>
              {copy.studio.book}
              <ArrowRight size={18} />
            </Link>
            <a className="btn btn--onHero" href="#studio-notes">
              {copy.studio.contact}
              <ArrowRight size={18} />
            </a>
          </div>

          <span className="studio-motto" aria-hidden="true">
            {copy.brand.motto.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </span>

          <span className="studio-script script" aria-hidden="true">
            {copy.brand.script}
            <Heart size={18} />
          </span>
        </section>

        {/* --------------------------------------------------- the pictures */}
        <section className="studio-stage" aria-label={copy.studio.rooms[room]}>
          {shown.map((slug, position) => {
            const asset = bySlug.get(slug);
            const concept = asset?.sourceType === 'ai_concept';
            return (
              <figure
                key={slug}
                className={`media studio-photo ${position === 0 ? 'studio-photo--arch' : 'studio-photo--inset'}`}
              >
                <Photo
                  id={slug as PhotoId}
                  alt={asset ? (locale === 'de' ? asset.altDe : asset.altEn) : ''}
                  sizes={position === 0 ? '(max-width: 1099px) 100vw, 36vw' : '(max-width: 1099px) 100vw, 24vw'}
                  priority={position === 0}
                  focalPoint={asset?.focalPoint}
                />
                {concept ? <figcaption className="media-note">{copy.studio.conceptLabel}</figcaption> : null}
              </figure>
            );
          })}

          {/* One word per line, then a rule running off towards the stamp. */}
          <p className="studio-story" aria-hidden="true">
            {copy.studio.storyLabel.map((word) => (
              <span key={word}>{word}</span>
            ))}
            <span className="studio-story-rule" />
          </p>

          {/*
            The stamp. The ring is real text on a real circle rather than an
            image of one, so it stays sharp at any size and needs no asset.
          */}
          <span className="studio-stamp" aria-hidden="true">
            <svg viewBox="0 0 120 120" className="studio-stamp-ring">
              <defs>
                <path id="studio-stamp-path" d="M60 60 m -43 0 a 43 43 0 1 1 86 0 a 43 43 0 1 1 -86 0" />
              </defs>
              <circle cx="60" cy="60" r="57" />
              <text>
                <textPath href="#studio-stamp-path" startOffset="0">
                  {`${copy.brand.motto.join(' · ')} · `}
                </textPath>
              </text>
            </svg>
            <img className="studio-stamp-flower" src={flower.src} width={flower.width} height={flower.height} alt="" />
          </span>
        </section>

        {/* ------------------------------------------------------ the notes */}
        <section className="studio-notes" id="studio-notes">
          <h2 className="sr-only">{copy.studio.title}</h2>

          <ul className="studio-note-list">
            {notes.map((note) => (
              <li key={note.title} className="studio-note">
                <span className="studio-note-icon">{note.icon}</span>
                <span className="studio-note-body">
                  <span className="studio-note-title">{note.title}</span>
                  <span className="studio-note-text">{note.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="studio-claim script" aria-hidden="true">
            {copy.studio.claimScript.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>

          <div className="studio-pager">
            <span className="tiny" aria-live="polite">
              {String(index + 1).padStart(2, '0')} / {String(rooms.length).padStart(2, '0')}
              <span className="sr-only"> · {copy.studio.rooms[room]}</span>
            </span>
            <Link
              className="round-arrow round-arrow--sm round-arrow--onHero"
              href={roomHref(roomAt(-1))}
              aria-label={copy.studio.rooms[roomAt(-1)]}
              scroll={false}
            >
              <ChevronLeft size={18} />
            </Link>
            <Link
              className="round-arrow round-arrow--sm round-arrow--onHero"
              href={roomHref(roomAt(1))}
              aria-label={copy.studio.rooms[roomAt(1)]}
              scroll={false}
            >
              <ChevronRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
