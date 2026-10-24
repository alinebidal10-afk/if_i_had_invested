'use client';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findBuyPoint, pctChange, priceAt, valueNow } from '../lib/calc';
import { paceLabel } from '../lib/pace';
import { shareText, shareUrl, type ShareRow } from '../lib/share';
import { SPEEDS, usePlayback } from '../lib/usePlayback';
import { formatAmount, formatAmountPlain, formatDate, parseAmount, parseDate, type Precision } from '../lib/parse';
import { MAX_ASSETS } from '../lib/assets';
import { NOT_ADVICE, sourceNote } from '../lib/disclaimer';
import { COLORS } from '../lib/colors';
import { useLead } from '../lib/useLead';
import { loadPrices, type Prices } from '../lib/priceCache';
import type { AssetInfo, Kind } from '../lib/types';
import { useLivePrices } from '../lib/useLivePrices';
import Controls from './Controls';
import SpeedBar from './SpeedBar';
import LiveChart, { type Line, type Unit } from './LiveChart';
import Readouts, { type Readout } from './Readouts';
import Sentence, { type EditRequest, type SlotName } from './Sentence';
import SharePop from './SharePop';
import Sky from './Sky';

const EASE = [0.22, 1, 0.36, 1] as const;
const HEADER_TOP = 20;
const HEADER_PX = 16;
const ORDER: SlotName[] = ['amount', 'date', 'assets'];

type Stage = 'edit' | 'play';
type Submitted = { amount: number; iso: string; precision: Precision; symbols: string };
type Data = { prices: Prices; amount: number; iso: string };

const SYMBOL = /^[A-Z0-9.\-=^]{1,15}$/;
const placeholder = (symbol: string): AssetInfo => ({ symbol, name: symbol, kind: 'stock' as Kind });
const dayMs = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const anyAvailable = (pr: Prices, iso: string) => pr.quotes.some((q) => findBuyPoint(pr.history[q.symbol] ?? [], dayMs(iso)));

export default function Terra() {
  const params = useSearchParams();
  const router = useRouter();
  const reduced = useReducedMotion();

  // A shared link skips the entry screen and plays straight away.
  const shared = useMemo(() => {
    // Same rules as the server's parseSymbols (lib/yahoo is server-only): uppercase, valid, unique, at most MAX_ASSETS.
    const symbols = [...new Set((params.get('assets') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL.test(s)))].slice(0, MAX_ASSETS);
    const amount = Number(params.get('amount'));
    const d = parseDate(params.get('date') ?? '');
    return symbols.length && amount > 0 && d.ok ? { symbols, amount, iso: d.value.iso } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── what the visitor typed ──
  const [amountText, setAmountText] = useState(shared ? formatAmountPlain(shared.amount) : '');
  const [dateText, setDateText] = useState(shared ? formatDate(shared.iso) : '');
  const [picked, setPicked] = useState<AssetInfo[]>(shared ? shared.symbols.map(placeholder) : []);
  const [touched, setTouched] = useState({ amount: false, date: false });
  const [shake, setShake] = useState<Record<SlotName, number>>({ amount: 0, date: 0, assets: 0 });
  const [noData, setNoData] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // ── where we are ──
  const [stage, setStage] = useState<Stage>(shared ? 'play' : 'edit');
  const [committed, setCommitted] = useState(!!shared);
  const [dim, setDim] = useState(!!shared);
  const [chartOn, setChartOn] = useState(false);
  const [phase, setPhase] = useState<'baseline' | 'play'>('baseline');
  const [controls, setControls] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [unit, setUnit] = useState<Unit>('value');
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [headerBottom, setHeaderBottom] = useState(120);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);
  const wasPlaying = useRef(false);
  const [fromResult, setFromResult] = useState(false); // the entry screen was opened from a result
  const [editReq, setEditReq] = useState<EditRequest>({ n: 0, slot: 'amount' });

  const refs = { amount: useRef<HTMLInputElement>(null), date: useRef<HTMLInputElement>(null), assets: useRef<HTMLInputElement>(null) };
  const inner = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const runId = useRef(0);
  const starting = useRef(false);
  const atHeader = useRef(false);
  const pending = useRef<SlotName | null>(null);
  const timers = useRef<number[]>([]);

  const amountN = parseAmount(amountText);
  const dateR = parseDate(dateText);
  const iso = dateR.ok ? dateR.value.iso : '';
  const symbolsKey = picked.map((p) => p.symbol).join(',');
  const valid = { amount: amountN !== null, date: dateR.ok, assets: picked.length > 0 && !noData && !fetchError };
  const invalid = {
    amount: touched.amount && amountText.trim() !== '' && amountN === null,
    date: touched.date && dateText.trim() !== '' && !dateR.ok,
    assets: noData || !!fetchError,
  };
  const allValid = valid.amount && valid.date && valid.assets;
  const hint = invalid.amount
    ? 'Try an amount like $1,000 or 2.5k'
    : invalid.date && !dateR.ok
      ? dateR.hint
      : noData
        ? picked.length > 1
          ? 'No price data for these assets on that date'
          : 'No price data for this asset on that date'
        : fetchError;

  // ── timing helpers ──
  const wait = useCallback(
    (ms: number, id: number) =>
      new Promise<boolean>((res) => {
        timers.current.push(window.setTimeout(() => res(id === runId.current), ms));
      }),
    [],
  );
  const dur = (s: number) => (reduced ? 0 : s);
  const bump = (slot: SlotName) => setShake((s) => ({ ...s, [slot]: s[slot] + 1 }));

  // Where the sentence sits as a header: scaled to 16px, top-centre. Pure transform, so nothing reflows.
  const headerTarget = useCallback(() => {
    const el = inner.current;
    const text = el?.querySelector<HTMLElement>('.sentence');
    if (!el || !text) return null;
    const s = Math.min(1, HEADER_PX / parseFloat(getComputedStyle(text).fontSize));
    const h = el.offsetHeight;
    const cy = el.offsetTop + h / 2;
    return { dy: HEADER_TOP + (h * s) / 2 - cy, s, bottom: HEADER_TOP + h * s };
  }, []);

  const moveToHeader = useCallback(
    (animated: boolean) => {
      const t = headerTarget();
      if (!t) return;
      atHeader.current = true;
      setHeaderBottom(t.bottom);
      if (animated && !reduced) {
        animate(y, t.dy, { duration: 0.5, ease: EASE });
        animate(scale, t.s, { duration: 0.5, ease: EASE });
      } else {
        y.set(t.dy);
        scale.set(t.s);
      }
    },
    [headerTarget, reduced, y, scale],
  );

  const backToEdit = useCallback(
    (why?: { noData?: boolean; error?: string }) => {
      runId.current++;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      starting.current = false;
      atHeader.current = false;
      setControls(false);
      setChartOn(false); // the graph fades and slides down; it is replaced on the next run
      setLoading(false);
      setDim(false);
      setCommitted(false);
      setStage('edit');
      setFromResult(!why);
      animate(y, 0, { duration: dur(0.35), ease: EASE });
      animate(scale, 1, { duration: dur(0.35), ease: EASE });
      if (why) router.replace('/', { scroll: false });
      if (why?.noData) {
        setNoData(true);
        bump('assets');
      }
      if (why?.error) {
        setFetchError(why.error);
        bump('assets');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [y, scale, reduced, router],
  );

  // t = 850 ms: playback begins as soon as the prices are in.
  const beginPlayback = useCallback(
    async (dataP: Promise<Prices>, sub: Submitted, id: number) => {
      let settled = false;
      dataP.then(
        () => (settled = true),
        () => (settled = true),
      );
      await Promise.resolve();
      if (!settled) setLoading(true);
      let prices: Prices;
      try {
        prices = await dataP;
      } catch (e) {
        if (id === runId.current) backToEdit({ error: e instanceof Error ? e.message : 'Prices are unavailable right now.' });
        return;
      }
      if (id !== runId.current) return;
      setLoading(false);
      if (!anyAvailable(prices, sub.iso)) return backToEdit({ noData: true });
      setPicked((ps) =>
        ps.map((a) => {
          const q = prices.quotes.find((x) => x.symbol === a.symbol);
          return q ? { symbol: a.symbol, name: q.name, kind: q.kind } : a;
        }),
      );
      setData({ prices, amount: sub.amount, iso: sub.iso });
      setPhase('play');
      if (await wait(150, id)) setControls(true); // t ≈ 1000 ms: the control bar
    },
    [backToEdit, wait],
  );

  // Nothing differs from the result that is still on screen underneath.
  const unchanged =
    !!submitted && amountN === submitted.amount && dateR.ok && dateR.value.iso === submitted.iso && dateR.value.precision === submitted.precision && symbolsKey === submitted.symbols;

  // Back to the result exactly as it was: same chart, same playhead, no replay.
  const returnToResult = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    setFromResult(false);
    setCommitted(true);
    setStage('play');
    setDim(true);
    setChartOn(true);
    setControls(true);
    moveToHeader(true);
  }, [moveToHeader]);

  // Any value in the header is a way back in: that blank gets the focus right away, text selected.
  const enterEdit = useCallback(
    (slot: SlotName = 'amount', symbol?: string) => {
      setEditReq((r) => ({ n: r.n + 1, slot, symbol }));
      backToEdit();
    },
    [backToEdit],
  );

  // The reveal: one continuous motion from sentence to graph.
  const start = useCallback(async () => {
    if (stage !== 'edit' || starting.current || amountN === null || !dateR.ok || !picked.length) return;
    if (fromResult && unchanged && data) return returnToResult();
    starting.current = true;
    const id = ++runId.current;
    const symbols = picked.map((p) => p.symbol);
    const sub: Submitted = { amount: amountN, iso: dateR.value.iso, precision: dateR.value.precision, symbols: symbols.join(',') };
    setFromResult(false);
    wasPlaying.current = false;
    setData(null); // the old result must not flash under the new run
    const dataP = loadPrices(symbols, sub.iso);
    dataP.catch(() => {});
    setSubmitted(sub);
    setNoData(false);
    setFetchError('');
    router.replace(`/?assets=${encodeURIComponent(symbols.join(','))}&date=${sub.iso}&amount=${sub.amount}`, { scroll: false });

    setCommitted(true); //                                                          t = 0: underlines go solid together
    if (!(await wait(150, id))) return;
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0); // iOS can leave the page scrolled where the keyboard pushed it
    setStage('play'); //                                                            t = 150: the sentence rises to the header
    moveToHeader(true);
    if (!(await wait(150, id))) return;
    setDim(true); //                                                                t = 300: the sky dims
    if (!(await wait(150, id))) return;
    setPhase('baseline'); //                                                        t = 450: baseline draws, start dot
    setRunKey((k) => k + 1);
    setChartOn(true);
    if (!(await wait(400, id))) return;
    await beginPlayback(dataP, sub, id); //                                         t = 850: playback
  }, [stage, amountN, dateR, picked, fromResult, unchanged, data, returnToResult, router, wait, moveToHeader, beginPlayback]);

  // A shared link: no entry screen, straight to the graph.
  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);
  useLayoutEffect(() => {
    if (!shared || !ready || atHeader.current) return;
    moveToHeader(false);
    const id = ++runId.current;
    const sub: Submitted = { amount: shared.amount, iso: shared.iso, precision: 'day', symbols: shared.symbols.join(',') };
    const dataP = loadPrices(shared.symbols, shared.iso);
    dataP.catch(() => {});
    setSubmitted(sub);
    setRunKey((k) => k + 1);
    setChartOn(true);
    wait(400, id).then((ok) => {
      if (ok) void beginPlayback(dataP, sub, id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(
    () => () => {
      runId.current++;
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  // Keep the header in place when the window changes size.
  useEffect(() => {
    if (stage !== 'play') return;
    // Phones resize mid-reveal (the keyboard closing, the address bar shrinking): keep gliding instead of jumping.
    const on = () => moveToHeader(y.isAnimating());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [stage, moveToHeader, y]);

  // Desktop: the amount blank is ready to type in. Touch: no keyboard until asked.
  useEffect(() => {
    if (ready && !shared && window.matchMedia('(pointer: fine)').matches) refs.amount.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Prefetch: once the sentence is complete, start loading before anyone presses anything.
  useEffect(() => {
    if (stage !== 'edit') return;
    setNoData(false);
    setFetchError('');
    if (!iso || !picked.length) return;
    const symbols = symbolsKey.split(',');
    let stale = false; // a late answer for an older selection must not mark this one
    const id = setTimeout(() => {
      loadPrices(symbols, iso).then(
        (pr) => {
          if (!stale) setNoData(!anyAvailable(pr, iso));
        },
        () => {},
      );
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, symbolsKey, stage]);

  // ── committing a blank (Enter, Space, or choosing from a list) ──
  // Formats the text and says whether it was valid; the sentence decides where focus goes next.
  const commitField = (slot: 'amount' | 'date'): boolean => {
    setTouched((t) => ({ ...t, [slot]: true }));
    if (slot === 'amount') {
      if (amountN !== null) {
        setAmountText(formatAmountPlain(amountN));
        return true;
      }
      bump('amount');
      return false;
    }
    if (dateR.ok) {
      setDateText(formatDate(dateR.value.iso, dateR.value.precision));
      return true;
    }
    bump('date');
    return false;
  };
  // The asset blank is done: play if the sentence is whole, else go to the blank that is not.
  const finishAssets = () => {
    if (allValid) return void start();
    const next = amountN === null ? 'amount' : !dateR.ok ? 'date' : null;
    if (next) refs[next].current?.focus();
  };
  // State set by a click lands on the next render; commit then, with fresh values.
  useEffect(() => {
    const slot = pending.current;
    if (!slot) return;
    pending.current = null;
    if (slot === 'assets') finishAssets();
    else if (commitField('date')) refs.assets.current?.focus();
  });

  const onBlurSlot = (slot: SlotName) => {
    if (slot === 'assets') return;
    setTouched((t) => ({ ...t, [slot]: true }));
    if (slot === 'amount') {
      if (amountN !== null) setAmountText(formatAmountPlain(amountN));
      else if (amountText.trim()) bump('amount');
    } else if (dateR.ok) setDateText(formatDate(dateR.value.iso, dateR.value.precision));
    else if (dateText.trim()) bump('date');
  };

  // ── the graph ──
  const { live } = useLivePrices(data?.prices.quotes ?? []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.prices.quotes.map((quote, i) => {
      const points = data.prices.history[quote.symbol] ?? [];
      return {
        quote,
        points,
        buyPt: findBuyPoint(points, dayMs(data.iso)),
        color: COLORS[i % COLORS.length],
        now: live[quote.symbol]?.price ?? quote.price,
        ticked: !!live[quote.symbol]?.ticked,
      };
    });
  }, [data, live]);

  // The replay clock: lines and numbers follow the playhead until it reaches today.
  const tStart = useMemo(() => (rows.length ? Math.min(...rows.flatMap((r) => (r.buyPt ? [r.buyPt.t] : []))) : 0), [rows]);
  const tEnd = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const runOn = phase === 'play' && !!data && Number.isFinite(tStart) && tStart > 0;
  const pb = usePlayback({ on: runOn, t0: runOn ? tStart : 0, tEnd, instant: !!reduced });
  const cursorT = hoverT !== null ? hoverT : runOn && !pb.ended ? pb.playT : null;

  // Leaving the result pauses the clock; coming back resumes it exactly where it was.
  useEffect(() => {
    if (stage === 'edit') {
      if (pb.playing) {
        wasPlaying.current = true;
        pb.pause();
      }
    } else if (wasPlaying.current) {
      wasPlaying.current = false;
      pb.resume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Same shape as the real readouts, before any price is known: it holds their space from the first frame.
  const heldReadouts: Readout[] = useMemo(
    () =>
      (submitted?.symbols.split(',') ?? []).map((symbol) => ({
        quote: { ...placeholder(symbol), price: 0, ts: 0, state: 'CLOSED', delay: 0 },
        color: 'transparent',
        ticked: false,
        available: true,
        value: null,
        pct: null,
      })),
    [submitted],
  );

  const readouts: Readout[] = rows.map((r) => {
    const price = cursorT !== null ? priceAt(r.points, cursorT) : r.now;
    const ok = r.buyPt && price !== null && (cursorT === null || cursorT >= r.buyPt.t);
    return {
      quote: r.quote,
      color: r.color,
      ticked: r.ticked,
      available: !!r.buyPt,
      value: ok ? valueNow(data!.amount, r.buyPt!.p, price!) : null,
      pct: ok ? pctChange(r.buyPt!.p, price!) : null,
    };
  });

  // The race is called at the playhead, not under the pointer: hovering the past does not change who leads.
  const tLead = runOn ? (pb.ended ? tEnd : pb.playT) : 0;
  const race = useLead(
    rows.map((r) => {
      const p = pb.ended ? r.now : priceAt(r.points, tLead);
      return { symbol: r.quote.symbol, value: r.buyPt && p !== null && tLead >= r.buyPt.t ? valueNow(data!.amount, r.buyPt.p, p) : null };
    }),
    tLead,
    pb.playing,
  );

  // Memoised: Terra re-renders every frame during playback, and LiveChart keys its work on this array.
  const lines: Line[] = useMemo(
    () => rows.flatMap((r) => (r.buyPt ? [{ symbol: r.quote.symbol, color: r.color, buy: r.buyPt.p, buyT: r.buyPt.t, now: r.now, points: r.points }] : [])),
    [rows],
  );

  // "$100 · Jan 3, 2000": the real start. If the day had no trading, say which one was used.
  const startLabel = useMemo(() => {
    if (!submitted) return '';
    const money = formatAmount(submitted.amount);
    if (!lines.length) return `${money} · ${formatDate(submitted.iso, submitted.precision)}`;
    const actual = new Date(Math.min(...lines.map((l) => l.buyT))).toISOString().slice(0, 10);
    const note = actual === submitted.iso ? '' : submitted.precision === 'day' ? ' · next trading day' : ' · first trading day';
    return `${money} · ${formatDate(actual)}${note}`;
  }, [submitted, lines]);

  // ── Share: the sentence from the current numbers, the link from the same state as the page URL ──
  const shareRows: ShareRow[] = rows.map((r) => ({
    symbol: r.quote.symbol,
    available: !!r.buyPt,
    value: r.buyPt && data ? valueNow(data.amount, r.buyPt.p, r.now) : null,
    buyIso: r.buyPt ? new Date(r.buyPt.t).toISOString().slice(0, 10) : null,
  }));
  const sText = data ? shareText(data.amount, data.iso, shareRows) : '';
  const sUrl = submitted && typeof window !== 'undefined' ? shareUrl(submitted.symbols.split(','), submitted.iso, submitted.amount, window.location.origin) : '';

  // Sources under the chart; the early Bitcoin prices carry their own licence line.
  const note = data ? `${sourceNote({ symbols: data.prices.quotes.map((q) => q.symbol), iso: data.iso, kinds: data.prices.quotes.map((q) => q.kind), live: true })} ${NOT_ADVICE}` : NOT_ADVICE;

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 1500);
  };
  const doShare = useCallback(async () => {
    if (!sText || !sUrl) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'If I had invested', text: sText, url: sUrl });
      } catch {
        /* the sheet was dismissed */
      }
      return;
    }
    setShareOpen((o) => !o);
  }, [sText, sUrl]);
  // Scrolling up on the result (wheel/trackpad up, or a downward swipe) goes back to the sentence.
  useEffect(() => {
    if (stage !== 'play' || !controls) return;
    let sum = 0;
    let last = 0;
    let startY: number | null = null;
    const back = () => enterEdit('amount');
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || (e.target instanceof Element && e.target.closest('.sharewrap'))) return; // pinch zoom, the share popover
      if (e.timeStamp - last > 250) sum = 0; // a new gesture
      last = e.timeStamp;
      sum = e.deltaY < 0 ? sum + e.deltaY : 0;
      if (sum < -40) back();
    };
    const touchStart = (e: TouchEvent) => {
      startY = e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const touchMove = (e: TouchEvent) => {
      if (startY !== null && e.touches[0].clientY - startY > 70) {
        startY = null;
        back();
      }
    };
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('touchstart', touchStart, { passive: true });
    window.addEventListener('touchmove', touchMove, { passive: true });
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchmove', touchMove);
    };
  }, [stage, controls, enterEdit]);

  const copyLink = async () => {
    setShareOpen(false);
    try {
      await navigator.clipboard.writeText(sUrl);
      flash('Link copied');
    } catch {
      flash('Could not copy. Copy it from the address bar.');
    }
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!shareOpen) return;
    const out = (e: Event) => {
      if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !(e.target as HTMLElement).closest('.sharewrap')) setShareOpen(false);
    };
    window.addEventListener('pointerdown', out);
    window.addEventListener('keydown', out);
    return () => {
      window.removeEventListener('pointerdown', out);
      window.removeEventListener('keydown', out);
    };
  }, [shareOpen]);

  // Result screen keys: 1-4 speed, S share, E or Enter edit. Only when focus is not typing.
  useEffect(() => {
    if (stage !== 'play') return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key >= '1' && e.key <= '4') return pb.setSpeed(SPEEDS[Number(e.key) - 1]);
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void doShare();
      } else if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter') && !el?.closest('button, a')) {
        e.preventDefault();
        enterEdit('amount');
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [stage, enterEdit, pb.setSpeed, doShare]);

  const playing = stage === 'play';

  return (
    <main className="stage" data-stage={stage} data-ready={ready}>
      <Sky dim={dim} />

      <div className="entry">
        <motion.div
          ref={inner}
          className="entry-inner"
          style={{ y, scale }}
          role={playing ? 'button' : undefined}
          tabIndex={playing ? 0 : undefined}
          aria-label={playing ? 'Change the sentence' : undefined}
          onClick={(e) => {
            if (!playing) return;
            const el = e.target as HTMLElement;
            const slot = el.closest<HTMLElement>('[data-slot]')?.dataset.slot as SlotName | undefined;
            enterEdit(slot ?? 'amount', el.closest<HTMLElement>('[data-symbol]')?.dataset.symbol);
          }}
          onKeyDown={(e) => playing && e.key === ' ' && e.target === e.currentTarget && (e.preventDefault(), enterEdit('amount'))}
        >
          <Sentence
            locked={playing}
            committed={committed}
            amountText={amountText}
            dateText={dateText}
            picked={picked}
            valid={valid}
            invalid={invalid}
            shake={shake}
            hint={hint}
            canStart={allValid && !playing}
            refs={refs}
            editRequest={editReq}
            onAmountText={(v) => {
              setAmountText(v);
              setTouched((t) => ({ ...t, amount: false }));
            }}
            onDateText={(v) => {
              setDateText(v);
              setTouched((t) => ({ ...t, date: false }));
            }}
            onPicked={setPicked}
            onBlurSlot={onBlurSlot}
            onCommitField={commitField}
            onFinish={finishAssets}
            onEscape={() => {
              if (!fromResult || !unchanged || !data) return false;
              returnToResult();
              return true;
            }}
            onPick={(next) => {
              setPicked(next);
              pending.current = 'assets';
            }}
            onDatePick={(text) => {
              setDateText(text);
              setTouched((t) => ({ ...t, date: false }));
              pending.current = 'date';
            }}
            onStart={() => start()}
          />
        </motion.div>
      </div>

      {/* One column under the header: the chart takes what is left, so on a short phone it shrinks instead of
          sliding under the buttons. The rows below are always laid out (only faded), so the chart never jumps. */}
      <div className="result" style={{ top: headerBottom + 28 }}>
        <section className="play" data-on={chartOn} aria-hidden={!chartOn}>
          {data && phase === 'play' ? <Readouts key="on" items={readouts} lead={race.lead} /> : submitted && <Readouts key="held" held items={heldReadouts} />}
          <LiveChart
            key={runKey}
            lines={lines}
            amount={submitted?.amount ?? 0}
            unit={unit}
            hoverT={hoverT}
            onHover={setHoverT}
            phase={phase}
            startLabel={startLabel}
            loading={loading}
            progress={pb.progress}
            tEnd={tEnd}
            leader={race.lead}
            marks={race.marks}
          />
        </section>
        <div className="speedrow" data-on={controls} aria-hidden={!controls}>
          <SpeedBar speed={pb.speed} onSpeed={pb.setSpeed} paceText={paceLabel(pb.pace)} playing={pb.playing} onPlayPause={pb.playing ? pb.pause : pb.resume} onReplay={pb.replay} />
        </div>
        <div className="controlbar" data-on={controls} aria-hidden={!controls}>
          <Controls
            unit={unit}
            onUnit={setUnit}
            onChange={() => enterEdit('amount')}
            onShare={doShare}
            sharePop={shareOpen ? <SharePop text={sText} url={sUrl} onCopy={copyLink} /> : null}
            note={note}
          />
        </div>
      </div>

      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}

      <p className="credit">Banknote scans: Wikimedia Commons, public domain.</p>
    </main>
  );
}
