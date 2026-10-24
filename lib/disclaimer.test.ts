import { describe, expect, it } from 'vitest';
import { dividendNote, sourceNote } from './disclaimer';

describe('dividendNote', () => {
  it('only claims dividends where there are any', () => {
    expect(dividendNote(['crypto'])).toBe('');
    expect(dividendNote(['commodity', 'crypto'])).toBe('');
    expect(dividendNote(['stock', 'etf'])).toBe('Dividends included.');
    expect(dividendNote(['stock', 'crypto'])).toBe('Dividends included for stocks and ETFs.');
  });
});

describe('sourceNote', () => {
  it('names Binance only for live crypto, and the early Bitcoin source only when it is used', () => {
    expect(sourceNote({ symbols: ['BTC-USD'], iso: '2012-01-01', kinds: ['crypto'], live: true })).toBe(
      'Prices: Yahoo Finance, Binance. Bitcoin prices before Sep 17, 2014: Coin Metrics, CC BY-NC 4.0.',
    );
    expect(sourceNote({ symbols: ['BTC-USD'], iso: '2015-01-01', kinds: ['crypto'], live: false })).toBe('Prices: Yahoo Finance.');
    expect(sourceNote({ symbols: ['AAPL'], iso: '2015-01-01', kinds: ['stock'], live: true })).toBe('Dividends included. Prices: Yahoo Finance.');
  });
});
