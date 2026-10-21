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
    const t0 = 
}
