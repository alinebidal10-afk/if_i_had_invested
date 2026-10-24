'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pctChange, priceAt } from '../lib/calc';
import { assetLabel } from '../lib/assets';
import { EARLY_BTC_ATTRIBUTION, usesEarlyBtc } from '../lib/btcEarly';
import { money } from '../lib/format';
import { tagPct } from '../lib/ticks';
import { durationMs, spanYears } from '../lib/pace';
import { formatAmount, formatDate } from '../lib/parse';
import { loadPrices, type Prices } from '../lib/priceCache';
import { sentenceOf, startOf, type Scenario } from '../lib/scenario';
import { HOLD_MS, playMsFor, type StoryOpts } from '../lib/story';
import { useLivePrices } from '../lib/useLivePrices';
import { usePlayback } from '../lib/usePlayback';
import LiveChart, { type Line } from './LiveChart';
import Sky from './Sky';

const COLORS = ['#f4f4f2', '#7ee0a8', '#f5c26b', '#8ab4ff'];
const INTRO_MS = 700; // the sentence and the starting value, still, before the line starts
const dayMs = (iso: string) => Date.parse(iso + 'T00:00:00Z');

declare global {
  interface Window {
    __storyReady?: number; // Date.now() when the first frame is final (the render script trims the video here)
    __playbackDone?: boolean;
    __storyError?: string;
  }
}

export type StoryProps = { scenario: Scenario; opts: StoryOpts; domain: string };

// Whole dollars once the number is big enough that cents are noise.
const big = (n: number) => (Math.abs(n) >= 100 ? money(Math.round(n)).replace(/\.00$/, '') : money(n));

// The 9:16 recording view: one sentence, one big number, one chart. No inputs, no buttons.
export default function Story({ scenario, opts, domain }: StoryProps) {
  const { symbols, iso } = scenario;
  const [prices, setPrices] = useState<Prices | null>(null);
  const [error, setError] = useState('');
  const [fonts, setFonts] = useState(false);
  const [go, setGo] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.fonts.ready.then(() => setFonts(true));
    let off = false;
    loadPrices(symbols, iso).then(
      (p) => !off && setPrices(p),
      (e) => !off && setError(e instanceof Error ? e.message : 'Prices are unavailable right now.'),
    );
    return () => {
      off = true;
    };
  }, [symbols, iso]);

  // A frozen "today" means frozen prices: no live feed at all.
  const asOfMs = opts.asOf ? dayMs(opts.asOf) : null;
  const { live } = useLivePrices(asOfMs === null && prices ? prices.quotes : NONE);

  const rows = useMemo(() => {
    if (!prices) return [];
    return prices.quotes.map((quote, i) => {
      const all = prices.history[quote.symbol] ?? [];
      const points = asOfMs === null ? all : all.filter((p) => p.t <= asOfMs);
      const start = startOf(scenario, points);
      const last = points[points.length - 1]?.p ?? null;
      const now = asOfMs === null ? (live[quote.symbol]?.price ?? quote.price) : last;
      return { quote, first: points[0]?.t ?? null, start, now, color: COLORS[i % COLORS.length] };
    });
  }, [prices, live, asOfMs, scenario]);

  const usable = rows.flatMap((r) => (r.start && r.now !== null ? [{ ...r, start: r.start, now: r.now }] : []));
  // "Today" is fixed once the prices are in, so the span (and the run length) never drifts mid-run.
  const tEnd = useMemo(() => asOfMs ?? Date.now(), [prices, asOfMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const tStart = usable.length ? Math.min(...usable.map((r) => r.start.buy.t)) : 0;
  const ready = fonts && !!prices && usable.length > 0 && tEnd > tStart;
  const playMs = opts.durationS ? playMsFor(opts.durationS) : durationMs(spanYears(tStart, tEnd), 1);

  useEffect(() => {
    if (prices && !usable.length) setError(whyNoStart());
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (error) window.__storyError = error;
  }, [error]);

  // The first final frame: sentence, starting value, flat chart. Autoplay starts a moment later.
  useEffect(() => {
    if (!ready) return;
    window.__storyReady = Date.now();
    if (!opts.autoplay) return;
    const id = setTimeout(() => setGo(true), INTRO_MS);
    return () => clearTimeout(id);
  }, [ready, opts.autoplay]);

  // Why nothing can be drawn, in words: a frozen date before the start, or an asset that had no price yet.
  function whyNoStart(): string {
    if (asOfMs !== null && asOfMs <= dayMs(iso)) return 'asOf must be after the start date.';
    const r = rows[0];
    const name = r ? assetLabel(r.quote.symbol) : symbols[0];
    const first = r?.first ? ` Its first price is on ${formatDate(new Date(r.first).toISOString().slice(0, 10))}.` : '';
    if (scenario.preset) return `This preset starts before ${name} had a price.${first}`;
    if (scenario.units && !scenario.paid) return `No market price for ${name} on ${formatDate(iso)}. Add paid= to start from what was paid.${first}`;
    return `No price for ${name} on ${formatDate(iso)}.${first}`;
  }

  const pb = usePlayback({ on: ready && go, t0: ready ? tStart : 0, tEnd, instant: false, fixedMs: playMs });

  // The last frame holds, then the run is done (the render script waits for this flag).
  useEffect(() => {
    if (!pb.ended) return;
    const id = setTimeout(() => {
      window.__playbackDone = true;
      setDone(true);
    }, HOLD_MS);
    return () => clearTimeout(id);
  }, [pb.ended]);

  const t = pb.ended ? tEnd : go ? pb.playT : tStart;
  const values = usable
    .map((r) => {
      const p = pb.ended ? r.now : t < r.start.buy.t ? null : priceAt(r.start.points, t);
      return { r, value: p === null ? null : r.start.qty * p };
    })
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const top = values[0];

  // ?hide=1: the number stays blurred until the last second of the run.
  const leftMs = (1 - (pb.progress.current ?? 0)) * playMs;
  const hidden = opts.hide && !pb.ended && (!go || leftMs > 1000);

  const lines: Line[] = useMemo(
    () => usable.map((r) => ({ symbol: r.quote.symbol, color: r.color, buy: r.start.buy.p, buyT: r.start.buy.t, now: r.now, points: r.start.points })),
    [rows], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Every line starts from the same dollar value (the amount, or the units at their first price).
  const amount = usable[0] ? usable[0].start.qty * usable[0].start.buy.p : (scenario.amount ?? 0);
  const label = big(top?.value ?? amount);
  const one = values.length === 1 ? values[0] : null;
  const startSub = !one
    ? ''
    : scenario.units
      ? `Worth ${formatAmount(Math.round(amount * 100) / 100)} in ${formatDate(iso, 'month')}${one.r.start.implied ? ' (price implied by the trade)' : ''}`
      : `From ${formatAmount(Math.round(amount * 100) / 100)}${one.value !== null && go ? ` · ${tagPct(pctChange(amount, one.value))}` : ''}`;
  // As big as the frame allows: smaller in a race, where the list below needs the room.
  const fit = { fontSize: `min(${values.length > 1 ? 13 : 17}cqw, ${(118 / Math.max(6, label.length)).toFixed(2)}cqw)` };

  return (
    <main className="story" data-hide={hidden} data-done={done}>
      <Sky dim />
      <div className="story-frame">
        <p className="wm">{domain}</p>
        <div className="story-safe">
          {opts.title && <h1 className="st-title">{opts.title}</h1>}
          <p className="st-sentence">{sentenceOf(scenario)}</p>
          {error ? (
            <p className="st-error" role="alert">
              {error}
            </p>
          ) : (
            <>
              <div className="st-big">
                <p className="st-value" style={fit}>
                  {label}
                </p>
                {startSub && <p className="st-sub">{startSub}</p>}
                {values.length > 1 && top && (
                  <p className="st-who">
                    <span className="dot" style={{ background: top.r.color }} /> {assetLabel(top.r.quote.symbol)} leads
                  </p>
                )}
              </div>
              {values.length > 1 && (
                <ol className="st-race">
                  {values.map(({ r, value }) => (
                    <li key={r.quote.symbol}>
                      <span className="dot" style={{ background: r.color }} />
                      <span className="nm">{assetLabel(r.quote.symbol)}</span>
                      <span className="v">{value === null ? '—' : big(value)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="st-chart">
                <LiveChart
                  lines={lines}
                  amount={amount}
                  unit="value"
                  hoverT={null}
                  onHover={noop}
                  phase={ready ? 'play' : 'baseline'}
                  startLabel={`${formatAmount(amount)} · ${formatDate(iso)}`}
                  loading={!prices && !error}
                  progress={pb.progress}
                  tEnd={tEnd}
                  endLabel={opts.asOf ? formatDate(opts.asOf) : undefined}
                />
                {ready && !opts.autoplay && !go && (
                  <button type="button" className="st-play" onClick={() => setGo(true)}>
                    Play
                  </button>
                )}
              </div>
            </>
          )}
          <p className="st-note">
            For fun. Not financial advice.
            {usesEarlyBtc(symbols, iso) && <span className="src">{EARLY_BTC_ATTRIBUTION}.</span>}
          </p>
        </div>
      </div>
    </main>
  );
}

const NONE: never[] = [];
const noop = () => {};
