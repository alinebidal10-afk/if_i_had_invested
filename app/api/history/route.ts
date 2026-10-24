import { withEarlyBtc } from '../../../lib/btcEarly';
import type { Point } from '../../../lib/types';
import { parseSymbols, yf } from '../../../lib/yahoo';

const DAY = 864e5;
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; pts: Point[] }>();

// Daily dividend-adjusted closes (total return), keyed to UTC midnight so
// stocks and crypto land on the same timeline.
async function daily(symbol: string, from: string): Promise<Point[]> {
  const key = `${symbol}|${from}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.pts;

  const chart = await yf.chart(symbol, { period1: from, period2: new Date(), interval: '1d' });
  const byDay = new Map<number, number>();
  // Bars are stamped at the session open; shift into exchange time first, or Tokyo's open lands on the previous UTC day.
  const off = (chart.meta.gmtoffset ?? 0) * 1000;
  for (const q of chart.quotes) {
    const p = q.adjclose ?? q.close;
    if (p == null || !(p > 0)) continue; // a zero price would divide returns by zero
    byDay.set(Math.floor((q.date.getTime() + off) / DAY) * DAY, p);
  }
  const pts = withEarlyBtc(symbol, from, [...byDay].map(([t, p]) => ({ t, p })).sort((a, b) => a.t - b.t));
  cache.set(key, { at: Date.now(), pts });
  return pts;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const symbols = parseSymbols(params.get('symbols'));
  const from = params.get('from') ?? '';
  if (!symbols.length || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const settled = await Promise.allSettled(symbols.map((s) => daily(s, from)));
  // Yahoo down for every asset is an outage, not "no data": say so, so the client does not cache it.
  if (settled.every((r) => r.status === 'rejected')) return Response.json({ error: 'upstream' }, { status: 502 });
  const out: Record<string, Point[]> = {};
  symbols.forEach((s, i) => {
    const r = settled[i];
    out[s] = r.status === 'fulfilled' ? r.value : [];
  });
  return Response.json(out);
}
