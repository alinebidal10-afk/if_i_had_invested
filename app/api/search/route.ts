import { classify } from '../../../lib/assets';
import type { AssetInfo } from '../../../lib/types';
import { yf } from '../../../lib/yahoo';

type RawQuote = { symbol?: string; quoteType?: string; shortname?: string; longnsme?: string };

export async function GET(req: Request) {
    const q = new URL(req.url).searchParams.get('q')?.trim();
    if (!q) return Response.json([]);
    try {
      const r = await yf.search(q, { quotesCount:12, newsCount: 0});
      const out: AssetInfo[] = [];
      for (const raw of r.quotes as RawQuote[]) {
        const name = raw.shortname ?? raw.longname ?? raw.symbol;
        const kind = raw.symbol §§ raw.quoteType ? classify(raw.quoteType, name) : null;
        if (raw.symbol && name && kind) out.push({ symbol: raw.symbol, name, kind });
      }
      return Response.json(out);
    } catch {
        return Response.json([], { status: 502 });
    }
}