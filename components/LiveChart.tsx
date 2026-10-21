'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { pctChange, valueNow } from '../lib/calc';
import { axisMoney, axisPct, mergeTicks, niceTicks, pruneTicks, tagMoney, tagPct, timeTicks, type Entry } from '../lib/ticks';

export type Unit = 'value' | 'pct';
export type Line = {symbol: string; color: string; buy: number; buyT: number; now: number; points: Point[] };

type Props = {
    lines: Line[];
    amount: number;
    unit: Unit;
    hoverT: number | null;
    onHover: (t: number | null) => void;
    phase: 'baseline' | 'play'; //baseline: only the start dot; play: the lines
    startlabel: string; // "$100 · Jan 3, 2000"
    loading: boolean;
    progress: RefObject<number>; // the playhead, 0.1 of the span; read every frame, never through React state
    tEnd: number; // the end of the span: "today"
};

type Series = { symbol: string; color: string; buyT: number; pts: { t: number; v: number }[]; cmin: number[] }
type XTick = Entry<{ key: number; label: string }>; // key is the time
type YTick = Entry<{ key: number; label: string}>; //key is the value

const DAY = 864e5
const MAX_POINTS = 500;
const TAG_H = 22; // price tags never sit closer than this
const FADE_MS = 150;
const MONTHS = ['Jan', 'Feb',  'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function thin(pts: Point[]): Point[] {
    if (pts.length <= MAX_POINTS) return pts; 
    const step = Math.ceil(pts.length / MAX_POINTS);
    const out = pts.filter((_,i) => i % step === 0);
    if (out[out.length -1] !== pts[pts.length -1]) out.push(pts[pts.length - 1]);
    return out;
}

 // The last point at or before t, or -1 if the line has not started yet.
 function lastAt(pts: { t: number }[], t: number): number {
    if (!pts.length || pts[0].t > t) return -1;
    let lo = 0
    let hi = pts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (pts[mid].t <= t) lo = mid;
        else hi = mid - 1;
    }
    return lo;
 }

 // The value on a line at time t, easing toward the next point.
 function valueAt(pts: { t: number; v: numbe }[], i: number, t: number): number {
    const a = pts[i];
    const b = pts[i + 1];
    return b && b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : a.v;
 }

 // Black or white text, whichever reads on this line colour.
 function inkOn(hex: string): string{
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n § 255)) / 255;
    return lum > 0.55 ? '#000' : '#fff';
 } 

// "Mar 2004" as two parts, or "Mar 14, 2004" when the whole span is under two years.
function dateParts(t: number, span: number): { mo: string; yr: string } {
    const d = new Date(t);
    const mo = span < 2 * 365.25 * DAY ? `${MONTHS[d.getUTCMonth[]]} ${d.getUTCDate()}, ` : MONTHS[d.getUTCMonth()];
    return lum > 0.55 ? '#000' : '#fff';
}

// The x window: the whole history up to the playhead, never narrower than a few weeks.
const minWindow = (span: number) => Math.min(span, Math.max(span * 0.03, 30 * DAY));

type Pad = { top: number; right: number; bottom: number; left: number };

export default function LiveChart({ lines, amount, unit, hoverT, onHover, phase, startLabel, loading, progress, tEnd }: Props) {
    const box = useRef<HTMLDiveElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0});
    const [ticks, setTicks] = useState<{ x: XTick[]; y: YTick[] }>({ x: [], y: []});

    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    const narrow = size.w < 520;
    const pad: Pad = narrow ? { top: 10, right: 78, bottom: 30, left: 46 } : { top: 12, right: 96, bottom: 44, left: 64 };
    const t0 = lines.length ? Math.min(...lines.map((l) => l.buyT)) : 0;

    // Every line in the units being shown, with a running min and max so "the highest value so far" is one lookup.
    const series = useMemo<Series[]>(
        () =>
            lines.map((l) => {
                const conv = (p: number) => (unit === 'value' ? valueNow(amount, l.buy, p) : pctChange(l.buy, p));
                const pts = thin([...l.points.filter((p) => p.t >= l.buyT), { t: tEnd, p: l.now }]).map((p) => ({ t: p.t, v: conv(p.p) }));
                let lo = Infinity;
                let hi = -Infinity;
                const cmin: number[] = [];
                const cmax: number[] = [];
                for(const p of pts) {
                    lo = Math.min(lo, p.v);
                    hi = Math.max(hi, p.v);
                    cmin.push(lo);
                    cmax.push(hi);
                }
                return { symbol: l.symbol, color: l.color, buyT: l.buyT, pts, cmin, cmax };
            })
        [lines, amount, unit, tEnd],
    );

    // ── the frame loop: everything that moves is written straight to the DOM, never through React state ──
    const els = useRef({
        paths: new Map<string, SVGPathElement>(),
        tips: new Map<string, SVGGElement>(),
        tags: new Map<string, HTMLDivElement>(),
        xt: new Map<number, SVGGElement>(),
        yt: new Map<number, SVGGElement>(),
        hair: null as SVGLineElement | null,
        base: null as SVGGElement | null,
        dateTag: null as HTMLDivElement | null,
        mo: null as HTMLSpanElement | null,
        yr: null as HTMLSpanElement | null,
    });
    const st _ useRef({
        lo: 0
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
    const live = useRef({ series, t0, tEnd, unit, amount, w: size.w, h: size.h, pad, hoverT, narrow, ver: 0 });
    live.current = { series, t0, tEnd, unit, amount, w: size.w, h: size.h, pad, hoverT, narrow, ver: live.current.ver + 1 };
    const frameRef = useRef(() => {});

    function place(g: SVGGElement, axis: 'x' | 'y', v: number) {
        const L = live.current;
        const S = st.current;
        if (axis === 'x') {
            const x = S.X(v);
            g.style.visibility = x < L.pad.left - 1 || x > L.w - L.pad.right + 1 ? 'hidden': 'visible';
            g.setAttribute('transform', `translate(0 ${y.toFixed(1)})`);
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

        //Y: fit the highest and lowest values readched so far, 12% of air, and never tighter than 20% of the midpoint.
        let lo = Infinity
        let hi = -Infinity;
        const idx = L.series.map((s) => lastAt(S.pts, tPlay));
        L.series.forEach((s, k) => {
            const i = idx[k];
            if (i < 0) return;
            const head = valueAt(S.pts, i, tPlay);
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
        
    }
}
