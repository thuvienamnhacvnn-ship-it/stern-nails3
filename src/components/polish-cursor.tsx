'use client';

import { useEffect } from 'react';

/**
 * The pointer: a polish brush, with petals following it.
 *
 * Everything is drawn on one canvas above the page — the native cursor is
 * hidden and this takes its place. That has to be earned back carefully, so:
 *
 *  - it only starts once a mouse has actually moved. A touch screen, a keyboard
 *    user and a headless browser taking screenshots never see any of it, and
 *    the native cursor is never hidden for them;
 *  - over a field you type into, the class comes straight back off and the real
 *    I-beam and caret return. A text field with no caret is a broken text
 *    field, however pretty the brush is;
 *  - `prefers-reduced-motion` turns the whole thing off rather than slowing it
 *    down. Something chasing the pointer is exactly what that setting is for;
 *  - the loop stops when the pointer stops. The last frame stays on the canvas,
 *    so the brush is still there — it simply is not being redrawn sixty times a
 *    second at rest.
 */

const PETALS = 7;
const TEXTY =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]';

/* The brush tip works through the brand's own colours rather than the whole
   spectrum: blush, rose, gold, sage. A rainbow would belong to some other
   studio. */
const TIP_COLOURS = [
  [16, 46, 80],
  [4, 52, 76],
  [36, 62, 72],
  [88, 16, 60],
];

type Petal = { x: number; y: number; angle: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; size: number; hue: number };

export function PolishCursor() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    const canvas = document.createElement('canvas');
    canvas.className = 'polish-cursor';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    document.body.appendChild(canvas);

    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();

    const pointer = { x: -200, y: -200, seen: false };
    const trail: Petal[] = Array.from({ length: PETALS }, () => ({ x: -200, y: -200, angle: 0 }));
    const sparks: Spark[] = [];
    let frame = 0;
    let idleMs = 0;
    let lastAt = 0;
    let running = false;

    /** One petal of the mark, drawn at the origin, pointing up. */
    const petalPath = (size: number) => {
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.78, -size * 0.55, size * 0.6, size * 0.6, 0, size);
      ctx.bezierCurveTo(-size * 0.6, size * 0.6, -size * 0.78, -size * 0.55, 0, -size);
      ctx.closePath();
    };

    /* Walks the four brand tips over about twelve seconds, so the brush is
       never quite the colour it was a moment ago. */
    const tipColour = (time: number, alpha: number) => {
      const span = 3200;
      const at = (time / span) % TIP_COLOURS.length;
      const from = TIP_COLOURS[Math.floor(at)];
      const to = TIP_COLOURS[(Math.floor(at) + 1) % TIP_COLOURS.length];
      const k = at - Math.floor(at);
      const hue = from[0] + (to[0] - from[0]) * k;
      const sat = from[1] + (to[1] - from[1]) * k;
      const light = from[2] + (to[2] - from[2]) * k;
      return `hsl(${hue} ${sat}% ${light}% / ${alpha})`;
    };

    /*
     * The brush, drawn with the point of it at the origin.
     *
     * That is the whole geometry: the tip end is at (0, 0) and the bristles,
     * the collar and the handle run away from it down the local +y axis, so
     * after the translate below the painted point sits exactly on the pointer
     * and everything else trails behind it — the way an arrow cursor does.
     *
     * Drawn the other way round, with the handle at the origin, the visible
     * point lands some twenty pixels off the real one. It looks like a brush
     * plugged in backwards, and worse, you aim with the tip and the click
     * lands somewhere else: menu items simply stop responding.
     */
    const drawBrush = (time: number) => {
      ctx.save();
      ctx.translate(pointer.x, pointer.y);
      /* Leaning the way a cursor leans: the point at the top left, the handle
         falling away to the bottom right, clear of what is being read. */
      ctx.rotate(-0.46);

      // The bristles, loaded with colour, tapering to the point.
      ctx.fillStyle = tipColour(time, 0.96);
      ctx.beginPath();
      ctx.moveTo(-5.4, 26.5);
      ctx.quadraticCurveTo(-4.6, 8, 0, 0);
      ctx.quadraticCurveTo(4.6, 8, 5.4, 26.5);
      ctx.closePath();
      ctx.fill();

      // A wet highlight down one side of them.
      ctx.fillStyle = 'rgb(255 255 255 / 0.34)';
      ctx.beginPath();
      ctx.moveTo(-3, 24);
      ctx.quadraticCurveTo(-2.4, 9, -0.6, 4.5);
      ctx.quadraticCurveTo(-0.3, 11, -0.9, 24);
      ctx.closePath();
      ctx.fill();

      // The collar.
      ctx.fillStyle = 'rgb(215 179 124 / 0.95)';
      ctx.beginPath();
      ctx.roundRect(-5.6, 25, 11.2, 6.5, 2.2);
      ctx.fill();

      // The handle.
      ctx.fillStyle = 'rgb(28 34 24 / 0.94)';
      ctx.beginPath();
      ctx.roundRect(-4.4, 31, 8.8, 27, 4.4);
      ctx.fill();
      // One stripe of gloss along it, so it reads as lacquer and not as a stick.
      ctx.fillStyle = 'rgb(255 255 255 / 0.18)';
      ctx.beginPath();
      ctx.roundRect(-2.6, 34, 2.2, 20, 1.1);
      ctx.fill();

      ctx.restore();

      // The glow the loaded brush throws on the page under its point.
      const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 22);
      glow.addColorStop(0, tipColour(time, 0.32));
      glow.addColorStop(1, tipColour(time, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 22, 0, Math.PI * 2);
      ctx.fill();
    };

    const step = (now: number) => {
      const delta = Math.min(48, now - (lastAt || now));
      lastAt = now;
      idleMs += delta;
      ctx.clearRect(0, 0, width, height);

      // Each petal chases the one in front of it, and the first chases the
      // pointer. That lag is what makes it read as following rather than as a
      // shape stuck to the cursor.
      let leadX = pointer.x;
      let leadY = pointer.y;
      for (let i = 0; i < trail.length; i += 1) {
        const petal = trail[i];
        const ease = 0.21 - i * 0.014;
        const dx = leadX - petal.x;
        const dy = leadY - petal.y;
        petal.x += dx * ease;
        petal.y += dy * ease;
        if (Math.abs(dx) + Math.abs(dy) > 0.6) petal.angle = Math.atan2(dy, dx) + Math.PI / 2;
        leadX = petal.x;
        leadY = petal.y;

        const fade = 1 - i / trail.length;
        const size = 5 + fade * 6.5;
        ctx.save();
        ctx.translate(petal.x, petal.y);
        ctx.rotate(petal.angle + Math.sin(now / 520 + i) * 0.22);
        petalPath(size);
        // Blush and sage alternate, the way the mark does.
        ctx.fillStyle =
          i % 2 === 0
            ? `rgb(230 190 178 / ${(fade * 0.72).toFixed(3)})`
            : `rgb(142 154 128 / ${(fade * 0.66).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life -= delta / 620;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        spark.x += spark.vx * (delta / 16);
        spark.y += spark.vy * (delta / 16);
        spark.vy += delta / 900;
        const size = spark.size * spark.life;
        ctx.save();
        ctx.translate(spark.x, spark.y);
        ctx.rotate(now / 700 + i);
        ctx.fillStyle = `hsl(${spark.hue} 70% 82% / ${spark.life.toFixed(3)})`;
        // A four-pointed star, not a dot: it reads as a glint at this size.
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.quadraticCurveTo(0, 0, size, 0);
        ctx.quadraticCurveTo(0, 0, 0, size);
        ctx.quadraticCurveTo(0, 0, -size, 0);
        ctx.quadraticCurveTo(0, 0, 0, -size);
        ctx.fill();
        ctx.restore();
      }

      if (pointer.seen) drawBrush(now);

      // Nothing has moved for a while and the glints have gone out: leave the
      // last frame up and stop burning a frame budget on a still picture.
      if (idleMs > 2200 && sparks.length === 0) {
        running = false;
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastAt = 0;
      frame = requestAnimationFrame(step);
    };

    const addSpark = (x: number, y: number, spread: number, speed: number) => {
      const angle = Math.random() * Math.PI * 2;
      sparks.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        life: 1,
        size: 2.4 + Math.random() * 2.6,
        hue: 20 + Math.random() * 60,
      });
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const overText = event.target instanceof Element && event.target.closest(TEXTY) !== null;
      root.classList.toggle('has-polish-cursor', !overText);
      canvas.style.opacity = overText ? '0' : '1';
      if (overText) return;

      const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!pointer.seen) {
        pointer.seen = true;
        for (const petal of trail) {
          petal.x = event.clientX;
          petal.y = event.clientY;
        }
      }
      if (moved > 14 && Math.random() < 0.34) addSpark(event.clientX, event.clientY, 18, 0.5);
      idleMs = 0;
      start();
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !pointer.seen) return;
      for (let i = 0; i < 7; i += 1) addSpark(event.clientX, event.clientY, 6, 1.5);
      idleMs = 0;
      start();
    };

    const hide = () => {
      root.classList.remove('has-polish-cursor');
      canvas.style.opacity = '0';
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('blur', hide);
    document.addEventListener('pointerleave', hide);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('blur', hide);
      document.removeEventListener('pointerleave', hide);
      if (frame) cancelAnimationFrame(frame);
      root.classList.remove('has-polish-cursor');
      canvas.remove();
    };
  }, []);

  return null;
}
