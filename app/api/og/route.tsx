import { ImageResponse } from 'next/og';
import { assetLabel } from '../../../lib/assets';
import { COLORS } from '../../../lib/colors';
import { dividendNote, NOT_ADVICE } from '../../../lib/disclaimer';
import { usesEarlyBtc, EARLY_BTC_ATTRIBUTION } from '../../../lib/btcEarly';
import { money } from '../../../lib/format';
import { formatAmount, formatDate } from '../../../lib/parse';
import { resolveScenario, sentenceOf, startOf } from '../../../lib/scenario';
import { SITE_DOMAIN } from '../../../lib/site';
import { snapshot } from '../../../lib/snapshot';
import { cleanTitle, validIso } from '../../../lib/story';
import type { Kind } from '../../../lib/types';

// yahoo-finance2 needs Node, so this is not an edge route. The image is cached for an hour.
export const runtime = 'nodejs';
export const revalidate = 3600;

const INK = '#f4f4f2';
const MUTED = 'rgba(244, 244, 242, 0.72)';
const FAINT = 'rgba(244, 244, 242, 0.5)';
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];
const HEADERS = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

const whole = (n: number) => (Math.abs(n) >= 100 ? money(Math.round(n)).replace(/\.00$/, '') : money(n));

function Frame({ children, foot }: { children: React.ReactNode; foot: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px 40px', background: '#000', color: INK }}>
      {children}
      <div style={{ display: 'flex', position: 'absolute', left: 80, right: 80, bottom: 40, justifyContent: 'space-between', fontSize: 22, color: FAINT }}>
        <div style={{ display: 'flex', maxWidth: 820 }}>{foot}</div>
        <div style={{ display: 'flex', color: MUTED }}>{SITE_DOMAIN}</div>
      </div>
    </div>
  );
}

// The homepage (and any link that does not describe a comparison) gets the blank sentence.
function blank() {
  return new ImageResponse(
    (
      <Frame foot={NOT_ADVICE}>
        <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.3, letterSpacing: '-0.02em' }}>If I had invested $___ on ___ in ___</div>
        <div style={{ display: 'flex', fontSize: 34, color: MUTED, marginTop: 28 }}>Pick an amount, a date and an asset. Watch what it would be worth today.</div>
      </Frame>
    ),
    { width: 1200, height: 630, headers: HEADERS },
  );
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const get = (k: string) => params.get(k);
  const scenario = resolveScenario(get);
  if (!scenario) return blank();
  const today = new Date().toISOString().slice(0, 10);
  const asOf = validIso(get('asOf'), today);
  const title = cleanTitle(get('title'));

  const snap = await snapshot(scenario.symbols, scenario.iso, asOf && asOf > scenario.iso ? asOf : null);
  const rows = snap
    .map((r, i) => {
      const start = startOf(scenario, r.points);
      return { ...r, color: COLORS[i % COLORS.length], start, value: start && r.now !== null ? start.qty * r.now : null };
    })
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const lead = rows[0];
  const startValue = lead.start ? lead.start.qty * lead.start.buy.p : null;
  const kinds = snap.flatMap((r) => (r.kind ? [r.kind] : [])) as Kind[];
  const foot = [dividendNote(kinds), usesEarlyBtc(scenario.symbols, scenario.iso) ? `${EARLY_BTC_ATTRIBUTION}.` : 'Prices: Yahoo Finance.', NOT_ADVICE].filter(Boolean).join(' ');
  const race = rows.length > 1;
  const endLabel = asOf ? `on ${formatDate(asOf)}` : 'today';

  return new ImageResponse(
    (
      <Frame foot={foot}>
        {title && <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, lineHeight: 1.2, marginBottom: 14 }}>{title}</div>}
        <div style={{ display: 'flex', fontSize: race || title ? 30 : 36, color: MUTED, lineHeight: 1.35 }}>{sentenceOf(scenario)}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 20 }}>
          <div style={{ display: 'flex', fontSize: race ? 104 : title ? 128 : 160, letterSpacing: '-0.04em', lineHeight: 1 }}>{lead.value === null ? 'No price' : whole(lead.value)}</div>
          <div style={{ display: 'flex', fontSize: 28, color: MUTED, marginLeft: 24 }}>{race ? `${assetLabel(lead.symbol)}, ${endLabel}` : endLabel}</div>
        </div>
        {!race && startValue !== null && (
          <div style={{ display: 'flex', fontSize: 28, color: MUTED, marginTop: 14 }}>
            {`From ${startValue >= 100 ? whole(startValue) : formatAmount(Math.round(startValue * 100) / 100)}${lead.start?.implied ? ' (price implied by the trade)' : ''}`}
          </div>
        )}
        {race && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22, fontSize: 28 }}>
            {rows.map((r, i) => (
              <div key={r.symbol} style={{ display: 'flex', alignItems: 'center', marginTop: 6, color: i === 0 ? INK : MUTED }}>
                <div style={{ display: 'flex', width: 70 }}>{ORDINAL[i]}</div>
                <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: r.color, marginRight: 14 }} />
                <div style={{ display: 'flex', width: 360 }}>{assetLabel(r.symbol)}</div>
                <div style={{ display: 'flex' }}>{r.value === null ? 'no price' : whole(r.value)}</div>
              </div>
            ))}
          </div>
        )}
      </Frame>
    ),
    { width: 1200, height: 630, headers: HEADERS },
  );
}
