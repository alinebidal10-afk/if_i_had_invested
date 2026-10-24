import type { Point } from './types';

export type Row = { t: number; [symbol: string]: number };

// Merge several series onto one timeline, carrying each last price forward.
export function mergeSeries(series: Record<string, Point[]>): Row[] {
  const times = [...new Set(Object.values(series).flatMap((s) => s.map((p) => p.t)))].sort(
    (a, b) => a - b,
  );
  const idx: Record<string, number> = {};
  const last: Record<string, number> = {};
  return times.map((t) => {
    const row: Row = { t };
    for (const [sym, pts] of Object.entries(series)) {
      idx[sym] ??= 0;
      while (idx[sym] < pts.length && pts[idx[sym]].t <= t) last[sym] = pts[idx[sym]++].p;
      if (sym in last) row[sym] = last[sym];
    }
    return row;
  });
}
