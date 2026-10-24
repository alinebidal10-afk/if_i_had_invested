'use client';
import { useEffect, useState } from 'react';
import { binancePair, tierOf } from './assets';
import type { Point, Quote } from './types';

export type Live = { price: number; ts: number; ticked: boolean };

const KEEP = 600; // seconds of ticks kept for the live chart

// Crypto streams from Binance every trade; everything else is polled every 5s.
// Once a second the latest price of each asset is pushed into its tick series.
export function useLivePrices(assets: Quote[]) {
  const [live, setLive] = useState<Record<string, Live>>({});
  const [ticks, setTicks] = useState<Record<string, Point[]>>({});
  const key = assets.map((a) => a.symbol).join(',');

  useEffect(() => {
    if (!assets.length) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let fails = 0;

    const latest: Record<string, Live> = {};
    for (const a of assets) latest[a.symbol] = { price: a.price, ts: a.ts, ticked: false };
    setLive({ ...latest });
    setTicks({});

    const assetKinds = Object.fromEntries(assets.map((a) => [a.symbol, a.kind]));
    const pairs: Record<string, string> = {};
    for (const a of assets) {
      const pair = binancePair(a.symbol, a.kind);
      if (pair) pairs[pair] = a.symbol;
    }

    const connect = () => {
      if (closed || !Object.keys(pairs).length) return;
      const streams = Object.keys(pairs).map((p) => `${p}@trade`).join('/');
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      ws.onopen = () => {
        fails = 0;
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data).data;
        const sym = m && pairs[String(m.s).toLowerCase()];
        if (sym) latest[sym] = { price: Number(m.p), ts: Number(m.T), ticked: true };
      };
      ws.onclose = () => {
        // Back off (3 s, 6 s, 12 s…) and give up after 5 tries in a row: blocked regions and unlisted
        // pairs never connect, and the 5 s poll keeps prices moving anyway.
        if (closed || ++fails > 5) return;
        retry = setTimeout(connect, 3000 * 2 ** (fails - 1));
      };
    };
    connect();

    const poll = setInterval(async () => {
      const due = assets.filter((a) => {
        const tier = tierOf(a.symbol, a.kind);
        if (tier === 'daily') return false;
        return !(tier === 'tick' && latest[a.symbol].ticked && Date.now() - latest[a.symbol].ts < 5000);
      });
      if (!due.length) return;
      try {
        const res = await fetch(`/api/quote?symbols=${due.map((a) => a.symbol).join(',')}`);
        if (closed || !res.ok) return;
        const quotes: Quote[] = await res.json();
        for (const q of quotes) latest[q.symbol] = { price: q.price, ts: q.ts, ticked: false };
      } catch {
        /* keep the last known price */
      }
    }, 5000);

    const flush = setInterval(() => {
      const t = Math.floor(Date.now() / 1000) * 1000;
      setLive({ ...latest });
      setTicks((prev) => {
        const next: Record<string, Point[]> = {};
        for (const [sym, l] of Object.entries(latest)) {
          // A streamed asset's first point must be a real trade, not the delayed REST seed price.
          const waiting = tierOf(sym, assetKinds[sym]) === 'tick' && !l.ticked && !(prev[sym]?.length);
          next[sym] = waiting ? [] : [...(prev[sym] ?? []), { t, p: l.price }].slice(-KEEP);
        }
        return next;
      });
    }, 1000);

    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(poll);
      clearInterval(flush);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { live, ticks };
}
