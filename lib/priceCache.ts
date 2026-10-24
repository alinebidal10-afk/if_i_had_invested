import type { Point, Quote } from './types';

export type Prices = { quotes: Quote[]; history: Record<string, Point[]> };

const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<Prices> }>();

export const priceKey = (symbols: string[], date: string) => `${symbols.join(',')}|${date}`;

async function fetchPrices(symbols: string[], date: string): Promise<Prices> {
  const s = symbols.join(',');
  const [qr, hr] = await Promise.all([fetch(`/api/quote?symbols=${s}`), fetch(`/api/history?symbols=${s}&from=${date}`)]);
  if (!qr.ok || !hr.ok) throw new Error('Prices are unavailable right now. Try again in a moment.');
  const quotes: Quote[] = await qr.json();
  if (!quotes.length) throw new Error('Nothing found for that asset.');
  return { quotes, history: await hr.json() };
}

// One request per (assets, date). Start it early to prefetch; ask again to await it.
export function loadPrices(symbols: string[], date: string): Promise<Prices> {
  const key = priceKey(symbols, date);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = fetchPrices(symbols, date);
  cache.set(key, { at: Date.now(), promise });
  // An empty history may be a one-off upstream failure: use it now, but ask again next time.
  promise.then(
    (pr) => {
      if (symbols.some((s) => !pr.history[s]?.length)) cache.delete(key);
    },
    () => cache.delete(key),
  );
  return promise;
}
