import { describe, expect, it } from 'vitest';
import { lineSeries, lineValueAt } from './series';

const DAY = 864e5;
const day = (n: number) => n * DAY;

describe('lineSeries / lineValueAt', () => {
  const l = { buy: 10, buyT: day(1), now: 40, points: [{ t: day(0), p: 9 }, { t: day(1), p: 10 }, { t: day(3), p: 30 }] };
  const pts = lineSeries(l, 100, 'value', day(5));
  it('starts at the buy day and ends on "now" at tEnd', () => {
    expect(pts).toEqual([{ t: day(1), v: 100 }, { t: day(3), v: 300 }, { t: day(5), v: 400 }]);
  });
  it('eases between points, the way the line is drawn', () => {
    expect(lineValueAt(pts, day(2))).toBe(200);
    expect(lineValueAt(pts, day(4))).toBe(350);
    expect(lineValueAt(pts, day(0.5))).toBe(null);
  });
  it('reads off the thinned line, not the raw closes', () => {
    const raw = Array.from({ length: 2000 }, (_, i) => ({ t: day(i), p: i % 2 ? 2 : 1 }));
    const s = lineSeries({ buy: 1, buyT: 0, now: 1, points: raw }, 1, 'value', day(2000));
    expect(s.length).toBeLessThanOrEqual(502);
    // between two kept points the value is the straight line between them, whatever the raw day in between said
    const [a, b] = s;
    expect(lineValueAt(s, (a.t + b.t) / 2)).toBeCloseTo((a.v + b.v) / 2);
  });
});
