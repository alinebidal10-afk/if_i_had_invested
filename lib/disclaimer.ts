// The small print under a chart, built from what is actually on it.
import { EARLY_BTC_ATTRIBUTION, usesEarlyBtc } from './btcEarly';
import type { Kind } from './types';

export const NOT_ADVICE = 'For fun. Not financial advice.';

// Yahoo's adjusted closes reinvest distributions, which only stocks and funds (ETFs, mutual funds, bond funds) pay.
// Crypto and commodity futures have none, so saying "dividends included" there would be wrong.
const PAYS = new Set<Kind>(['stock', 'etf', 'fund', 'bond']);

export function dividendNote(kinds: Kind[]): string {
  const n = kinds.filter((k) => PAYS.has(k)).length;
  if (!n) return '';
  return n === kinds.length ? 'Dividends included.' : 'Dividends included for stocks and ETFs.';
}

// "Dividends included. Prices: Yahoo Finance, Binance. Bitcoin prices before …"
export function sourceNote(opts: { symbols: string[]; iso: string; kinds: Kind[]; live: boolean }): string {
  const feeds = ['Yahoo Finance'];
  if (opts.live && opts.kinds.includes('crypto')) feeds.push('Binance');
  return [dividendNote(opts.kinds), `Prices: ${feeds.join(', ')}.`, usesEarlyBtc(opts.symbols, opts.iso) ? `${EARLY_BTC_ATTRIBUTION}.` : '']
    .filter(Boolean)
    .join(' ');
}
