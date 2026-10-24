// The drawn line of one asset, shared by the chart and every number shown beside it, so a value on screen is
// always the value the line and its price tag are at: same thinning, same easing between points.
import { pctChange, valueNow } from './calc';
import type { Point } from './types';

export type SeriesPt = { t: number; v: number };
export type SeriesLine = { buy: number; buyT: number; now: number; points: Point[] };

const MAX_POINTS = 500;

export function thin(pts: Point[]): Point[] {
  if (pts.length <= MAX_POINTS) return pts;
  const step = Math.ceil(pts.length / MAX_POINTS);
  const out = pts.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

// The last point at or before t, or -1 if the line has not started yet.
export function lastAt(pts: { t: number }[], t: number): number {
  if (!pts.length || pts[0].t > t) return -1;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The value on a line at time t, easing toward the next point.
export function valueAt(pts: SeriesPt[], i: number, t: number): number {
  const a = pts[i];
  const b = pts[i + 1];
  return b && b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : a.v;
}

// One line in dollars (from `amount` invested) or in % change, from its buy day to `tEnd` (which holds "now").
export function lineSeries(l: SeriesLine, amount: number, unit: 'value' | 'pct', tEnd: number): SeriesPt[] {
  const conv = (p: number) => (unit === 'value' ? valueNow(amount, l.buy, p) : pctChange(l.buy, p));
  return thin([...l.points.filter((p) => p.t >= l.buyT), { t: tEnd, p: l.now }]).map((p) => ({ t: p.t, v: conv(p.p) }));
}

// Where the line is at time t, or null before it starts.
export function lineValueAt(pts: SeriesPt[], t: number): number | null {
  const i = lastAt(pts, t);
  return i < 0 ? null : valueAt(pts, i, t);
}
