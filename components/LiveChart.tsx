'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { axisMoney, axisPct, mergeTicks, niceTicks, pruneTicks, tagMoney, tagPct, timeTicks, type Entry } from '../lib/ticks';
import { lastAt, lineSeries, valueAt } from '../lib/series';
import type { Point } from '../lib/types';

export type Unit = 'value' | 'pct';
export type Line = { symbol: string; color: string; buy: number; buyT: number; now: number; points: Point[] };

type Props = {
  lines: Line[];
  amount: number;
  unit: Unit;
  hoverT: number | null;
  onHover: (t: number | null) => void;
  phase: 'baseline' | 'play'; // baseline: only the start dot; play: the lines
  startLabel: string; // "$100 · Jan 3, 2000"
  loading: boolean;
  progress: RefObject<number>; // the playhead, 0..1 of the span; read every frame, never through React state
  tEnd: number; // the end of the span: "today"
  endLabel?: string; // what the big date says at the end, when "today" is a fixed date
  leader?: string | null; // in a race, the line that is ahead is drawn a little stronger
  marks?: { t: number; symbol: string }[]; // where the lead changed hands: a ring on the new leader's line
  // Every drawn frame: each line's value at the crosshair, exactly as its tag shows it. For numbers outside the
  // chart that must never disagree with it (story mode writes its big number from here).
  onFrame?: (t: number, values: Record<string, number>) => void;
};

type Series = { symbol: string; color: string; buyT: number; pts: { t: number; v: number }[]; cmin: number[]; cmax: number[] };
type XTick = Entry<{ key: number; label: string }>; // key is the time
type YTick = Entry<{ key: number; label: string }>; // key is the value

const DAY = 864e5;
const NO_MARKS: { t: number; symbol: string }[] = [];
const TAG_H = 22; // price tags never sit closer than this
const FADE_MS = 150;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Black or white text, whichever reads on this line colour.
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? '#000' : '#fff';
}

// "Mar 2004" as two parts, or "Mar 14, 2004" when the whole span is under two years.
function dateParts(t: number, span: number): { mo: string; yr: string } {
  const d = new Date(t);
  const mo = span < 2 * 365.25 * DAY ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()},` : MONTHS[d.getUTCMonth()];
  return { mo, yr: String(d.getUTCFullYear()) };
}

// The x window: the whole history up to the playhead, never narrower than a few weeks.
const minWindow = (span: number) => Math.min(span, Math.max(span * 0.03, 30 * DAY));

type Pad = { top: number; right: number; bottom: number; left: number };

export default function LiveChart({ lines, amount, unit, hoverT, onHover, phase, startLabel, loading, progress, tEnd, endLabel = 'Today', leader = null, marks = NO_MARKS, onFrame }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ticks, setTicks] = useState<{ x: XTick[]; y: YTick[] }>({ x: [], y: [] });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const narrow = size.w < 520;
  const pad: Pad = narrow ? { top: 10, right: 78, bottom: 40, left: 46 } : { top: 12, right: 96, bottom: 44, left: 64 };
  const t0 = lines.length ? Math.min(...lines.map((l) => l.buyT)) : 0;

  // Every line in the units being shown, with a running min and max so "the highest value so far" is one lookup.
  const series = useMemo<Series[]>(
    () =>
      lines.map((l) => {
        const pts = lineSeries(l, amount, unit, tEnd);
        let lo = Infinity;
        let hi = -Infinity;
        const cmin: number[] = [];
        const cmax: number[] = [];
        for (const p of pts) {
          lo = Math.min(lo, p.v);
          hi = Math.max(hi, p.v);
          cmin.push(lo);
          cmax.push(hi);
        }
        return { symbol: l.symbol, color: l.color, buyT: l.buyT, pts, cmin, cmax };
      }),
    [lines, amount, unit, tEnd],
  );

  // ── the frame loop: everything that moves is written straight to the DOM, never through React state ──
  const els = useRef({
    paths: new Map<string, SVGPathElement>(),
    tips: new Map<string, SVGGElement>(),
    tags: new Map<string, HTMLDivElement>(),
    marks: new Map<number, SVGGElement>(),
    xt: new Map<number, SVGGElement>(),
    yt: new Map<number, SVGGElement>(),
    hair: null as SVGLineElement | null,
    base: null as SVGGElement | null,
    dateTag: null as HTMLDivElement | null,
    mo: null as HTMLSpanElement | null,
    yr: null as HTMLSpanElement | null,
  });
  const st = useRef({
    lo: 0,
    hi: 1,
    init: false,
    unit,
    lastP: 0,
    sig: '',
    tick: { at: 0, xEnd: 0, lo: 0, hi: 1, forced: true },
    year: '',
    cost: 0,
    frames: 0,
    logged: false,
    X: (t: number) => t,
    Y: (v: number) => v,
  });
  const live = useRef({ series, t0, tEnd, unit, amount, w: size.w, h: size.h, pad, hoverT, narrow, endLabel, marks, onFrame, ver: 0 });
  live.current = { series, t0, tEnd, unit, amount, w: size.w, h: size.h, pad, hoverT, narrow, endLabel, marks, onFrame, ver: live.current.ver + 1 };
  const frameRef = useRef(() => {});

  function place(g: SVGGElement, axis: 'x' | 'y', v: number) {
    const L = live.current;
    const S = st.current;
    if (axis === 'x') {
      const x = S.X(v);
      g.style.visibility = x < L.pad.left - 1 || x > L.w - L.pad.right + 1 ? 'hidden' : 'visible';
      g.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
    } else {
      const y = S.Y(v);
      g.style.visibility = y < L.pad.top - 1 || y > L.h - L.pad.bottom + 1 ? 'hidden' : 'visible';
      g.setAttribute('transform', `translate(0 ${y.toFixed(1)})`);
    }
  }

  frameRef.current = () => {
    const L = live.current;
    const E = els.current;
    const S = st.current;
    if (!L.series.length || L.w <= 0 || L.h <= 0) return;
    const began = performance.now();

    const span = Math.max(1, L.tEnd - L.t0);
    const p = progress.current ?? 0;
    const tPlay = L.t0 + p * span;
    const tc = L.hoverT !== null ? Math.min(L.hoverT, tPlay) : tPlay; // where the crosshair is
    const ended = p >= 1;
    const xEnd = L.t0 + Math.max(tPlay - L.t0, minWindow(span));

    // Y: fit the highest and lowest values reached so far, 12% of air, and never tighter than 20% of the midpoint.
    let lo = Infinity;
    let hi = -Infinity;
    const idx = L.series.map((s) => lastAt(s.pts, tPlay));
    L.series.forEach((s, k) => {
      const i = idx[k];
      if (i < 0) return;
      const head = valueAt(s.pts, i, tPlay);
      lo = Math.min(lo, s.cmin[i], head);
      hi = Math.max(hi, s.cmax[i], head);
    });
    if (!Number.isFinite(lo)) {
      lo = L.unit === 'value' ? L.amount * 0.9 : -10;
      hi = L.unit === 'value' ? L.amount * 1.1 : 10;
    }
    const air = (hi - lo) * 0.12;
    lo -= air;
    hi += air;
    const minRange = L.unit === 'value' ? Math.abs((lo + hi) / 2) * 0.2 : 20;
    if (hi - lo < minRange) {
      const mid = (lo + hi) / 2;
      lo = mid - minRange / 2;
      hi = mid + minRange / 2;
    }

    // Grow at once (an easing growth lets the line poke out of the plot for a few frames, which on a
    // short phone chart lands in the date above), shrink slowly; snap on a new run, a rewind, or a change of units.
    if (!S.init || S.unit !== L.unit || p < S.lastP) {
      S.lo = lo;
      S.hi = hi;
      S.init = true;
      S.unit = L.unit;
    } else {
      S.lo = lo < S.lo ? lo : S.lo + (lo - S.lo) * 0.05;
      S.hi = hi > S.hi ? hi : S.hi + (hi - S.hi) * 0.05;
      const eps = (hi - lo) * 1e-4;
      if (Math.abs(lo - S.lo) < eps) S.lo = lo;
      if (Math.abs(hi - S.hi) < eps) S.hi = hi;
    }
    S.lastP = p;

    // Nothing moved and nothing changed: leave the DOM alone.
    const sig = `${p}|${tc}|${S.lo}|${S.hi}|${L.w}|${L.h}|${L.ver}`;
    if (S.sig === sig && !S.tick.forced && E.paths.size === L.series.length) return;
    S.sig = sig;

    const iw = L.w - L.pad.left - L.pad.right;
    const ih = L.h - L.pad.top - L.pad.bottom;
    const X = (t: number) => L.pad.left + ((t - L.t0) / (xEnd - L.t0 || 1)) * iw;
    const Y = (v: number) => L.pad.top + (1 - (v - S.lo) / (S.hi - S.lo || 1)) * ih;
    S.X = X;
    S.Y = Y;

    // Lines, tips, price tags.
    const tagYs: { sym: string; y: number }[] = [];
    const vals: Record<string, number> = {};
    L.series.forEach((s, k) => {
      const i = idx[k];
      const path = E.paths.get(s.symbol);
      if (path) {
        if (i < 0) path.setAttribute('d', '');
        else {
          let d = '';
          for (let j = 0; j <= i; j++) d += `${j ? 'L' : 'M'}${X(s.pts[j].t).toFixed(1)} ${Y(s.pts[j].v).toFixed(1)}`;
          if (tPlay > s.pts[i].t) d += `L${X(tPlay).toFixed(1)} ${Y(valueAt(s.pts, i, tPlay)).toFixed(1)}`;
          path.setAttribute('d', d);
        }
      }
      const ci = lastAt(s.pts, tc);
      const tip = E.tips.get(s.symbol);
      const tag = E.tags.get(s.symbol);
      if (ci < 0) {
        if (tip) tip.style.visibility = 'hidden';
        if (tag) tag.style.visibility = 'hidden';
        return;
      }
      const v = valueAt(s.pts, ci, tc);
      vals[s.symbol] = v;
      const y = Y(v);
      if (tip) {
        tip.style.visibility = 'visible';
        tip.setAttribute('transform', `translate(${X(tc).toFixed(1)} ${y.toFixed(1)})`);
      }
      if (tag) {
        const txt = L.unit === 'value' ? tagMoney(v) : tagPct(v);
        if (tag.textContent !== txt) tag.textContent = txt;
        tag.style.visibility = 'visible';
        tagYs.push({ sym: s.symbol, y: Math.min(L.pad.top + ih - TAG_H / 2, Math.max(L.pad.top + TAG_H / 2, y)) });
      }
    });
    L.onFrame?.(tc, vals);

    // Tags that would overlap are nudged apart, keeping their order by value.
    tagYs.sort((a, b) => a.y - b.y);
    for (let i = 1; i < tagYs.length; i++) tagYs[i].y = Math.max(tagYs[i].y, tagYs[i - 1].y + TAG_H);
    const floor = L.pad.top + ih - TAG_H / 2;
    for (let i = tagYs.length - 1; i >= 0; i--) tagYs[i].y = Math.min(tagYs[i].y, floor - (tagYs.length - 1 - i) * TAG_H);
    for (const t of tagYs) {
      const el = E.tags.get(t.sym);
      if (el) el.style.transform = `translate(${L.w - L.pad.right + 8}px, ${(t.y - TAG_H / 2).toFixed(1)}px)`;
    }

    // Lead changes: a ring where the new leader's line was at that moment, once the playhead has passed it.
    L.marks.forEach((m, k) => {
      const g = E.marks.get(k);
      const s = L.series.find((x) => x.symbol === m.symbol);
      const i = s ? lastAt(s.pts, m.t) : -1;
      if (!g) return;
      if (!s || i < 0 || m.t > tPlay) {
        g.style.visibility = 'hidden';
        return;
      }
      g.style.visibility = 'visible';
      g.setAttribute('transform', `translate(${X(m.t).toFixed(1)} ${Y(valueAt(s.pts, i, m.t)).toFixed(1)})`);
    });

    // Crosshair: the hairline, and the date tag directly under it.
    const cx = X(tc);
    if (E.hair) {
      E.hair.setAttribute('x1', cx.toFixed(1));
      E.hair.setAttribute('x2', cx.toFixed(1));
    }
    const { mo, yr } = dateParts(tc, span);
    if (E.dateTag) {
      const txt = `${mo} ${yr}`;
      if (E.dateTag.textContent !== txt) E.dateTag.textContent = txt;
      const w = txt.length * 8.3 + 20;
      const left = Math.min(L.w - w, Math.max(0, cx - w / 2));
      E.dateTag.style.transform = `translate(${left.toFixed(1)}px, ${L.pad.top + ih + 8}px)`;
    }

    // The big date above the plot: the playhead, the hovered day, or "Today" (or the frozen end date).
    const showToday = ended && L.hoverT === null;
    const moTxt = showToday ? L.endLabel : mo;
    const yrTxt = showToday ? '' : yr;
    if (E.mo && E.mo.textContent !== moTxt) E.mo.textContent = moTxt;
    if (E.yr && E.yr.textContent !== yrTxt) {
      E.yr.textContent = yrTxt;
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (S.year && yrTxt && L.hoverT === null && !calm) E.yr.animate([{ background: 'rgba(255, 255, 255, 0.10)' }, { background: 'rgba(255, 255, 255, 0)' }], { duration: 250, easing: 'ease-out' });
    }
    S.year = yrTxt;

    // The invested amount, when it is on screen.
    const baseV = L.unit === 'value' ? L.amount : 0;
    if (E.base) {
      const inside = baseV >= S.lo && baseV <= S.hi;
      E.base.style.visibility = inside ? 'visible' : 'hidden';
      if (inside) E.base.setAttribute('transform', `translate(0 ${Y(baseV).toFixed(1)})`);
    }

    // Ticks: the set is re-chosen only when a domain has moved 2% (and at most 10 times a second); positions follow every frame.
    const T = S.tick;
    const yRange = T.hi - T.lo || 1;
    const moved = Math.abs(xEnd - T.xEnd) / (T.xEnd - L.t0 || 1) > 0.02 || Math.abs(S.lo - T.lo) / yRange > 0.02 || Math.abs(S.hi - T.hi) / yRange > 0.02;
    if (T.forced || (moved && began - T.at >= 100)) {
      T.at = began;
      T.xEnd = xEnd;
      T.lo = S.lo;
      T.hi = S.hi;
      T.forced = false;
      const nx = timeTicks(L.t0, xEnd, L.narrow ? 4 : 7).map((t) => ({ key: t.t, label: t.label }));
      const ny = niceTicks(S.lo, S.hi, L.narrow ? 3 : 4).map((v) => ({ key: v, label: L.unit === 'value' ? axisMoney(v) : axisPct(v) }));
      setTicks((prev) => ({ x: mergeTicks(prev.x, nx, began), y: mergeTicks(prev.y, ny, began) }));
    }
    for (const [t, g] of E.xt) place(g, 'x', t);
    for (const [v, g] of E.yt) place(g, 'y', v);

    // Frame cost, logged once per playback in development.
    if (!ended) {
      S.logged = false;
      S.cost += performance.now() - began;
      S.frames++;
    } else if (!S.logged && S.frames > 0) {
      S.logged = true;
      if (process.env.NODE_ENV !== 'production') console.info(`[terra] chart frame cost: ${(S.cost / S.frames).toFixed(2)} ms average over ${S.frames} frames`);
      S.cost = 0;
      S.frames = 0;
    }
  };

  // Tick elements that just mounted take their place before they are ever painted.
  useLayoutEffect(() => {
    for (const [t, g] of els.current.xt) place(g, 'x', t);
    for (const [v, g] of els.current.yt) place(g, 'y', v);
  }, [ticks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ticks that have finished fading out leave the DOM, each on its own clock.
  useEffect(() => {
    const leaving = [...ticks.x, ...ticks.y].filter((t) => t.leaving);
    if (!leaving.length) return;
    const due = Math.min(...leaving.map((t) => t.since ?? 0)) + FADE_MS;
    const id = setTimeout(() => setTicks((p) => ({ x: pruneTicks(p.x, performance.now(), FADE_MS), y: pruneTicks(p.y, performance.now(), FADE_MS) })), Math.max(0, due - performance.now()) + 5);
    return () => clearTimeout(id);
  }, [ticks]);

  // A different chart: the camera and the tick set start over.
  useEffect(() => {
    st.current.init = false;
    st.current.tick.forced = true;
    st.current.sig = '';
  }, [unit, lines.length, tEnd, phase]);

  const active = phase === 'play' && series.length > 0;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      frameRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const move = (e: React.PointerEvent) => {
    if (!active) return;
    const r = e.currentTarget.getBoundingClientRect();
    const span = Math.max(1, tEnd - t0);
    const tPlay = t0 + (progress.current ?? 1) * span;
    const xEnd = t0 + Math.max(tPlay - t0, minWindow(span));
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left - pad.left) / (size.w - pad.left - pad.right)));
    onHover(Math.min(t0 + frac * (xEnd - t0), tPlay)); // the future has not been drawn yet
  };

  const ink = useMemo(() => Object.fromEntries(lines.map((l) => [l.symbol, inkOn(l.color)])), [lines]);
  const yStart = size.h * 0.6; // before any prices arrive the baseline rests a little below the middle

  return (
    <div className="chart">
      <p className="datebig">
        <span ref={(el) => void (els.current.mo = el)} className="mo" />
        <span className="gap"> </span>
        <span ref={(el) => void (els.current.yr = el)} className="yr" />
      </p>
      <div ref={box} className="plot">
        {size.w > 0 && (
          <svg width={size.w} height={size.h} onPointerMove={move} onPointerLeave={() => onHover(null)} role="img" aria-label="Value of each investment over time">
            <defs>
              <clipPath id="plotclip">
                <rect x={pad.left} y={pad.top - 4} width={Math.max(0, size.w - pad.left - pad.right)} height={Math.max(0, size.h - pad.top - pad.bottom + 8)} />
              </clipPath>
            </defs>

            {phase === 'baseline' && (
              <g className="start" style={{ transform: `translateY(${yStart}px)` }}>
                <path className="baseline" pathLength={1} d={`M${pad.left} 0H${size.w - pad.right}`} />
                <text x={pad.left} y={-16} className="startlabel">
                  {startLabel}
                </text>
                {loading && (
                  <text x={pad.left} y={30} className="axis">
                    Loading prices…
                  </text>
                )}
                <g transform={`translate(${pad.left + 2} 0)`}>
                  {loading && <circle className="ping" r="5" fill="var(--ink)" />}
                  <circle className="startdot" r="4" fill="var(--ink)" />
                </g>
              </g>
            )}

            {active && (
              <>
                {ticks.x.map((t) => (
                  <g key={t.key} className={`tick${t.leaving ? ' leaving' : ''}`} ref={(el) => void (el ? els.current.xt.set(t.key, el) : els.current.xt.delete(t.key))}>
                    <line className="grid" x1="0" x2="0" y1={pad.top} y2={size.h - pad.bottom} />
                    <text className="tl" y={size.h - pad.bottom + 20} textAnchor="middle">
                      {t.label}
                    </text>
                  </g>
                ))}
                {ticks.y.map((t) => (
                  <g key={t.key} className={`tick${t.leaving ? ' leaving' : ''}`} ref={(el) => void (el ? els.current.yt.set(t.key, el) : els.current.yt.delete(t.key))}>
                    <line className="grid" x1={pad.left} x2={size.w - pad.right} y1="0" y2="0" />
                    <text className="tl" x={pad.left - 10} y="4" textAnchor="end">
                      {t.label}
                    </text>
                  </g>
                ))}

                <g ref={(el) => void (els.current.base = el)} className="invested">
                  <line x1={pad.left} x2={size.w - pad.right} y1="0" y2="0" />
                  <text x={pad.left + 6} y="-6">
                    invested
                  </text>
                </g>

                <line ref={(el) => void (els.current.hair = el)} className="hair" y1={pad.top} y2={size.h - pad.bottom} />

                <g clipPath="url(#plotclip)">
                  {series.map((s) => (
                    <path
                      key={s.symbol}
                      ref={(el) => void (el ? els.current.paths.set(s.symbol, el) : els.current.paths.delete(s.symbol))}
                      className={leader ? (s.symbol === leader ? 'draw lead' : 'draw behind') : 'draw'}
                      stroke={s.color}
                    />
                  ))}
                  {marks.map((m, k) => (
                    <g key={k} className="mark" ref={(el) => void (el ? els.current.marks.set(k, el) : els.current.marks.delete(k))} style={{ visibility: 'hidden' }}>
                      <circle r="8" stroke={series.find((x) => x.symbol === m.symbol)?.color ?? '#fff'} />
                    </g>
                  ))}
                </g>
                {series.map((s) => (
                  <g key={s.symbol} className="tip" ref={(el) => void (el ? els.current.tips.set(s.symbol, el) : els.current.tips.delete(s.symbol))}>
                    <circle className="ping" r="5" fill={s.color} />
                    <circle r="4" fill={s.color} />
                  </g>
                ))}
              </>
            )}
          </svg>
        )}
        {active && size.w > 0 && (
          <div className="tags" aria-hidden="true">
            <div ref={(el) => void (els.current.dateTag = el)} className="tag date" />
            {series.map((s) => (
              <div key={s.symbol} ref={(el) => void (el ? els.current.tags.set(s.symbol, el) : els.current.tags.delete(s.symbol))} className="tag price" style={{ background: s.color, color: ink[s.symbol] }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
