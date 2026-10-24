import { classify } from '../../../lib/assets';
import type { Quote } from '../../../lib/types';
import { parseSymbols, yf } from '../../../lib/yahoo';

export async function GET(req: Request) {
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'));
  if (!symbols.length) return Response.json([]);
  try {
    const list = await yf.quote(symbols);
    const out: Quote[] = [];
    for (const x of list) {
      const name = x.shortName ?? x.longName ?? x.symbol;
      const kind = classify(x.quoteType, name);
      if (!kind || x.regularMarketPrice == null) continue;
      out.push({
        symbol: x.symbol,
        name,
        kind,
        price: x.regularMarketPrice,
        ts: x.regularMarketTime ? new Date(x.regularMarketTime).getTime() : Date.now(),
        state: x.marketState ?? 'CLOSED',
        delay: x.exchangeDataDelayedBy ?? 0,
      });
    }
    return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json([], { status: 502 });
  }
}
