import { describe, expect, it } from 'vitest';
import { formatAmount, formatAmountPlain, formatDate, isCompleteDate, parseAmount, parseDate } from './parse';

const TODAY = '2026-10-20';
const ok = (text: string) => {
  const r = parseDate(text, TODAY);
  return r.ok ? r.value : r.hint;
};

describe('parseAmount', () => {
  it('accepts the shapes people type', () => {
    expect(parseAmount('100')).toBe(100);
    expect(parseAmount('$100')).toBe(100);
    expect(parseAmount('1k')).toBe(1000);
    expect(parseAmount('1,000')).toBe(1000);
    expect(parseAmount('$1,000.50')).toBe(1000.5);
    expect(parseAmount('2.5k')).toBe(2500);
    expect(parseAmount('1M')).toBe(1_000_000);
  });

  it('rejects nonsense, zero and absurd sizes', () => {
    for (const t of ['', 'abc', '0', '-5', '1x', '$', '2e9999', '5000000000000']) expect(parseAmount(t)).toBeNull();
  });

  it('formats for display', () => {
    expect(formatAmount(100)).toBe('$100');
    expect(formatAmount(10000)).toBe('$10,000');
    expect(formatAmount(2500.5)).toBe('$2,500.5');
    expect(formatAmountPlain(2500)).toBe('2,500');
  });
});

describe('isCompleteDate', () => {
  it('lets space advance only after a whole date ending in a year', () => {
    for (const t of ['2000', 'jan 2000', 'Jan 3, 2000', '1/3/2000', '2000-01-03', '3 jan 2000']) expect(isCompleteDate(t)).toBe(true);
  });

  it('keeps "jan 3, 2000" typeable on the way there', () => {
    for (const t of ['', 'j', 'jan', 'jan 3', 'jan 3,', 'jan 3, 20', '1/3/', '2000-01-', '1979']) expect(isCompleteDate(t)).toBe(false);
  });
});

describe('parseDate', () => {
  it('reads the supported spellings', () => {
    expect(ok('2000')).toEqual({ iso: '2000-01-01', precision: 'year' });
    expect(ok('jan 2000')).toEqual({ iso: '2000-01-01', precision: 'month' });
    expect(ok('January 2000')).toEqual({ iso: '2000-01-01', precision: 'month' });
    expect(ok('2000-01-03')).toEqual({ iso: '2000-01-03', precision: 'day' });
    expect(ok('1/3/2000')).toEqual({ iso: '2000-01-03', precision: 'day' });
    expect(ok('Jan 3, 2000')).toEqual({ iso: '2000-01-03', precision: 'day' });
    expect(ok('3 jan 2000')).toEqual({ iso: '2000-01-03', precision: 'day' });
    expect(ok('2009-03')).toEqual({ iso: '2009-03-01', precision: 'month' });
  });

  it('reads day-first when the month would be impossible', () => {
    expect(ok('25/12/2020')).toEqual({ iso: '2020-12-25', precision: 'day' });
  });

  it('refuses impossible dates', () => {
    expect(ok('2/30/2020')).toBe('Try a date like Jan 3, 2000');
    expect(ok('banana')).toBe('Try a date like Jan 3, 2000');
    expect(ok('13/13/2020')).toBe('Try a date like Jan 3, 2000');
  });

  it('refuses dates before 1980, today and the future', () => {
    expect(ok('1979')).toBe('Pick a date after Jan 1980');
    expect(ok('2026-10-20')).toBe('Pick a date before today');
    expect(ok('2027')).toBe('Pick a date before today');
    expect(ok('2026-10-19')).toEqual({ iso: '2026-10-19', precision: 'day' });
  });

  it('formats with the precision typed', () => {
    expect(formatDate('2000-01-03', 'day')).toBe('Jan 3, 2000');
    expect(formatDate('2000-01-01', 'month')).toBe('Jan 2000');
    expect(formatDate('2000-01-01', 'year')).toBe('2000');
  });
});
