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
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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
  // The start page's banner: the delivered picture, used as delivered.
  { id: 'hero-banner', file: 'interiors/hero-banner.png', kind: 'ai_concept' },
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
  // A composed asset hands over an absolute path; the rest name a file in assets/.
  const src = isAbsolute(photo.file) ? photo.file : join(SRC, photo.file);
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

  /*
   * A content fingerprint, carried into the URL as `?v=`.
   *
   * These files are served with `Cache-Control: immutable`, which tells a
   * browser it never has to ask again — correct, and a trap, because the
   * filenames do not change when the picture does. Rebuilding the banner and
   * seeing the old one come back is not a stale dev server; it is the cache
   * doing exactly what it was told. The fingerprint makes a changed picture a
   * different URL, which is the only thing `immutable` accepts as news.
   */
  const version = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 8);
  manifest.photo[photo.id] = { width: w, height: h, widths, kind: photo.kind, v: version };
  console.log(`photo ${photo.id} ${w}x${h} -> ${widths.length} widths`);
}

/* ------------------------------------------------------------------- brand */

/**
 * The mark, as delivered.
 *
 * It arrives as a transparent PNG, so there is nothing to lift: the alpha
 * channel already says what is artwork. Everything that used to stand here —
 * two hundred lines that walked in from the border of the image through pixels
 * close to the local background, sealed the palest petal against a channel the
 * walk could slip through, and punched the counters out by colour — went with
 * the old delivery.
 *
 * Worth keeping from it, in case a flat render ever turns up again: that
 * approach only works on a flat, evenly lit card. The mark was later delivered
 * as a photograph of a stucco wall with a diagonal shadow and blossoms leaning
 * into two corners, and the border walk kept half the wall. A transparent PNG
 * is the right thing to ask for, and this is what asking for it buys.
 */
function readMark(pngPath) {
  const { w, h } = size(pngPath);
  const raw = join(TMP, 'mark-rgba.raw');
  ff(['-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', raw]);
  const rgba = readFileSync(raw);

  const opaqueRows = new Int32Array(h);
  const colMin = new Int32Array(h).fill(w);
  const colMax = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (rgba[(y * w + x) * 4 + 3] <= 120) continue;
      opaqueRows[y] += 1;
      if (x < colMin[y]) colMin[y] = x;
      if (x > colMax[y]) colMax[y] = x;
    }
  }
  return { w, h, rgba, opaqueRows, colMin, colMax };
}

/**
 * The wordmark, recoloured for a dark background.
 *
 * "stern NAILS 3" is moulded in dark olive on cream: on the site's near-black
 * it would be a hole rather than a word. Inverting it would also invert the
 * moulding, lighting the letters from below and reading as a dent.
 *
 * So the shape is kept and the ink is replaced. Each pixel's own lightness sets
 * how bright its cream is, with the ramp reversed — the deepest parts of the
 * letterform become the brightest ink — which preserves the relief while
 * turning it the right way up for light-on-dark.
 */
function recolourForDark(part, box, ink = [237, 231, 218]) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const source = ((y0 + y) * part.w + x0 + x) * 4;
      const target = (y * w + x) * 4;
      const luma = (part.rgba[source] * 0.299 + part.rgba[source + 1] * 0.587 + part.rgba[source + 2] * 0.114) / 255;
      // 0.62..1 rather than 0..1: even the lightest edge of the original stays
      // clearly readable instead of fading into the background.
      const level = 0.62 + (1 - luma) * 0.38;
      out[target] = Math.min(255, Math.round(ink[0] * level));
      out[target + 1] = Math.min(255, Math.round(ink[1] * level));
      out[target + 2] = Math.min(255, Math.round(ink[2] * level));
      out[target + 3] = part.rgba[source + 3];
    }
  }
  return { w, h, rgba: out };
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
  manifest.brand[name] = {
    width: w,
    height: h,
    v: createHash('sha256').update(crop).digest('hex').slice(0, 8),
  };
  console.log(`brand ${name} ${w}x${h}`);
  return { w, h };
}

const card = readMark(join(SRC, 'brand', 'logo-mark.png'));
const rows = bands(card.opaqueRows, card.h);
if (rows.length === 0) throw new Error('found no artwork on the card at all');

const inkTop = rows[0][0];
const inkBottom = rows[rows.length - 1][1];

/*
 * Where the flower ends and the word begins.
 *
 * The delivered mark is one connected drawing: the stem runs down out of the
 * blossom, past the leaf, and into the "S" of Stern. So there is no gap to
 * split on, and looking for two bands of ink found one — which is what this
 * used to do, and what stopped working the day the mark changed.
 *
 * The waist is the split instead: between a third and two thirds of the way
 * down, the narrowest row of ink in the whole mark is the stem, and that is
 * exactly the line between the blossom above and the lettering below. If the
 * mark ever goes back to two separate bands this still finds the gap, because
 * a gap is the narrowest row there is.
 */
const waist = (() => {
  const from = Math.round(inkTop + (inkBottom - inkTop) * 0.34);
  const to = Math.round(inkTop + (inkBottom - inkTop) * 0.68);
  let best = from;
  for (let y = from; y <= to; y += 1) if (card.opaqueRows[y] < card.opaqueRows[best]) best = y;
  return best;
})();

// The blossom, the stem and the leaf; then the lettering. They are cropped so
// that each is a whole picture on its own, because the header sets them side by
// side rather than as the stacked lockup they are delivered as.
const flowerBand = [inkTop, waist];
const wordBand = [waist + 1, inkBottom];
console.log(`mark: ink ${inkTop}-${inkBottom}, waist at ${waist} (${card.opaqueRows[waist]} px of ink)`);

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
const boxes = {};
for (const [band, name] of [[flowerBand, 'flower'], [[inkTop, inkBottom], 'logo']]) {
  const [x0, x1] = xOf(band);
  boxes[name] = [
    clamp(x0 - PAD, 0, card.w - 1), clamp(band[0] - PAD, 0, card.h - 1),
    clamp(x1 + PAD, 0, card.w - 1), clamp(band[1] + PAD, 0, card.h - 1),
  ];
  writeCrop(card, boxes[name], name);
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

/*
 * The icons a phone puts on its home screen.
 *
 * Square, and on a cream ground rather than transparent: a launcher draws the
 * icon on whatever wallpaper is there, and a transparent flower on a dark
 * wallpaper is three pale petals floating in nothing.
 *
 * Two shapes. The plain one fills its square; the maskable one keeps the mark
 * inside the middle third, because a launcher is free to crop an icon to a
 * circle, a rounded square or a squircle and will cut the corners off anything
 * that reaches them.
 */
for (const [edge, inset, name] of [
  [192, 0.2, 'app-icon-192'],
  [512, 0.2, 'app-icon-512'],
  [512, 0.34, 'app-icon-maskable'],
]) {
  const mark = Math.round(edge * (1 - inset * 2));
  ff([
    '-f', 'lavfi', '-i', `color=c=0xf7f2e9:s=${edge}x${edge}`,
    '-i', join(OUT, 'brand', 'flower.png'),
    '-filter_complex',
    `[1:v]scale=${mark}:${mark}:force_original_aspect_ratio=decrease[m];[0:v][m]overlay=(W-w)/2:(H-h)/2`,
    '-frames:v', '1', join(OUT, 'brand', `${name}.png`),
  ]);
  manifest.brand[name] = { width: edge, height: edge };
  console.log(`brand ${name} ${edge}x${edge}`);
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(TMP, { recursive: true, force: true });
console.log(`\nwrote ${Object.keys(manifest.photo).length} photo ladders and ${Object.keys(manifest.brand).length} brand marks`);
