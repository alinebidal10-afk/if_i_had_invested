import type { Point } from '../../../lib/types';
import { parseSymbols, yf } from '../../../lib/yahoo';

const DAY = 864e5;
const TTL = 10*60*1000;
const cache = new Map<string, { at: number; pts: Point [] }>();

// Daily dividend-adjusted closes(total return), keyed to UTC midnight
// stocks and crypto land on the same timeline
async function daily(symbol: string, from:string): Promise<Point[]> {
  const key = `${symbol}:${from}`;
  const cached = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.pts;

    const chart = await yf.chart(symbol, { period1: from, period2: new Date(), interval: '1d' });
    const byDay = new Map<number, number>();
    for (const q of chart.quotes) {
        const p = q.adjclose ?? q.close;
        if (p == null) continue;
        byDay.set(Math.floor(q.date.getTime() / DAY) * DAY, p);
    }
    const pts = [...byDay].map(([t, p]) => ({ t, p })).sort((a, b) => a.t - b.t);
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
    const settled = await Promise.allSettled(symbols.map((s) => daily(s,from)));
    const out: Record<string, Point[]> = {};
    symbols.forEach((s,i) => {
        const r = settled[i];
        out[s] = r.status === 'fulfilled' ? r.value : [];
    });
    return Response.json(out);
}