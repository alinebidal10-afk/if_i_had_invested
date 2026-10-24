'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pctChange } from '../lib/calc';
import { lineSeries, lineValueAt } from '../lib/series';
import { assetLabel } from '../lib/assets';
import { NOT_ADVICE, sourceNote } from '../lib/disclaimer';
import { COLORS } from '../lib/colors';
import { useLead } from '../lib/useLead';
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

const LAYOUT_W = 390; // the frame is laid out at phone width, then zoomed to fill a bigger one (1080×1920)
const INTRO_MS = 700; // the sentence and the starting value, still, before the line starts
const dayMs = (iso: string) => Date.parse(iso + 'T00:00:00Z');

declare global {
  interface Window {
    __storyReady?: number; // Date.now() when the first frame is final (the render script trims the video here)
    __playbackDone?: boolean;
    __playbackDoneAt?: number; // Date.now() when the hold ended (where the render script cuts the video)
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
  const [box, setBox] = useState<{ w: number; h: number; z: number } | null>(null);

  // A 9:16 frame as big as the window allows. Above phone width it is laid out at LAYOUT_W and zoomed, so a
  // 1080×1920 recording looks exactly like the phone, only sharper (the chart measures in unzoomed pixels).
  useLayoutEffect(() => {
    const fit = () => {
      const w = Math.min(window.innerWidth, (window.innerHeight * 9) / 16);
      const z = Math.max(1, w / LAYOUT_W);
      setBox({ w: w / z, h: window.innerHeight / z, z });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

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
      window.__playbackDoneAt = Date.now();
      window.__playbackDone = true;
      setDone(true);
    }, HOLD_MS);
    return () => clearTimeout(id);
  }, [pb.ended]);

  // Every line starts from the same dollar value (the amount, or the units at their first price).
  const amount = usable[0] ? usable[0].start.qty * usable[0].start.buy.p : (scenario.amount ?? 0);
  const lines: Line[] = useMemo(
    () => usable.map((r) => ({ symbol: r.quote.symbol, color: r.color, buy: r.start.buy.p, buyT: r.start.buy.t, now: r.now, points: r.start.points })),
    [rows], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The lines exactly as the chart draws them: every number here is read off these, never off the raw closes.
  const drawn = useMemo(() => Object.fromEntries(lines.map((l) => [l.symbol, lineSeries(l, amount, 'value', tEnd)])), [lines, amount, tEnd]);

  const t = pb.ended ? tEnd : go ? pb.playT : tStart;
  const values = usable
    .map((r) => ({ r, value: lineValueAt(drawn[r.quote.symbol] ?? [], t) }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const top = values[0];
  const race = useLead(
    values.map((v) => ({ symbol: v.r.quote.symbol, value: v.value })),
    t,
    pb.playing && (pb.progress.current ?? 0) > 0.04, // the first few frames are noise, not a race
  );
  // At the end the order is final: the top value wins, whatever the 2% margin was still holding on to.
  const leading = (!pb.ended && values.find((v) => v.r.quote.symbol === race.lead)) || top;
  const colorOf = (sym: string) => usable.find((r) => r.quote.symbol === sym)?.color ?? '#fff';

  // ?hide=1: the number stays blurred until the last second of the run.
  const leftMs = (1 - (pb.progress.current ?? 0)) * playMs;
  const hidden = opts.hide && !pb.ended && (!go || leftMs > 1000);

  const one = values.length === 1 ? values[0] : null;
  const startSub = !one
    ? ''
    : scenario.units
      ? `Worth ${formatAmount(Math.round(amount * 100) / 100)} in ${formatDate(iso, 'month')}${one.r.start.implied ? ' (price implied by the trade)' : ''}`
      : `From ${formatAmount(Math.round(amount * 100) / 100)}`;

  // The big number (and the % beside a single asset) is written straight from the chart's frame: while the line
  // moves it is the leader's value in the very frame its price tag shows, so the two can never disagree.
  const bigRef = useRef<HTMLParagraphElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const bigState = useRef({ go: false, lead: null as string | null, race: false, single: !scenario.units && !!one, amount });
  bigState.current = { go, lead: leading?.r.quote.symbol ?? null, race: values.length > 1, single: !scenario.units && !!one, amount };
  const paint = useCallback((v: number | null, showPct: boolean) => {
    const L = bigState.current;
    const el = bigRef.current;
    if (el) {
      const text = big(v ?? L.amount);
      if (el.textContent !== text) el.textContent = text;
      // As big as the frame allows: a little smaller in a race, where the chart carries four price tags.
      el.style.fontSize = `min(${L.race ? 13 : 17}cqw, ${(118 / Math.max(6, text.length)).toFixed(2)}cqw)`;
    }
    const pe = pctRef.current;
    if (pe) {
      const text = L.single && showPct && v !== null ? ` · ${tagPct(pctChange(L.amount, v))}` : '';
      if (pe.textContent !== text) pe.textContent = text;
    }
  }, []);
  const onFrame = useCallback(
    (_t: number, vals: Record<string, number>) => {
      const L = bigState.current;
      if (L.lead) paint(vals[L.lead] ?? null, L.go);
    },
    [paint],
  );
  // Before the chart draws its first frame, the number is the starting amount; after that, only frames paint it.
  useLayoutEffect(() => {
    if (!ready) paint(null, false);
  });

  return (
    <main className="story" data-hide={hidden} data-done={done}>
      <Sky dim />
      <div className="story-frame" style={box ? { width: box.w, height: box.h, zoom: box.z } : undefined}>
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
                <p className="st-value" ref={bigRef} />
                {startSub && (
                  <p className="st-sub">
                    {startSub}
                    <span ref={pctRef} />
                  </p>
                )}
                {values.length > 1 && leading && (
                  <p className="st-who">
                    <span className="dot" style={{ background: leading.r.color }} /> {assetLabel(leading.r.quote.symbol)} {pb.ended ? 'wins' : 'leads'}
                  </p>
                )}
              </div>
              <div className="st-chart" data-ranked={pb.ended && values.length > 1 && !hidden}>
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
                  leader={race.lead}
                  marks={race.marks}
                  onFrame={onFrame}
                />
                {race.flash && !pb.ended && (
                  <p key={race.flash.n} className="st-flash">
                    <span className="dot" style={{ background: colorOf(race.flash.symbol) }} /> {assetLabel(race.flash.symbol)} takes the lead
                  </p>
                )}
                {pb.ended && values.length > 1 && !hidden && (
                  <ol className="st-rank" aria-label="Final ranking">
                    {values.map(({ r, value }, i) => (
                      <li key={r.quote.symbol}>
                        <span className="pos">{ORDINAL[i]}</span>
                        <span className="dot" style={{ background: r.color }} />
                        <span className="nm">{assetLabel(r.quote.symbol)}</span>
                        <span className="v">{value === null ? '—' : big(value)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {ready && !opts.autoplay && !go && (
                  <button type="button" className="st-play" onClick={() => setGo(true)}>
                    Play
                  </button>
                )}
              </div>
            </>
          )}
          <p className="st-note">
            {NOT_ADVICE}
            {prices && <span className="src">{sourceNote({ symbols, iso, kinds: prices.quotes.map((q) => q.kind), live: asOfMs === null })}</span>}
          </p>
        </div>
      </div>
    </main>
  );
}

const NONE: never[] = [];
const ORDINAL = ['1st', '2nd', '3rd', '4th'];
const noop = () => {};
