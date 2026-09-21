'use client';

import { useEffect, useRef } from 'react';

/**
 * A field of small stars drifting out of the flower on the phone banner.
 *
 * The picture behind it is the salon with its sign lit on the planted wall, and
 * the flower at the top of that sign is the one point in the frame everything
 * else is arranged around. This puts a slow glitter around it.
 *
 * Things it deliberately does not do:
 *
 *  - it never runs on a desktop. The canvas is hidden there by CSS, and the
 *    loop checks that before it starts, so a wide window pays nothing at all;
 *  - `prefers-reduced-motion` gets one still frame instead of an animation.
 *    Drifting specks are exactly what that setting is about, and a dead canvas
 *    would lose the effect entirely, so the stars are drawn once and left;
 *  - it stops when the banner scrolls away and when the tab is hidden. A
 *    phone should not be animating a picture nobody is looking at;
 *  - every star is one `drawImage` of a sprite drawn once at startup. Two
 *    hundred and sixty radial gradients per frame is how a canvas melts a
 *    phone battery; two hundred and sixty blits is not.
 *
 * The origin is worked out from the photograph rather than hard-coded in CSS
 * per cent. The image is `object-fit: cover`, so what is on screen is a crop
 * whose offset changes with the window; the flower sits at a fixed point of the
 * source file, and the cover geometry is recomputed to find where that point
 * currently lands.
 */

/** Where the flower is in the source picture, as a fraction of it. */
const FLOWER = { x: 0.502, y: 0.371 };

const STARS = 260;

/** Warm white, champagne, and the blush of the flower itself. */
const COLOURS: Array<[number, number, number]> = [
  [255, 252, 244],
  [255, 223, 179],
  [246, 200, 190],
];

type Star = {
  /** Angle and distance from the flower, which is how they radiate. */
  angle: number;
  radius: number;
  speed: number;
  size: number;
  colour: number;
  /** Seconds lived, and the span before it fades out and is born again. */
  age: number;
  life: number;
  /** Twinkle: its own rate and offset, so they do not blink in unison. */
  rate: number;
  phase: number;
};

function makeStar(spread: number, reborn: boolean): Star {
  return {
    angle: Math.random() * Math.PI * 2,
    /*
     * A new star starts on the flower; the first generation is scattered across
     * the whole spread instead, so the effect is already there on the first
     * frame rather than blooming out of nothing while somebody watches.
     */
    radius: reborn ? Math.random() * 14 : Math.random() * spread,
    speed: 5 + Math.random() * 22,
    size: 0.5 + Math.random() * Math.random() * 3.4,
    colour: Math.floor(Math.random() * COLOURS.length),
    age: reborn ? 0 : Math.random() * 4,
    life: 3 + Math.random() * 4.5,
    rate: 1.6 + Math.random() * 3.4,
    phase: Math.random() * Math.PI * 2,
  };
}

/** One soft dot, drawn once and then blitted. */
function sprite(colour: [number, number, number]): HTMLCanvasElement {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const [r, gr, b] = colour;
    grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 1)`);
    grad.addColorStop(0.28, `rgba(${r}, ${gr}, ${b}, 0.55)`);
    grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

export function BannerSparkle() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Hidden on a desktop, and there is nothing here worth setting up for it.
    if (getComputedStyle(canvas).display === 'none') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sprites = COLOURS.map(sprite);

    let width = 0;
    let height = 0;
    let origin = { x: 0, y: 0 };
    let spread = 0;
    let stars: Star[] = [];

    /*
     * Where the flower is on screen right now.
     *
     * The image is `object-fit: cover`: it is scaled by whichever of the two
     * ratios is larger and the overflow is pushed off the edges according to
     * `object-position`. Both of those move when the window does, so the point
     * is recomputed rather than stored.
     */
    const locate = () => {
      const img = canvas.parentElement?.querySelector<HTMLImageElement>('img.mobile-only');
      if (!img || !img.naturalWidth || !img.naturalHeight) {
        origin = { x: width * FLOWER.x, y: height * FLOWER.y };
        return;
      }
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const drawnW = img.naturalWidth * scale;
      const drawnH = img.naturalHeight * scale;
      const position = getComputedStyle(img).objectPosition.split(' ');
      const fraction = (value: string, fallback: number) => {
        const n = Number.parseFloat(value);
        return value?.endsWith('%') && Number.isFinite(n) ? n / 100 : fallback;
      };
      const px = fraction(position[0], 0.5);
      const py = fraction(position[1] ?? '', 0.5);
      origin = {
        x: (width - drawnW) * px + FLOWER.x * drawnW,
        y: (height - drawnH) * py + FLOWER.y * drawnH,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // Capped at 2: a three-times buffer on a large phone is four million
      // pixels of glitter, and nobody can see the difference.
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      locate();
      // Far enough to reach the corners of the frame from the flower.
      spread = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y));
      if (!stars.length) stars = Array.from({ length: STARS }, () => makeStar(spread, false));
    };

    /*
     * A halo on the flower itself, breathing slowly under the stars.
     *
     * Without it the stars read as specks that happen to be denser in one
     * place. The halo is what makes the flower the source they are coming out
     * of, which is the whole idea. It is kept wide and weak - a tenth of an
     * alpha at its centre - because anything stronger is a lens flare sitting
     * on top of a photograph rather than a light inside it.
     */
    let clock = 0;
    const halo = sprite([255, 236, 214]);

    const draw = (step: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      clock += step;
      const breath = 0.72 + 0.28 * Math.sin(clock * 0.9);
      const reach = Math.min(width, height) * 0.62;
      ctx.globalAlpha = 0.13 * breath;
      ctx.drawImage(halo, origin.x - reach / 2, origin.y - reach / 2, reach, reach);
      ctx.globalAlpha = 0.16 * breath;
      ctx.drawImage(halo, origin.x - reach / 5, origin.y - reach / 5, reach * 0.4, reach * 0.4);

      for (const star of stars) {
        star.age += step;
        star.radius += star.speed * step;
        if (star.age > star.life || star.radius > spread) {
          Object.assign(star, makeStar(spread, true));
          continue;
        }
        const t = star.age / star.life;
        // In over the first fifth, out over the last third, twinkling between.
        const envelope = Math.min(1, t / 0.2) * Math.min(1, (1 - t) / 0.34);
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(star.phase + star.age * star.rate));
        const alpha = envelope * twinkle;
        if (alpha <= 0.01) continue;
        const x = origin.x + Math.cos(star.angle) * star.radius;
        const y = origin.y + Math.sin(star.angle) * star.radius;
        const size = star.size * 7;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[star.colour], x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    resize();
    if (!width || !height) return;

    if (still) {
      draw(0);
      return;
    }

    let raf = 0;
    let last = 0;
    let visible = true;
    const frame = (now: number) => {
      // Clamped: coming back to a backgrounded tab hands over a step of many
      // seconds, which would teleport every star to the far corner at once.
      const step = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      draw(step);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = () => (document.hidden ? stop() : start());
    // Off while the banner is scrolled away: the page below it is long.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        visible ? start() : stop();
      },
      { threshold: 0 },
    );
    observer.observe(canvas);
    const onResize = () => {
      stop();
      resize();
      start();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="banner-sparkle" aria-hidden="true" />;
}
