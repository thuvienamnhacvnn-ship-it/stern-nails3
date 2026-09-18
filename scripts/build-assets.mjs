/**
 * Turns the design-kit originals in assets/ into what the browser downloads.
 *
 * ffmpeg rather than sharp: this workstation blocks unsigned native node
 * bindings, so a `require('sharp')` here dies with "Cannot find native
 * binding". ffmpeg is installed system-wide and does every job we need.
 *
 * Two kinds of output land in public/media/:
 *
 *  - photo ladders — each photograph at the widths the layout actually asks
 *    for, as AVIF and WebP, plus one JPEG fallback at full width. The page
 *    ships an <img srcset> built from public/media/manifest.json, so the
 *    intrinsic size is always known and nothing reflows while loading.
 *
 *  - the brand marks — the flower and the "stern NAILS 3" wordmark lifted off
 *    the cream card they were delivered on, with real transparency, so the
 *    header can set them side by side the way the design screens do. The
 *    original card is copied through untouched as well.
 *
 * Re-run with `npm run assets` after changing anything in assets/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets');
const OUT = join(root, 'public', 'media');
const TMP = join(root, '.tmp');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'photo'), { recursive: true });
mkdirSync(join(OUT, 'brand'), { recursive: true });
mkdirSync(TMP, { recursive: true });

const ff = (args) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

function size(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file],
    { encoding: 'utf8' },
  ).trim();
  const [w, h] = out.split('x').map(Number);
  return { w, h };
}

/* ------------------------------------------------------------------ photos */

/**
 * The widths any one photograph is offered in. A source is never upscaled —
 * the spec is explicit that we must not fake sharpness — so the ladder is
 * clipped to the original width and the original width is always included.
 */
const LADDER = [360, 540, 720, 960, 1280, 1600, 1920];

/**
 * Every photograph, with the role it plays. `kind` is carried into the runtime
 * manifest because the UI has to label AI concept images differently from the
 * studio's own photographs — an invented interior may not be presented as
 * documentary evidence of the salon.
 */
const PHOTOS = [
  { id: 'hero-salon-wide', file: 'interiors/hero-salon-wide.png', kind: 'ai_concept' },
  { id: 'studio-portrait', file: 'interiors/studio-portrait.png', kind: 'ai_concept' },
  { id: 'pedicure-wide', file: 'interiors/pedicure-wide.png', kind: 'ai_concept' },
  { id: 'care-still-life', file: 'interiors/care-still-life.png', kind: 'ai_concept' },
  { id: 'real-salon', file: 'interiors/real-salon.jpg', kind: 'real_photo' },
  { id: 'real-manicure', file: 'interiors/real-manicure.jpg', kind: 'real_photo' },
  { id: 'real-pedicure', file: 'interiors/real-pedicure.jpg', kind: 'real_photo' },
  { id: 'real-detail', file: 'interiors/real-detail.jpg', kind: 'real_photo' },
  { id: 'real-treatment', file: 'interiors/real-treatment.jpg', kind: 'real_photo' },
  { id: 'nail-french', file: 'nails/nail-french.png', kind: 'ai_concept' },
  { id: 'nail-rose', file: 'nails/nail-rose.png', kind: 'ai_concept' },
  { id: 'nail-cat-eye', file: 'nails/nail-cat-eye.png', kind: 'ai_concept' },
  { id: 'nail-nude', file: 'nails/nail-nude.png', kind: 'ai_concept' },
  { id: 'nail-blossom', file: 'nails/nail-blossom.png', kind: 'ai_concept' },
  { id: 'nail-pearl', file: 'nails/nail-pearl.png', kind: 'ai_concept' },
];

const manifest = { photo: {}, brand: {} };

for (const photo of PHOTOS) {
  const src = join(SRC, photo.file);
  const { w, h } = size(src);
  const widths = [...new Set(LADDER.filter((x) => x < w).concat(w))].sort((a, b) => a - b);

  for (const width of widths) {
    // -2 keeps the aspect ratio and rounds to an even number, which the
    // yuv420p chroma subsampling below requires.
    const scale = `scale=${width}:-2:flags=lanczos`;
    ff(['-i', src, '-vf', scale, '-c:v', 'libaom-av1', '-still-picture', '1', '-cpu-used', '6', '-crf', '32',
      '-pix_fmt', 'yuv420p', join(OUT, 'photo', `${photo.id}-${width}.avif`)]);
    ff(['-i', src, '-vf', scale, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6',
      join(OUT, 'photo', `${photo.id}-${width}.webp`)]);
  }
  // One JPEG at full width: the fallback for a browser that has neither, and
  // the file an <img src> can point at without a <picture> wrapper.
  ff(['-i', src, '-c:v', 'mjpeg', '-q:v', '4', '-pix_fmt', 'yuvj420p', join(OUT, 'photo', `${photo.id}.jpg`)]);

  manifest.photo[photo.id] = { width: w, height: h, widths, kind: photo.kind };
  console.log(`photo ${photo.id} ${w}x${h} -> ${widths.length} widths`);
}

/* ------------------------------------------------------------------- brand */

/**
 * The logo arrives as a 1254² render of a cream card: the folded flower above
 * the "stern NAILS 3" wordmark, lit from the upper left so the card carries a
 * faint gradient. The header wants those two elements next to each other, at
 * different sizes, over the site's own cream — which is a slightly different
 * cream. So the card has to come off.
 *
 * A flat colour key cannot do it: there is no flat colour. Instead each row's
 * background is estimated from its own left and right margins (the artwork
 * never reaches the edge), and a pixel's opacity is how far it has travelled
 * from that estimate. Colour is kept as delivered; only alpha is computed. The
 * SOFT..HARD band gives the petals a feathered edge instead of a cut one.
 */
function liftOffCard(pngPath) {
  const { w, h } = size(pngPath);
  const raw = join(TMP, 'logo-rgb.raw');
  ff(['-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  const rgb = readFileSync(raw);

  const SOFT = 14; // below this, pure background
  const HARD = 30; // above this, fully opaque artwork

  const rgba = Buffer.alloc(w * h * 4);
  const opaqueRows = new Int32Array(h);
  const colMin = new Int32Array(h).fill(w);
  const colMax = new Int32Array(h).fill(-1);

  for (let y = 0; y < h; y += 1) {
    const left = (y * w + 3) * 3;
    const right = (y * w + w - 4) * 3;
    const bg = [
      (rgb[left] + rgb[right]) / 2,
      (rgb[left + 1] + rgb[right + 1]) / 2,
      (rgb[left + 2] + rgb[right + 2]) / 2,
    ];
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const o = (y * w + x) * 4;
      const d = Math.hypot(rgb[i] - bg[0], rgb[i + 1] - bg[1], rgb[i + 2] - bg[2]);
      const a = d <= SOFT ? 0 : d >= HARD ? 255 : Math.round(((d - SOFT) / (HARD - SOFT)) * 255);
      rgba[o] = rgb[i];
      rgba[o + 1] = rgb[i + 1];
      rgba[o + 2] = rgb[i + 2];
      rgba[o + 3] = a;
      if (a > 120) {
        opaqueRows[y] += 1;
        if (x < colMin[y]) colMin[y] = x;
        if (x > colMax[y]) colMax[y] = x;
      }
    }
  }
  return { w, h, rgba, opaqueRows, colMin, colMax };
}

/**
 * Splits the card's rows into the bands that actually hold artwork, so the
 * flower and the wordmark can be cropped to their own ink rather than to
 * numbers somebody measured once and that break on the next logo revision.
 */
function bands(opaqueRows, h, minRows = 6, minGap = 5) {
  const out = [];
  let start = -1;
  let gap = 0;
  for (let y = 0; y < h; y += 1) {
    if (opaqueRows[y] >= minRows) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0) {
      gap += 1;
      if (gap > minGap) {
        out.push([start, y - gap]);
        start = -1;
      }
    }
  }
  if (start >= 0) out.push([start, h - 1]);
  return out;
}

function writeCrop(part, box, name) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const crop = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    part.rgba.copy(crop, y * w * 4, ((y0 + y) * part.w + x0) * 4, ((y0 + y) * part.w + x0 + w) * 4);
  }
  const raw = join(TMP, `${name}.raw`);
  writeFileSync(raw, crop);
  const png = join(OUT, 'brand', `${name}.png`);
  ff(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', raw, '-frames:v', '1', png]);
  // WebP keeps the alpha and is roughly a third of the PNG.
  ff(['-i', png, '-c:v', 'libwebp', '-lossless', '1', join(OUT, 'brand', `${name}.webp`)]);
  manifest.brand[name] = { width: w, height: h };
  console.log(`brand ${name} ${w}x${h}`);
  return { w, h };
}

const card = liftOffCard(join(SRC, 'brand', 'logo-clean.png'));
const rows = bands(card.opaqueRows, card.h);
if (rows.length < 2) throw new Error(`expected a flower band and a wordmark band, found ${rows.length}`);

// The first band is the flower. Everything below it is the wordmark: "stern"
// and "NAILS 3" are separate bands of ink but one typographic unit, so they
// are cropped together and keep their original spacing.
const flowerBand = rows[0];
const wordBand = [rows[1][0], rows[rows.length - 1][1]];

const xOf = (band) => {
  let x0 = card.w;
  let x1 = -1;
  for (let y = band[0]; y <= band[1]; y += 1) {
    if (card.colMax[y] < 0) continue;
    if (card.colMin[y] < x0) x0 = card.colMin[y];
    if (card.colMax[y] > x1) x1 = card.colMax[y];
  }
  return [x0, x1];
};

const PAD = 6; // a hair of transparent margin so the feathered edge is not clipped
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
for (const [band, name] of [[flowerBand, 'flower'], [wordBand, 'wordmark']]) {
  const [x0, x1] = xOf(band);
  writeCrop(card, [
    clamp(x0 - PAD, 0, card.w - 1), clamp(band[0] - PAD, 0, card.h - 1),
    clamp(x1 + PAD, 0, card.w - 1), clamp(band[1] + PAD, 0, card.h - 1),
  ], name);
}

// The delivered card itself, for the gift-card mockup and social previews,
// where the cream board is part of the picture.
for (const [file, name] of [['logo-clean.png', 'logo-card'], ['logo-original.png', 'logo-card-original']]) {
  const src = join(SRC, 'brand', file);
  ff(['-i', src, '-vf', 'scale=512:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '88',
    join(OUT, 'brand', `${name}.webp`)]);
  copyFileSync(src, join(OUT, 'brand', `${name}.png`));
  const dims = size(src);
  manifest.brand[name] = { width: dims.w, height: dims.h };
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(TMP, { recursive: true, force: true });
console.log(`\nwrote ${Object.keys(manifest.photo).length} photo ladders and ${Object.keys(manifest.brand).length} brand marks`);
