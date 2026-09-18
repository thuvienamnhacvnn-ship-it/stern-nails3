'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One row of the lookbook, with publication as the single editable state.
 *
 * The thumbnail is the preview: what is shown here is the file the gallery
 * serves, so approving a look and seeing a look are the same act rather than
 * two things that can drift apart.
 */
export function LookRow({
  look,
  source,
  labels,
}: {
  look: {
    id: string;
    name: string;
    teaser: string;
    collection: string;
    shape: string;
    length: string;
    finish: string;
    published: boolean;
    thumbnail: string | null;
  };
  source: { kind: string; disclosure: string | null; approval: string; alt: string } | null;
  labels: { published: string; unpublished: string };
}) {
  const router = useRouter();
  const [published, setPublished] = useState(look.published);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !published;
    try {
      const response = await fetch('/api/admin/looks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lookId: look.id, published: next }),
      });
      if (response.ok) {
        setPublished(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        {look.thumbnail ? (
          <img
            src={look.thumbnail}
            alt={source?.alt ?? ''}
            width={72}
            height={54}
            style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8, display: 'block' }}
          />
        ) : (
          <span className="tiny muted">kein Bild</span>
        )}
      </td>
      <td>
        <span className="strong">{look.name}</span>
        <span className="tiny muted" style={{ display: 'block' }}>
          {look.teaser}
        </span>
      </td>
      <td className="tiny muted">
        {look.collection} · {look.shape} · {look.length} · {look.finish}
      </td>
      <td className="tiny">
        {source ? (
          <>
            {source.kind === 'real_photo' ? 'Eigene Aufnahme' : 'Gestaltetes Bild'}
            {source.disclosure ? (
              <span className="muted" style={{ display: 'block' }}>
                Hinweis: {source.disclosure}
              </span>
            ) : null}
            <span className="muted" style={{ display: 'block' }}>
              Freigabe: {source.approval}
            </span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <button
          type="button"
          className="chip chip--sage"
          data-active={published}
          onClick={toggle}
          disabled={busy}
          aria-busy={busy}
        >
          {published ? labels.published : labels.unpublished}
        </button>
      </td>
    </tr>
  );
}
