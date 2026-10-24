import { describe, expect, it } from 'vitest';
import { mergeSeries } from './align';

describe('mergeSeries', () => {
  it('unions timestamps and carries the last price forward', () => {
    const rows = mergeSeries({
      A: [{ t: 1, p: 10 }, { t: 3, p: 30 }],
      B: [{ t: 2, p: 5 }],
    });
    expect(rows).toEqual([
      { t: 1, A: 10 },
      { t: 2, A: 10, B: 5 },
      { t: 3, A: 30, B: 5 },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(mergeSeries({})).toEqual([]);
  });
});
