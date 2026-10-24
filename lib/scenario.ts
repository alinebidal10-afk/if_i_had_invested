// One scenario, as a URL describes it: the page, the story view, the metadata and the preview image all read
// it through here, so a link means the same thing everywhere. Pure (no network), so it can be tested.
import { assetLabel, listNames, MAX_ASSETS } from './assets';
import { findBuyPoint } from './calc';
import { formatAmount, formatAmountPlain, formatDate, parseDate } from './parse';
import { getPreset, type Product } from './presets';
import { parsePositive } from './story';
import type { Point } from './types';

export type Scenario = {
  symbols: string[];
  iso: string;
  amount: number | null; // dollars invested (null when `units` says how much was held instead)
  units: number | null; // ?units=10000: a quantity of the (first) asset
  paid: number | null; // ?paid=41: what those units cost, for days with no market price
  preset: Product | null; // ?preset=iphone-2007
};

type Get = (key: string) => string | null | undefined;

const SYMBOL = /^[A-Z0-9.\-=^]{1,15}$/;
const dayMs = (iso: string) => Date.parse(iso + 'T00:00:00Z');

// Uppercase, valid, unique, at most `max`: the same rules as the server's parseSymbols.
export function symbolsFrom(raw: string | null | undefined, max = MAX_ASSETS): string[] {
  const list = (raw ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL.test(s));
  return [...new Set(list)].slice(0, max);
}

export function resolveScenario(get: Get, max = MAX_ASSETS, today?: string): Scenario | null {
  const preset = getPreset(get('preset'));
  let symbols = symbolsFrom(get('assets'), max);
  if (preset) {
    // A preset fixes the date and the price; `assets` may still name what was bought instead of the preset's ticker.
    if (!symbols.length) symbols = [preset.ticker];
    const d = parseDate(preset.launchDate, today);
    return d.ok ? { symbols, iso: d.value.iso, amount: preset.launchPriceUSD, units: null, paid: null, preset } : null;
  }
  const d = parseDate(get('date') ?? '', today);
  if (!symbols.length || !d.ok || !/^\d{4}-\d{2}-\d{2}$/.test(get('date') ?? '')) return null;
  const units = parsePositive(get('units'));
  if (units) return { symbols: symbols.slice(0, 1), iso: d.value.iso, amount: null, units, paid: parsePositive(get('paid')), preset: null };
  const amount = Number(get('amount'));
  return amount > 0 && amount <= 1e12 ? { symbols, iso: d.value.iso, amount, units: null, paid: null, preset: null } : null;
}

// "10,000 BTC", "100 shares of Apple", "1 share of Apple"
function holding(units: number, symbol: string): string {
  const n = formatAmountPlain(units);
  if (symbol.endsWith('-USD')) return `${n} ${symbol.slice(0, -4)}`;
  const what = symbol.endsWith('=F') ? 'unit' : 'share';
  return `${n} ${what}${units === 1 ? '' : 's'} of ${assetLabel(symbol)}`;
}

export function sentenceOf(s: Scenario): string {
  const names = listNames(s.symbols);
  if (s.preset) return `Instead of buying ${s.preset.name} for ${formatAmount(s.preset.launchPriceUSD)} in ${formatDate(s.iso, 'month')}, I bought ${names}.`;
  if (s.units) return `If I had kept ${holding(s.units, s.symbols[0])} from ${formatDate(s.iso, 'month')}.`;
  return `If I had invested ${formatAmount(s.amount ?? 0)} on ${formatDate(s.iso)} in ${names}.`;
}

export type Start = {
  buy: Point; // the starting price (a market close, or implied by `paid`)
  qty: number; // how much of the asset is held
  implied: boolean; // the start price came from `paid`, not from the market
  points: Point[]; // the series to draw, starting at `buy`
};

// Where an asset's line starts. A market price on (or within a week after) the date always wins; `paid` only
// stands in when there is none, and then it is the start value itself. A market price is never invented.
export function startOf(s: Scenario, points: Point[]): Start | null {
  const from = dayMs(s.iso);
  const market = findBuyPoint(points, from);
  if (s.units) {
    if (market) return { buy: market, qty: s.units, implied: false, points };
    const later = points.filter((p) => p.t > from);
    if (!s.paid || !later.length) return null;
    const buy = { t: from, p: s.paid / s.units };
    return { buy, qty: s.units, implied: true, points: [buy, ...later] };
  }
  return market ? { buy: market, qty: (s.amount ?? 0) / market.p, implied: false, points } : null;
}

// The query string that reproduces this scenario (plus any story options passed in).
export function scenarioQuery(s: Scenario, extra: Record<string, string | null | undefined> = {}): URLSearchParams {
  const q = new URLSearchParams();
  q.set('assets', s.symbols.join(','));
  if (s.preset) q.set('preset', s.preset.id);
  else {
    q.set('date', s.iso);
    if (s.units) {
      q.set('units', String(s.units));
      if (s.paid) q.set('paid', String(s.paid));
    } else q.set('amount', String(s.amount));
  }
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return q;
}
