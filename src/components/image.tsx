import { fallbackSrc, photo, srcSet, type PhotoId } from '@/lib/media';

/**
 * Every photograph on the site goes through here.
 *
 * It is a plain <picture>, not next/image: all the widths already exist on disk
 * from `npm run assets`, and this machine cannot run the native image binding
 * Next would want at runtime. The browser gets AVIF, then WebP, then a JPEG.
 *
 * `width` and `height` are always the intrinsic size from the manifest, even
 * though CSS decides the rendered size — that is what reserves the box before
 * the bytes arrive, so nothing below the image jumps when it loads.
 *
 * `alt` is required and has no default. A decorative image passes `alt=""`
 * explicitly, which is a decision somebody made rather than one that got
 * forgotten.
 */
export function Photo({
  id,
  alt,
  sizes,
  className,
  priority = false,
  focalPoint,
  style,
}: {
  id: PhotoId;
  alt: string;
  /** How wide the image will actually be. Without it the browser assumes 100vw. */
  sizes: string;
  className?: string;
  /** The hero, and only the hero: everything else waits until it is near. */
  priority?: boolean;
  /** CSS object-position, so a crop follows the subject. */
  focalPoint?: string;
  style?: React.CSSProperties;
}) {
  const meta = photo(id);
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(id, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(id, 'webp')} sizes={sizes} />
      <img
        src={fallbackSrc(id)}
        alt={alt}
        width={meta.width}
        height={meta.height}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        // High priority on the hero shortens the largest paint; everything else
        // stays out of the way of it.
        fetchPriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
        style={{ objectPosition: focalPoint, ...style }}
      />
    </picture>
  );
}

/**
 * The label a generated interior has to carry.
 *
 * Concept renders may be shown, but never as evidence of what the salon looks
 * like — so the caption is part of the image component rather than something a
 * page remembers to add.
 */
export function ConceptLabel({ children }: { children: string }) {
  return <span className="media-note">{children}</span>;
}
