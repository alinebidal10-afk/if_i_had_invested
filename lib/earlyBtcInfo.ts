// What the page needs to know about the early Bitcoin prices (lib/btcEarly.ts), without the prices themselves:
// this file is safe to import in the browser, the 35 KB of data stays on the server.

// EARLY_BTC_ENABLED=false (or 0 / off / no) drops the 2010–2014 prices and their credit everywhere.
// Read at build time (next.config.ts passes it through), so changing it needs a new deploy, not a code change.
export const EARLY_BTC_ENABLED = !/^(false|0|off|no)$/i.test((process.env.EARLY_BTC_ENABLED ?? '').trim());

export const EARLY_BTC_ATTRIBUTION = 'Bitcoin prices before Sep 17, 2014: Coin Metrics, CC BY-NC 4.0';
export const YAHOO_BTC_FIRST = '2014-09-17';

// Whether a chart for these assets and this start date shows any of the early prices (so the source must be named).
export const usesEarlyBtc = (symbols: string[], from: string) => EARLY_BTC_ENABLED && symbols.includes('BTC-USD') && from < YAHOO_BTC_FIRST;
