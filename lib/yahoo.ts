import YahooFinance from 'yahoo-finance2';

export const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const SYMBOL = /^[A-Za-z0-9.\-=^]{1,15}$/;

// Uppercased and deduped: Yahoo answers with canonical symbols, and results are keyed by them.
export function parseSymbols(raw: string | null, max = 5): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL.test(s));
  return [...new Set(list)].slice(0, max);
}
