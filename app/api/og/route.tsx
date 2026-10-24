import { ImageResponse } from 'next/og';
import { assetLabel, listNames } from '../../../lib/assets';
import { money } from '../../../lib/format';
import { formatAmount, formatDate, parseDate } from '../../../lib/parse';
import { snapshot } from '../../../lib/snapshot';
import { parseSymbols } from '../../../lib/yahoo';

// yahoo-finance2 needs Node, so this is not an edge route. The image is cached for an hour.
export const runtime = 'nodejs';
export const revalidate = 3600;

const MUTED = 'rgba(244, 244, 242, 0.72)';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const symbols = parseSymbols(params.get('assets'));
  const iso = params.get('date') ?? '';
  const amount = Number(params.get('amount'));
  if (!symbols.length || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !parseDate(iso).ok || !(amount > 0 && amount <= 1e12)) {
    return new Response('bad request', { status: 400 });
  }

  const rows = (await snapshot(symbols, iso, amount)).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const lead = rows[0];
  const sentence = `If I had invested ${formatAmount(amount)} on ${formatDate(iso, 'day')} in ${listNames(symbols)}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px', background: '#000', color: '#f4f4f2' }}>
        <div style={{ display: 'flex', fontSize: 36, color: MUTED, lineHeight: 1.35 }}>{sentence}</div>
        <div style={{ display: 'flex', fontSize: 168, letterSpacing: '-0.04em', marginTop: 28, lineHeight: 1 }}>{lead.value === null ? 'No price' : money(lead.value)}</div>
        {rows.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 36, fontSize: 32, color: MUTED }}>
            {rows.map((r) => (
              <div key={r.symbol} style={{ display: 'flex', marginRight: 40 }}>
                {assetLabel(r.symbol)} {r.value === null ? 'no price' : money(r.value)}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', position: 'absolute', left: 80, bottom: 48, fontSize: 26, color: MUTED }}>Total return, dividends included. Prices: Yahoo Finance.</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}
