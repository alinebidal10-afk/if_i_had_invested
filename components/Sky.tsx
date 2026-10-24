'use client';
import { useEffect, useRef } from 'react';

const NOTES = ['whitney-1929', 'lithuania-2-litas', 'allentown-1861', 'lithuania-5-cents', 'texas-1841'];
const DIM_LEVEL = 0.55;
const DIM_SECONDS = 0.6;

type Star = { x: number; y: number; r: number; a: number; v: number; twinkle: boolean; period: number; phase: number; tint: string };
type Sprite = { canvas: HTMLCanvasElement; w: number; h: number };
type Note = {
  sprite: Sprite; x0: number; y: number; vy: number; amp: number; per: number; ph: number;
  age: number; rot: number; omega: number; flip: boolean; fper: number; fph: number; alpha: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// One fixed canvas behind everything: stars, and a few tiny banknotes raining down.
// `dim` eases the whole sky to 55% while the graph plays.
export default function Sky({ dim }: { dim: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dimTarget = useRef(dim);
  dimTarget.current = dim;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dpr = 1;
    let w = 0;
    let h = 0;
    let phone = false;
    let stars: Star[] = [];
    let sprites: Sprite[][] = [];
    let notes: Note[] = [];
    let spawnIn = 1.2;
    let clock = 0;
    let raf = 0;
    let last = 0;
    let alive = true;
    // dim tween: from -> to over DIM_SECONDS
    let dimFrom = 1;
    let dimTo = 1;
    let dimStart = 0;
    let dimNow = 1;
    let dimSeen = dimTarget.current;
    if (dimSeen) {
      dimFrom = dimTo = dimNow = DIM_LEVEL;
    }
    const images: HTMLImageElement[] = [];

    const buildStars = () => {
      const count = Math.min(220, Math.max(60, Math.round((w * h) / 9000)));
      const tinted = new Set([Math.floor(Math.random() * count), Math.floor(Math.random() * count)]);
      stars = Array.from({ length: count }, (_, i) => {
        const size = Math.pow(Math.random(), 3); // most are tiny, a few are bright
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.4 + size * 1,
          a: 0.25 + size * 0.65 + Math.random() * 0.1,
          v: size * 4,
          twinkle: Math.random() < 0.3,
          period: rand(2, 6),
          phase: Math.random() * Math.PI * 2,
          tint: tinted.has(i) ? (Math.random() < 0.5 ? '255,226,176' : '170,200,255') : '255,255,255',
        };
      });
    };

    // Each banknote is scaled once, to the few sizes it is drawn at, never per frame.
    const buildSprites = () => {
      const widths = phone ? [18, 24, 30] : [22, 31, 40];
      sprites = images.map((img) =>
        widths.map((sw) => {
          const sh = Math.round((sw * img.naturalHeight) / img.naturalWidth);
          const c = document.createElement('canvas');
          c.width = Math.round(sw * dpr);
          c.height = Math.round(sh * dpr);
          c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
          return { canvas: c, w: sw, h: sh };
        }),
      );
    };

    const spawn = (y?: number) => {
      if (!sprites.length) return;
      const set = sprites[Math.floor(Math.random() * sprites.length)];
      const sprite = set[Math.floor(Math.random() * set.length)];
      notes.push({
        sprite,
        x0: rand(sprite.w, Math.max(sprite.w + 1, w - sprite.w)),
        y: y ?? -sprite.h,
        vy: rand(14, 30),
        amp: rand(6, 14),
        per: rand(4, 8),
        ph: Math.random() * Math.PI * 2,
        age: 0,
        rot: rand(-0.6, 0.6),
        omega: (rand(-25, 25) * Math.PI) / 180,
        flip: Math.random() < 0.4,
        fper: rand(5, 11),
        fph: Math.random() * Math.PI * 2,
        alpha: rand(0.1, 0.22),
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      phone = w < 640;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
      seedNotes();
      if (still) draw();
    };

    // A few notes already mid-fall so the sky is never empty on load.
    const seedNotes = () => {
      if (still || !images.length) return;
      buildSprites();
      notes = [];
      const n = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) spawn(rand(h * 0.15, h * 0.7));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        let a = s.a;
        if (s.twinkle && !still) a *= 0.65 + 0.35 * Math.sin((clock / s.period) * Math.PI * 2 + s.phase);
        ctx.globalAlpha = a * dimNow;
        ctx.fillStyle = `rgb(${s.tint})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const n of notes) {
        const cx = n.x0 + n.amp * Math.sin((n.age / n.per) * Math.PI * 2 + n.ph);
        ctx.save();
        ctx.globalAlpha = n.alpha * dimNow;
        ctx.translate(cx, n.y + n.sprite.h / 2);
        ctx.rotate(n.rot);
        if (n.flip) ctx.scale(Math.cos(n.fph + (n.age / n.fper) * Math.PI * 2), 1);
        ctx.drawImage(n.sprite.canvas, -n.sprite.w / 2, -n.sprite.h / 2, n.sprite.w, n.sprite.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (t: number) => {
      raf = 0;
      if (!alive || document.hidden) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      clock += dt;

      if (dimTarget.current !== dimSeen) {
        dimSeen = dimTarget.current;
        dimFrom = dimNow;
        dimTo = dimSeen ? DIM_LEVEL : 1;
        dimStart = clock;
      }
      dimNow = dimFrom + (dimTo - dimFrom) * easeOut(Math.min(1, (clock - dimStart) / DIM_SECONDS));

      for (const s of stars) {
        s.x -= s.v * dt * 0.8;
        s.y += s.v * dt * 0.4;
        if (s.x < -2) s.x = w + 2;
        if (s.y > h + 2) s.y = -2;
      }
      spawnIn -= dt;
      if (spawnIn <= 0) {
        if (notes.length < (phone ? 7 : 14)) spawn();
        spawnIn = rand(0.9, 2.2);
      }
      for (const n of notes) {
        n.age += dt;
        n.y += n.vy * dt;
        n.rot += n.omega * dt;
      }
      notes = notes.filter((n) => n.y < h + n.sprite.h);

      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (still || raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else start();
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    start();

    // Banknotes join once their pictures have loaded.
    if (!still) {
      let pending = NOTES.length;
      NOTES.forEach((name) => {
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          images.push(img);
          if (--pending === 0) seedNotes();
        };
        img.onerror = () => {
          if (--pending === 0) seedNotes();
        };
        img.src = `/money/${name}.jpg`;
      });
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Reduced motion draws one still frame, so a change of dim has to repaint it.
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.style.opacity = String(dim ? DIM_LEVEL : 1);
  }, [dim]);

  return (
    <div className="sky" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
