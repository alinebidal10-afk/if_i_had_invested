import type { Point } from './types';

const DAY = 864e5;

// First trading day on or after the chosen date. Null if the asset had no
// price within maxGapDays (it didn't exist yet, or the date is in the future).
export function findBuyPoint(series: Point[], dateMs: number, maxGapDays = 7): Point | null {
  const p = series.find((x) => x.t >= dateMs);
  return p && p.t - dateMs <= maxGapDays * DAY ? p : null;
}

export const valueNow = (amount: number, buy: number, now: number) => (amount / buy) * now;

export const pctChange = (buy: number, now: number) => (now / buy - 1) * 100;

// Last known price at or before time t (binary search over a time-sorted series).
export function priceAt(series: Point[], t: number): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) {
      best = series[mid].p;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}
