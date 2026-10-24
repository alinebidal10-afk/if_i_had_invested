import { describe, expect, it } from 'vitest';
import { axisMoney, axisPct, mergeTicks, niceTicks, pruneTicks, tagMoney, timeTicks } from './ticks';

const D = (y: number, m = 1, d = 1) => Date.UTC(y, m - 1, d);

describe('niceTicks', () => {
  it('gives round values, 4 to 6 of them', () => {
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    for (const [lo, hi] of [[0, 100], [78, 131], [0.4, 0.93], [-20, 150], [1200, 34000]]) {
      const t = niceTicks(lo, hi);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(7);
      expect(t.every((v) => v >= lo && v <= hi)).toBe(true);
    }
  });
});

describe('labels', () => {
  it('abbreviates money', () => {
    expect(axisMoney(80)).toBe('$80');
    expect(axisMoney(1200)).toBe('$1.2k');
    expect(axisMoney(34000)).toBe('$34k');
    expect(axisMoney(1.1e6)).toBe('$1.1M');
  });
  it('signs percentages with a real minus', () => {
    expect(axisPct(-20)).toBe('−20%');
    expect(axisPct(150)).toBe('+150%');
    expect(axisPct(1000)).toBe('+1,000%');
    expect(axisPct(0)).toBe('0%');
  });
  it('tags stay short', () => {
    expect(tagMoney(44446.52)).toBe('$44,447');
    expect(tagMoney(98.5)).toBe('$98.50');
    expect(tagMoney(2.5e6)).toBe('$2.5M');
  });
});

describe('timeTicks', () => {
  it('years above 3 years, 4-7 of them on a wide screen', () => {
    const t = timeTicks(D(2000), D(2026, 10), 7);
    expect(t.length).toBeGreaterThanOrEqual(4);
    expect(t.length).toBeLessThanOrEqual(7);
    expect(t[0].label).toMatch(/^\d{4}$/);
  });
  it('3-4 on a narrow one', () => {
    const t = timeTicks(D(2000), D(2026, 10), 4);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.length).toBeLessThanOrEqual(4);
  });
  it('quarters from one to three years', () => {
    const t = timeTicks(D(2004), D(2006, 6), 7);
    expect(t.every((x) => /^[A-Z][a-z]{2} '\d\d$/.test(x.label))).toBe(true);
    expect(t.length).toBeLessThanOrEqual(7);
  });
  it('months under a year', () => {
    const t = timeTicks(D(2004), D(2004, 9), 7);
    expect(t.map((x) => x.label)).toEqual(['Jan', 'Mar', 'May', 'Jul', 'Sep']); // nine months, at most seven ticks: every second month
    expect(t.every((x) => /^[A-Z][a-z]{2}$/.test(x.label))).toBe(true);
  });
  it('days when the window is a few weeks', () => {
    const t = timeTicks(D(2024, 5, 1), D(2024, 5, 31), 7);
    expect(t.length).toBeGreaterThan(0);
    expect(t[0].label).toMatch(/^[A-Z][a-z]{2} \d+$/);
  });
});

describe('mergeTicks', () => {
  it('keeps leaving ticks for the fade and never re-keys the rest', () => {
    const a = mergeTicks([], [{ key: 1 }, { key: 2 }]);
    const b = mergeTicks(a, [{ key: 2 }, { key: 3 }]);
    expect(b.map((x) => [x.key, !!x.leaving])).toEqual([[2, false], [3, false], [1, true]]);
  });

  it('drops each leaving tick on its own clock, not when the set last changed', () => {
    let list = mergeTicks([], [{ key: 1 }, { key: 2 }], 0);
    list = mergeTicks(list, [{ key: 2 }], 100); // 1 starts leaving at 100
    list = mergeTicks(list, [{ key: 3 }], 200); // 2 starts leaving at 200; 1 keeps its own start
    expect(pruneTicks(list, 249, 150).map((t) => t.key).sort()).toEqual([1, 2, 3]);
    expect(pruneTicks(list, 251, 150).map((t) => t.key).sort()).toEqual([2, 3]);
    expect(pruneTicks(list, 351, 150).map((t) => t.key)).toEqual([3]);
  });
});
