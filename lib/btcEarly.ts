// Bitcoin before Yahoo: Yahoo's BTC-USD history starts on 2014-09-17. Before that, daily USD prices
// from Coin Metrics Community Network Data (https://github.com/coinmetrics/data, csv/btc.csv, PriceUSD),
// licensed CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/): attribution required, no
// commercial use. Stored in data/btc-early.json, 2010-07-18 to 2014-09-16. Not dividend data: nothing to adjust.
// Server only (it carries the data); the flag, the credit line and usesEarlyBtc live in lib/earlyBtcInfo.ts.
import early from '../data/btc-early.json';
import { EARLY_BTC_ENABLED, YAHOO_BTC_FIRST } from './earlyBtcInfo';
import type { Point } from './types';

export const EARLY_BTC_FIRST = early.prices[0][0] as string; // 2010-07-18

const PTS: Point[] = early.prices.map(([d, p]) => ({ t: Date.parse(`${d}T00:00:00Z`), p: p as number }));

// The early prices go in front of the Yahoo series, never over it: Yahoo wins wherever it has a day.
export function withEarlyBtc(symbol: string, from: string, pts: Point[]): Point[] {
  if (!EARLY_BTC_ENABLED || symbol !== 'BTC-USD' || from >= YAHOO_BTC_FIRST) return pts;
  const t0 = Date.parse(`${from}T00:00:00Z`);
  const end = pts[0]?.t ?? Infinity;
  return [...PTS.filter((p) => p.t >= t0 && p.t < end), ...pts];
}

