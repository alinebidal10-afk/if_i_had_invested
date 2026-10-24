'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { findBuyPoint, priceAt, valueNow } from '../lib/calc';
import { assetLabel, listNames } from '../lib/assets';
import { money } from '../lib/format';
import { durationMs, spanYears } from '../lib/pace';
import { formatAmount, formatDate } from '../lib/parse';
import { loadPrices, type Prices } from '../lib/priceCache';
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

export type StoryProps = { symbols: string[]; iso: string; amount: number; opts: StoryOpts; domain: string };

// Whole dollars once the number is big enough that cents are noise.
const big = (n: number) => (Math.abs(n) >= 100 ? money(Math.round(n)).replace(/\.00$/, '') : money(n));

// The 9:16 recording view: one sentence, one big number, one chart. No inputs, no buttons.
export default function Story({ symbols, iso, amount, opts, domain }: StoryProps) {
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
      const buyPt = findBuyPoint(points, dayMs(iso));
      const last = points[points.length - 1]?.p ?? null;
      const now = asOfMs === null ? (live[quote.symbol]?.price ?? quote.price) : last;
      return { quote, points, buyPt, now, color: COLORS[i % COLORS.length] };
    });
  }, [prices, live, asOfMs, iso]);

  const usable = rows.filter((r) => r.buyPt && r.now !== null);
  // "Today" is fixed once the prices are in, so the span (and the run length) never drifts mid-run.
  const tEnd = useMemo(() => asOfMs ?? Date.now(), [prices, asOfMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const tStart = usable.length ? Math.min(...usable.map((r) => r.buyPt!.t)) : 0;
  const ready = fonts && !!prices && usable.length > 0 && tEnd > tStart;
  const playMs = opts.durationS ? playMsFor(opts.durationS) : durationMs(spanYears(tStart, tEnd), 1);

  useEffect(() => {
    if (prices && !usable.length) setError(asOfMs !== null && asOfMs <= dayMs(iso) ? 'asOf must be after the start date.' : `No price for ${listNames(symbols)} on ${formatDate(iso)}.`);
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
      const p = pb.ended ? r.now! : t < r.buyPt!.t ? null : priceAt(r.points, t);
      return { r, value: p === null ? null : valueNow(amount, r.buyPt!.p, p) };
    })
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const top = values[0];

  // ?hide=1: the number stays blurred until the last second of the run.
  const leftMs = (1 - (pb.progress.current ?? 0)) * playMs;
  const hidden = opts.hide && !pb.ended && (!go || leftMs > 1000);

  const lines: Line[] = useMemo(
    () => usable.map((r) => ({ symbol: r.quote.symbol, color: r.color, buy: r.buyPt!.p, buyT: r.buyPt!.t, now: r.now!, points: r.points })),
    [rows], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sentence = `If I had invested ${formatAmount(amount)} on ${formatDate(iso)} in ${listNames(symbols)}.`;
  const label = top?.value != null ? big(top.value) : big(amount);
  // As big as the frame allows: smaller in a race, where the list below needs the room.
  const fit = { fontSize: `min(${values.length > 1 ? 13 : 17}cqw, ${(118 / Math.max(6, label.length)).toFixed(2)}cqw)` };

  return (
    <main className="story" data-hide={hidden} data-done={done}>
      <Sky dim />
      <div className="story-frame">
        <p className="wm">{domain}</p>
        <div className="story-safe">
          {opts.title && <h1 className="st-title">{opts.title}</h1>}
          <p className="st-sentence">{sentence}</p>
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
          <p className="st-note">For fun. Not financial advice.</p>
        </div>
      </div>
    </main>
  );
}

const NONE: never[] = [];
const noop = () => {};
