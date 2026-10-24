import { describe, expect, it } from 'vitest';
import { findBuyPoint, pctChange, priceAt, valueNow } from './calc';

const DAY = 864e5;
const d = (s: string) => Date.parse(s + 'T00:00:00Z');

describe('calc', () => {
  it('computes value and percent change', () => {
    expect(valueNow(1000, 50, 75)).toBe(1500);
    expect(pctChange(50, 75)).toBeCloseTo(50);
    expect(pctChange(50, 25)).toBeCloseTo(-50);
  });

  it('buys on the first trading day on or after the date', () => {
    const s = [{ t: d('2020-01-06'), p: 10 }, { t: d('2020-01-07'), p: 11 }];
    expect(findBuyPoint(s, d('2020-01-04'))?.p).toBe(10);
    expect(findBuyPoint(s, d('2020-01-07'))?.p).toBe(11);
  });

  it('returns null when the asset has no price near the date', () => {
    const s = [{ t: d('2020-01-06') + 30 * DAY, p: 10 }];
    expect(findBuyPoint(s, d('2020-01-06'))).toBeNull();
    expect(findBuyPoint([], d('2020-01-06'))).toBeNull();
  });

  it('finds the last price at or before a time', () => {
    const s = [{ t: 10, p: 1 }, { t: 20, p: 2 }, { t: 30, p: 3 }];
    expect(priceAt(s, 5)).toBeNull();
    expect(priceAt(s, 20)).toBe(2);
    expect(priceAt(s, 25)).toBe(2);
    expect(priceAt(s, 99)).toBe(3);
  });
});
