import { assetLabel } from '../lib/assets';
import { money, percent } from '../lib/format';
import { freshness } from '../lib/freshness';
import type { Quote } from '../lib/types';

export type Readout = {
  quote: Quote;
  color: string;
  ticked: boolean;
  available: boolean;
  value: number | null;
  pct: number | null;
};

// `held`: an invisible stand-in with the same rows, so the chart below never moves when the numbers arrive.
// `lead`: in a race, the asset that is ahead at the playhead.
export default function Readouts({ items, held = false, lead = null }: { items: Readout[]; held?: boolean; lead?: string | null }) {
  const sorted = [...items].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return (
    <div className={held ? 'readouts held' : 'readouts'} aria-hidden={held || undefined}>
      {sorted.map((it, i) => {
        const f = freshness(it.quote, it.ticked);
        return (
          <div className="readout" key={it.quote.symbol} style={{ "--i": i } as React.CSSProperties}>
            {it.available ? (
              <>
                <p className="amt">{it.value === null ? '—' : money(it.value)}</p>
                <p className="sub">
                  <span className="who">
                    <span className="dot" style={{ background: it.color }} />
                    <span title={it.quote.name}>{assetLabel(it.quote.symbol)}</span>
                  </span>
                  {it.pct !== null && <span className={it.pct >= 0 ? 'up' : 'down'}>{percent(it.pct)}</span>}
                  {lead === it.quote.symbol && <span className="leadtag">Leading</span>}
                  <span className={f.live ? 'live' : ''}>{f.label}</span>
                </p>
              </>
            ) : (
              <>
                <p className="amt dim">No price</p>
                <p className="sub">
                  <span className="who">
                    <span className="dot" style={{ background: it.color }} />
                    <span title={it.quote.name}>{assetLabel(it.quote.symbol)}</span>
                  </span>
                  <span>Not trading on this date</span>
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
