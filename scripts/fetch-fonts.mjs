/**
 * Downloads the three self-hosted webfonts into public/fonts/.
 *
 * The brand calls for Cormorant Garamond (headings) and Manrope (body); Allura
 * carries the handwritten accents that appear in the design screens. All three
 * are SIL Open Font License, so they may be served from our own origin — which
 * is the point: no Google Fonts request leaves the visitor's browser before the
 * cookie banner has been answered.
 *
 * Run once; the woff2 files are committed. Re-run only to change weights.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
mkdirSync(OUT, { recursive: true });

// A modern UA string: Google serves woff2 only to browsers it recognises.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FAMILIES = [
  { css: 'Cormorant+Garamond:wght@400;500;600;700', slug: 'cormorant-garamond' },
  { css: 'Manrope:wght@400;500;600;700', slug: 'manrope' },
  { css: 'Allura', slug: 'allura' },
];

// latin + latin-ext cover German; anything else would be dead weight.
const WANTED_SUBSETS = new Set(['latin', 'latin-ext']);

async function get(url, asText) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

for (const family of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${family.css}&display=swap`, true);

  /*
   * The stylesheet is a run of @font-face blocks, each preceded by a
   * `/* subset *\/` comment. We keep only the subsets we need, and name each
   * file after family-weight-style-subset so the generated @font-face rules in
   * fonts.css are predictable.
   */
  let subset = 'latin';
  let written = 0;
  for (const chunk of css.split('@font-face')) {
    const label = chunk.match(/\/\*\s*([a-z-]+)\s*\*\//);
    if (label) subset = label[1];
    if (!WANTED_SUBSETS.has(subset)) continue;

    const src = chunk.match(/src:\s*url\((https:[^)]+\.woff2)\)/);
    if (!src) continue;
    const weight = (chunk.match(/font-weight:\s*(\d+)/) ?? [, '400'])[1];
    const style = (chunk.match(/font-style:\s*(\w+)/) ?? [, 'normal'])[1];

    const name = `${family.slug}-${weight}-${style}-${subset}.woff2`;
    const file = join(OUT, name);
    if (existsSync(file)) { written += 1; continue; }
    writeFileSync(file, await get(src[1], false));
    written += 1;
    console.log(`  ${name}`);
  }
  if (written === 0) throw new Error(`no faces extracted for ${family.slug}`);
  console.log(`${family.slug}: ${written} faces`);
}
