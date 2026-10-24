import { describe, expect, it } from 'vitest';
import { durationMs, effectivePace, paceAt1x, paceLabel } from './pace';

describe('durationMs at 1x', () => {
  const table: [string, number, number][] = [
    ['1 month', 1 / 12, 4.0],
    ['1 year', 1, 4.0],
    ['2 years', 2, 5.6],
    ['5 years', 5, 8.6],
    ['10 years', 10, 11.9],
    ['20 years', 20, 16.5],
    ['26 years', 26, 18.7],
    ['34 years', 34, 22.7],
  ];
  for (const [name, years, secs] of table) {
    it(`${name} ≈ ${secs}s`, () => expect(Math.abs(durationMs(years) / 1000 - secs)).toBeLessThanOrEqual(0.2));
  }

  it('has no upper cap', () => expect(durationMs(100) / 1000).toBeCloseTo(100 / 1.5, 5));
  it('scales with speed', () => expect(durationMs(26, 4)).toBeCloseTo(durationMs(26) / 4, 5));
});

describe('pace', () => {
  it('is clamped to 0.25 – 1.5 years per second', () => {
    expect(paceAt1x(0.01)).toBe(0.25);
    expect(paceAt1x(1000)).toBe(1.5);
    expect(paceAt1x(2)).toBeCloseTo(0.36, 2);
  });

  it('reads as months below a year per second', () => {
    expect(paceLabel(0.25)).toBe('≈ 3 months / sec');
    expect(paceLabel(1.39)).toBe('≈ 1.4 years / sec');
    expect(paceLabel(1.5)).toBe('≈ 1.5 years / sec');
    expect(paceLabel(1 / 12)).toBe('≈ 1 month / sec');
  });

  it('follows the speed', () => {
    expect(effectivePace(26, 2)).toBeCloseTo(2 * effectivePace(26, 1), 5);
  });
});
