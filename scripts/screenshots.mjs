/**
 * Captures the handover screenshots.
 *
 * Chrome over the DevTools protocol, spoken directly. Two reasons it is not
 * Playwright or Puppeteer: Chrome is already installed here, and this
 * workstation blocks unsigned native binaries, so a package that downloads its
 * own browser build is a fight rather than a dependency.
 *
 * Two reasons it is not `chrome --screenshot`, which would be simpler: that
 * flag cannot produce a phone-sized shot, because Chrome refuses to open a
 * window narrower than about 500px and then crops the picture to the size you
 * asked for — which looks exactly like a broken responsive layout and is not
 * one. Framing the page in a small iframe does not work either, and should not:
 * the app sends `X-Frame-Options: SAMEORIGIN`.
 *
 * `Emulation.setDeviceMetricsOverride` is the right instrument. It sets a real
 * viewport of any size, independent of the window, so the media queries fire
 * the way they do on the device.
 *
 *   npm run dev      (in one terminal)
 *   npm run shots    (in another)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'shots');
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3110';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate));

if (!CHROME) {
  console.error('No Chrome found. Set the path in scripts/screenshots.mjs or install Chrome.');
  process.exit(1);
}

const alive = await fetch(`${BASE}/de/start`).catch(() => null);
if (!alive?.ok) {
  console.error(`Nothing is answering on ${BASE}. Start the dev server first: npm run dev`);
  process.exit(1);
}

/** Numbered to line up with the kit's own screens. */
const PAGES = [
  { name: '01-home', path: '/de/start' },
  { name: '02-services', path: '/de/leistungen' },
  { name: '03-nail-looks', path: '/de/looks' },
  { name: '04-booking', path: '/de/termin?service=french-manikuere' },
  { name: '05-checkout', path: '/de/checkout' },
  { name: '06-studio', path: '/de/studio' },
  { name: '07-vouchers', path: '/de/gutscheine' },
  { name: '08-account', path: '/de/konto' },
  { name: '09-ai-stylist', path: '/de/stylist' },
  { name: '10-admin', path: '/admin/login' },
  { name: '11-imprint', path: '/de/impressum' },
  { name: '12-english-home', path: '/en/start' },
];

const VIEWPORTS = [
  { suffix: 'desktop', width: 1440, height: 900, mobile: false },
  { suffix: 'mobile', width: 390, height: 844, mobile: true },
];

/* ------------------------------------------------------------------ chrome */

const PORT = 9333 + (process.pid % 200);
const profile = mkdtempSync(join(tmpdir(), 'stern-shots-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

/** Chrome writes its endpoint once it is listening; poll until it answers. */
async function endpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error('Chrome did not open a debugging port');
}

const socket = new WebSocket(await endpoint());
await new Promise((ready, fail) => {
  socket.addEventListener('open', ready, { once: true });
  socket.addEventListener('error', fail, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function send(method, params = {}, sessionId) {
  const id = (nextId += 1);
  return new Promise((resolve_, reject) => {
    pending.set(id, { resolve: resolve_, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

/* ---------------------------------------------------------------- capture */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let taken = 0;

for (const viewport of VIEWPORTS) {
  for (const page of PAGES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    try {
      await send('Page.enable', {}, sessionId);
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        // A retina-sharp picture either way; the viewport above is in CSS
        // pixels and is what the media queries see.
        deviceScaleFactor: 2,
        mobile: viewport.mobile,
      }, sessionId);

      await send('Page.navigate', { url: `${BASE}${page.path}` }, sessionId);
      // Fonts, the hero image and the lazily-loaded cards below it all need a
      // moment; a shorter wait catches the page mid-swap with fallback type.
      await sleep(3500);

      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      writeFileSync(join(OUT, `${page.name}-${viewport.suffix}.png`), Buffer.from(data, 'base64'));
      taken += 1;
      console.log(`  ${page.name}-${viewport.suffix}.png`);
    } catch (error) {
      console.warn(`  skipped ${page.name}-${viewport.suffix}: ${error instanceof Error ? error.message : error}`);
    } finally {
      await send('Target.closeTarget', { targetId });
    }
  }
}

socket.close();
chrome.kill();

// Chrome takes a moment to let go of its profile directory, and on Windows a
// removal while it still holds a handle fails with EPERM. The directory sits in
// the system temp folder either way, so failing to delete it is not worth a
// non-zero exit code on an otherwise successful run.
await sleep(800);
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // left behind in the temp folder; harmless
}

console.log(`\n${taken} screenshots in shots/`);
