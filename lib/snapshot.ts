import { withEarlyBtc } from './btcEarly';
import { findBuyPoint, valueNow } from './calc';
import { yf } from './yahoo';

export type SnapshotRow = { symbol: string; value: number | null };

const DAY = 864e5;

// What each asset would be worth right now. Server only: the preview image calls it.
// Same method as the page: dividend-adjusted close on the first trading day, then today's price.
export async function snapshot(symbols: string[], iso: string, amount: number): Promise<SnapshotRow[]> {
  const from = Date.parse(iso + 'T00:00:00Z');
  const quotes = await yf.quote(symbols).catch(() => []);
  return Promise.all(
    symbols.map(async (symbol) => {
      try {
        const now = quotes.find((q) => q.symbol === symbol)?.regularMarketPrice;
        const chart = await yf.chart(symbol, { period1: iso, period2: new Date(), interval: '1d' });
        const off = (chart.meta.gmtoffset ?? 0) * 1000; // exchange-local day, as in /api/history
        const pts = withEarlyBtc(
          symbol,
          iso,
          chart.quotes.flatMap((q) => {
            const p = q.adjclose ?? q.close;
            return p == null || !(p > 0) ? [] : [{ t: Math.floor((q.date.getTime() + off) / DAY) * DAY, p }];
          }),
        );
        const buy = findBuyPoint(pts, from);
        return { symbol, value: buy && now != null ? valueNow(amount, buy.p, now) : null };
      } catch {
        return { symbol, value: null };
      }
    }),
  );
}
