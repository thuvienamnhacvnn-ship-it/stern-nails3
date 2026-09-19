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
 * The logo arrives as a 1254² render of a cream card: the folded flower above
 * the "stern NAILS 3" wordmark, lit from the upper left, casting a soft shadow
 * onto the card. The header wants those two elements side by side, over the
 * site's own cream — a slightly different cream — and, since the site has a
 * dark theme, over a near-black olive as well. So the card has to come off
 * cleanly, shadow and all.
 *
 * A colour key cannot do it, and the first version of this function proved it
 * twice. Keyed gently, the card's soft shadow survives as a cream halo that is
 * invisible on cream and obvious on dark. Keyed hard enough to kill the shadow,
 * the palest pink petal — which is barely lighter than the card — is punched
 * out with it, leaving a hole through the flower.
 *
 * The background is not a colour, though. It is a *region*: one connected area
 * that touches every edge of the image, which the artwork never does. So this
 * floods inwards from the border, walking only through pixels close to the
 * local background, and whatever the flood never reaches is artwork. The shadow
 * is a gentle ramp, so the flood walks straight down it and removes all of it;
 * the pale petal is enclosed by darker edges the flood cannot cross, so it
 * survives intact. One pass, both problems.
 */
function liftOffCard(pngPath) {
  const { w, h } = size(pngPath);
  const raw = join(TMP, 'logo-rgb.raw');
  ff(['-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  const rgb = readFileSync(raw);

  /*
   * How far from its row's background a pixel may still be and count as
   * background for the flood. Generous on purpose: it has to be able to travel
   * the whole length of the shadow ramp. It is safe to be generous precisely
   * because connectivity, not the threshold, is what protects the artwork.
   *
   * It does not reach the very bottom of the ramp, and the mark keeps a soft
   * cream edge where the relief casts its shadow — faint on cream, a thin glow
   * on the dark theme. Two attempts at closing that gap are recorded here as
   * things not to try again: walking on while the pixel is the card's colour
   * scaled to its own brightness stops less than halfway down, because the
   * shadow turns warmer as it deepens rather than simply darker; adding "and
   * only downhill" carries it to the bottom and then straight on into the sage
   * petals, whose shaded flanks are downhill and warm as well, and chews holes
   * in them. The glow is the cheaper of the two.
   */
  const WALKABLE = 26;

  // Distance from the local background, per pixel. The row's own margins are
  // the estimate, because the card is lit unevenly top to bottom.
  const distance = new Float32Array(w * h);
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
      distance[y * w + x] = Math.hypot(rgb[i] - bg[0], rgb[i + 1] - bg[1], rgb[i + 2] - bg[2]);
    }
  }

  // Flood from every border pixel. An explicit stack rather than recursion: a
  // million-pixel fill would blow the call stack.
  const isBackground = new Uint8Array(w * h);
  const stack = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const index = y * w + x;
    if (isBackground[index] || distance[index] >= WALKABLE) return;
    isBackground[index] = 1;
    stack.push(index);
  };
  const flood = () => {
    while (stack.length > 0) {
      const index = stack.pop();
      const x = index % w;
      const y = (index - x) / w;
      visit(x - 1, y);
      visit(x + 1, y);
      visit(x, y - 1);
      visit(x, y + 1);
    }
  };
  for (let x = 0; x < w; x += 1) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    visit(0, y);
    visit(w - 1, y);
  }
  flood();

  /*
   * One petal defeats the flood on its own. The palest pink one is lit almost
   * to the colour of the card along its upper edge, so there is a narrow
   * low-contrast channel between its interior and the outside — and the flood
   * walks through it and empties the petal, leaving a white patch that is faint
   * on cream and glaring on dark.
   *
   * Closing the artwork mask seals it: grow the artwork by a few pixels, which
   * bridges any channel narrower than twice that, then shrink it back, which
   * returns every genuine edge to where it was. The flood is then re-run
   * against the sealed mask, and the petal's interior is no longer reachable.
   *
   * The radius has to stay well under the narrowest real gap in the mark — the
   * spaces between the petals, which are far wider — or the flower would close
   * into a blob.
   */
  const SEAL = 5;
  const artwork = new Uint8Array(w * h);
  for (let i = 0; i < artwork.length; i += 1) artwork[i] = isBackground[i] ? 0 : 1;

  /** Separable box dilate/erode: two 1-D passes instead of one 2-D window. */
  const morph = (mask, radius, grow) => {
    const pick = grow ? Math.max : Math.min;
    const horizontal = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let value = grow ? 0 : 1;
        for (let d = -radius; d <= radius; d += 1) {
          const nx = x + d;
          if (nx < 0 || nx >= w) continue;
          value = pick(value, mask[y * w + nx]);
        }
        horizontal[y * w + x] = value;
      }
    }
    const result = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let value = grow ? 0 : 1;
        for (let d = -radius; d <= radius; d += 1) {
          const ny = y + d;
          if (ny < 0 || ny >= h) continue;
          value = pick(value, horizontal[ny * w + x]);
        }
        result[y * w + x] = value;
      }
    }
    return result;
  };

  const sealed = morph(morph(artwork, SEAL, true), SEAL, false);

  isBackground.fill(0);
  stack.length = 0;
  const visitSealed = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const index = y * w + x;
    if (isBackground[index] || sealed[index]) return;
    isBackground[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < w; x += 1) {
    visitSealed(x, 0);
    visitSealed(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    visitSealed(0, y);
    visitSealed(w - 1, y);
  }
  while (stack.length > 0) {
    const index = stack.pop();
    const x = index % w;
    const y = (index - x) / w;
    visitSealed(x - 1, y);
    visitSealed(x + 1, y);
    visitSealed(x, y - 1);
    visitSealed(x, y + 1);
  }

  /*
   * The counters.
   *
   * Everything above finds the background by walking in from the border, and a
   * counter is by definition where the border cannot reach: the hole in the
   * `e`, the aperture of the `s`, and the S-shaped channel the five petals
   * leave between them — which is the mark's whole idea, the S of "stern"
   * drawn by the flower. Left filled they are cream shapes floating on a dark
   * page and the S never appears at all.
   *
   * They cannot be picked out by brightness. The palest petal is lit almost to
   * the card's own value, and keying on that punches a hole through the flower,
   * which is the failure this function exists to avoid.
   *
   * They can be picked out by colour. A counter is the card, so once the card's
   * colour is scaled to the region's own brightness the two agree within a
   * couple of levels; the sheen on a petal stays pink, twenty-odd levels of red
   * over green where the card has seven. Measured on the delivered art every
   * counter lands under 3 and every highlight over 8, so the line sits at 5.
   */
  const cardColour = (() => {
    const at = (x, y) => {
      const i = (y * w + x) * 3;
      return [rgb[i], rgb[i + 1], rgb[i + 2]];
    };
    const corners = [at(4, 4), at(w - 5, 4), at(4, h - 5), at(w - 5, h - 5)];
    return [0, 1, 2].map((channel) => corners.reduce((sum, c) => sum + c[channel], 0) / 4);
  })();
  const cardSum = cardColour[0] + cardColour[1] + cardColour[2];
  const IS_CARD = 5;
  // Below this a region is a speck of sheen or a single stray pixel, and
  // punching it would nibble the artwork rather than open a counter.
  const MIN_COUNTER = 24;

  const seenRegion = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start += 1) {
    if (seenRegion[start] || isBackground[start] || distance[start] >= WALKABLE) continue;
    const region = [];
    const queue = [start];
    seenRegion[start] = 1;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    while (queue.length > 0) {
      const index = queue.pop();
      region.push(index);
      const o = index * 3;
      sumR += rgb[o];
      sumG += rgb[o + 1];
      sumB += rgb[o + 2];
      const x = index % w;
      const y = (index - x) / w;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (seenRegion[next] || isBackground[next] || distance[next] >= WALKABLE) continue;
        seenRegion[next] = 1;
        queue.push(next);
      }
    }
    if (region.length < MIN_COUNTER) continue;
    const n = region.length;
    const mean = [sumR / n, sumG / n, sumB / n];
    const scale = (mean[0] + mean[1] + mean[2]) / cardSum;
    const offCard = Math.hypot(
      mean[0] - cardColour[0] * scale,
      mean[1] - cardColour[1] * scale,
      mean[2] - cardColour[2] * scale,
    );
    if (offCard > IS_CARD) continue;
    /*
     * The counter has a shadow of its own, cast by the wall of the letter or
     * the petal around it. Marking the flat middle and stopping would leave
     * that as a cream ring inside the hole, so the same downhill walk is run
     * again from what was just opened.
     */
    for (const index of region) {
      isBackground[index] = 1;
      stack.push(index);
    }
    flood();
  }

  /*
   * A hard mask would leave a stair-stepped edge on a curve. Alpha is averaged
   * over a 3×3 neighbourhood, which feathers the boundary by about a pixel —
   * enough to read as smooth at any size the mark is used at, and not enough to
   * bring the shadow back.
   */
  const rgba = Buffer.alloc(w * h * 4);
  const opaqueRows = new Int32Array(h);
  const colMin = new Int32Array(h).fill(w);
  const colMax = new Int32Array(h).fill(-1);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let solid = 0;
      let counted = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          counted += 1;
          if (!isBackground[ny * w + nx]) solid += 1;
        }
      }
      const a = Math.round((solid / counted) * 255);
      const i = (y * w + x) * 3;
      const o = (y * w + x) * 4;
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
const boxes = {};
for (const [band, name] of [[flowerBand, 'flower'], [wordBand, 'wordmark']]) {
  const [x0, x1] = xOf(band);
  boxes[name] = [
    clamp(x0 - PAD, 0, card.w - 1), clamp(band[0] - PAD, 0, card.h - 1),
    clamp(x1 + PAD, 0, card.w - 1), clamp(band[1] + PAD, 0, card.h - 1),
  ];
  writeCrop(card, boxes[name], name);
}

/*
 * The flower needs no dark variant: sage and blush both hold their own against
 * a near-black, and the flood fill has already taken the shadow with it. The
 * wordmark does — dark olive ink on a dark background is a hole, not a word.
 */
const lightWordmark = recolourForDark(card, boxes.wordmark);
writeCrop(
  { w: lightWordmark.w, rgba: lightWordmark.rgba },
  [0, 0, lightWordmark.w - 1, lightWordmark.h - 1],
  'wordmark-dark',
);

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
