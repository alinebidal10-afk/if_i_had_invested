import { classify } from './assets';
import { withEarlyBtc } from './btcEarly';
import type { Kind, Point } from './types';
import { yf } from './yahoo';

export type SnapshotRow = { symbol: string; name: string; kind: Kind | null; points: Point[]; now: number | null };

const DAY = 864e5;

// Each asset's daily series and its price "now". Server only: the preview image calls it.
// Same data as the page: dividend-adjusted closes on the exchange's own day, early Bitcoin prices in front.
// With `asOf`, the series stops on that day and "now" is its last close, so the image never changes.
export async function snapshot(symbols: string[], iso: string, asOf: string | null = null): Promise<SnapshotRow[]> {
  const quotes = await yf.quote(symbols).catch(() => []);
  const end = asOf ? Date.parse(asOf + 'T00:00:00Z') : Infinity;
  return Promise.all(
    symbols.map(async (symbol) => {
      const q = quotes.find((x) => x.symbol === symbol);
      const name = q?.shortName ?? q?.longName ?? symbol;
      const kind = q ? classify(q.quoteType, name) : null;
      try {
        const chart = await yf.chart(symbol, { period1: iso, period2: new Date(), interval: '1d' });
        const off = (chart.meta.gmtoffset ?? 0) * 1000; // exchange-local day, as in /api/history
        const all = withEarlyBtc(
          symbol,
          iso,
          chart.quotes.flatMap((x) => {
            const p = x.adjclose ?? x.close;
            return p == null || !(p > 0) ? [] : [{ t: Math.floor((x.date.getTime() + off) / DAY) * DAY, p }];
          }),
        );
        const points = all.filter((p) => p.t <= end);
        const now = asOf ? (points[points.length - 1]?.p ?? null) : (q?.regularMarketPrice ?? null);
        return { symbol, name, kind, points, now };
      } catch {
        return { symbol, name, kind, points: [], now: null };
      }
    }),
  );
}
