/**
 * The bridge between what scripts/build-assets.mjs produced and what the page
 * puts in an <img>.
 *
 * The manifest is imported, not fetched: it is small, it is generated at build
 * time, and importing it means a missing image is a type error in the editor
 * rather than a broken box in the browser.
 */
import manifest from '../../public/media/manifest.json';

export type PhotoId = keyof typeof manifest.photo;
export type BrandId = keyof typeof manifest.brand;

export type Photo = {
  id: PhotoId;
  width: number;
  height: number;
  widths: number[];
  kind: 'real_photo' | 'ai_concept';
};

export function photo(id: PhotoId): Photo {
  const entry = manifest.photo[id] as Omit<Photo, 'id'>;
  return { id, ...entry };
}

export function brand(id: BrandId): { src: string; width: number; height: number } {
  const entry = manifest.brand[id];
  return { src: `/media/brand/${id}.png`, width: entry.width, height: entry.height };
}

export function hasPhoto(id: string): id is PhotoId {
  return id in manifest.photo;
}

const url = (id: PhotoId, width: number, ext: string) => `/media/photo/${id}-${width}.${ext}`;

/** `/media/photo/nail-french-640.webp 640w, …` */
export function srcSet(id: PhotoId, ext: 'avif' | 'webp'): string {
  return photo(id).widths.map((w) => `${url(id, w, ext)} ${w}w`).join(', ');
}

/** The JPEG at full width — the src an <img> falls back to. */
export function fallbackSrc(id: PhotoId): string {
  return `/media/photo/${id}.jpg`;
}

/** Whether this image must carry a "concept visualisation" label. */
export function isConcept(id: PhotoId): boolean {
  return photo(id).kind === 'ai_concept';
}
