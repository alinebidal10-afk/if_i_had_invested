// Axis ticks. Pure, so the density rules can be tested without a browser.

const DAY = 864e5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIGNED = (n: number) => (n < 0 ? '−' : n > 0 ? '+' : '');

const tidy = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

// Round values with a 1 / 2 / 5 step, about `count` intervals across [lo, hi].
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const err = raw / mag;
  const step = mag * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

// $80, $1.2k, $34k, $1.1M
export function axisMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${tidy(a / 1e9, a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}$${tidy(a / 1e6, a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${tidy(a / 1e3, a >= 1e5 ? 0 : a >= 1e4 ? 1 : 2)}k`;
  return `${sign}$${tidy(a, a >= 100 ? 0 : 2)}`;
}

// −20%, +150%, +1,000%
export const axisPct = (v: number) => `${SIGNED(v)}${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString('en-US') : tidy(Math.abs(v), Math.abs(v) >= 100 ? 0 : 1)}%`;

// The value tags that follow the playhead: exact enough to read, short enough to fit.
export function tagMoney(v: number): string {
  if (v >= 1e9) return `$${tidy(v / 1e9, v >= 1e10 ? 1 : 2)}B`;
  if (v >= 1e6) return `$${tidy(v / 1e6, v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e5) return `$${tidy(v / 1e3, 0)}k`;
  if (v >= 1e3) return `$${Math.round(v).toLocaleString('en-US')}`;
  return `$${v.toFixed(2)}`;
}
export const tagPct = (v: number) => `${SIGNED(v)}${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString('en-US') : Math.abs(v).toFixed(1)}%`;

export type TimeTick = { t: number; label: string };

const STEPS = [1, 2, 3, 5, 10, 20, 25, 50, 100];
const firstFit = (count: (step: number) => number, max: number, steps = STEPS) => steps.find((s) => count(s) <= max) ?? steps[steps.length - 1];

// Calendar ticks for the visible window: years above 3 years, quarters from 1 to 3, months below a year,
// days when the window is under about ten weeks. `max` is the most ticks that fit (7 wide, 4 narrow).
export function timeTicks(t0: number, t1: number, max: number): TimeTick[] {
  if (!(t1 > t0)) return [];
  const span = t1 - t0;
  const years = span / (365.25 * DAY);
  const out: TimeTick[] = [];
  const d0 = new Date(t0);
  const y0 = d0.getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();

  if (years > 3) {
    const step = firstFit((s) => years / s, max);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t >= t0 && t <= t1) out.push({ t, label: String(y) });
    }
    return out;
  }
  if (span > 70 * DAY) {
    // months counted from year 0 so steps line up on Jan / Apr / Jul / Oct
    const quarterly = years >= 1;
    const step = quarterly ? firstFit((s) => span / (s * 30.44 * DAY), max, [3, 6, 12, 24]) : firstFit((s) => span / (s * 30.44 * DAY), max, [1, 2, 3, 6]);
    for (let m = Math.ceil((y0 * 12) / step) * step; m <= y1 * 12 + 11; m += step) {
      const y = Math.floor(m / 12);
      const mo = m - y * 12;
      const t = Date.UTC(y, mo, 1);
      if (t < t0 || t > t1) continue;
      out.push({ t, label: quarterly ? `${MONTHS[mo]} '${String(y % 100).padStart(2, '0')}` : MONTHS[mo] }); // taste-skill-ignore: calendar digits, not index labels
    }
    return out;
  }
  const step = firstFit((s) => span / (s * DAY), max, [1, 2, 7, 14, 28]);
  for (let t = Math.ceil(t0 / (step * DAY)) * step * DAY; t <= t1; t += step * DAY) {
    const d = new Date(t);
    out.push({ t, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` });
  }
  return out;
}

// Ticks that leave fade out instead of vanishing, and new ones fade in: keyed by value, never re-keyed.
// `since` is when a tick began leaving, so each one is dropped on its own clock.
export type Entry<T> = T & { key: number; leaving?: boolean; since?: number };
export function mergeTicks<T extends { key: number }>(prev: Entry<T>[], next: T[], now = 0): Entry<T>[] {
  const keys = new Set(next.map((n) => n.key));
  const kept = prev.filter((p) => !keys.has(p.key)).map((p) => (p.leaving ? p : { ...p, leaving: true, since: now }));
  return [...next.map((n) => ({ ...n, leaving: false })), ...kept];
}
export const pruneTicks = <T,>(list: Entry<T>[], now: number, fadeMs: number): Entry<T>[] => list.filter((t) => !t.leaving || now - (t.since ?? 0) < fadeMs);
