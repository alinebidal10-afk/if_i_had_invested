import type { AssetInfo, Kind, Tier } from './types';

export const MAX_ASSETS = 5;

export const KIND_LABEL: Record<Kind, string> = {
  crypto: 'Crypto',
  stock: 'Stock',
  etf: 'ETF',
  fund: 'Fund',
  bond: 'Bond',
  commodity: 'Commodity',
};

const BOND_NAME = /bond|treasury|aggregate|tips|fixed income/i;

export function classify(quoteType: string, name = ''): Kind | null {
  switch (quoteType) {
    case 'CRYPTOCURRENCY':
      return 'crypto';
    case 'EQUITY':
      return 'stock';
    case 'MUTUALFUND':
      return BOND_NAME.test(name) ? 'bond' : 'fund';
    case 'ETF':
      return BOND_NAME.test(name) ? 'bond' : 'etf';
    case 'FUTURE':
      return 'commodity';
    default:
      return null;
  }
}

// Binance stream name for a Yahoo crypto symbol, e.g. BTC-USD -> btcusdt
export function binancePair(symbol: string, kind: Kind): string | null {
  return kind === 'crypto' && symbol.endsWith('-USD')
    ? symbol.slice(0, -4).toLowerCase() + 'usdt'
    : null;
}

export function tierOf(symbol: string, kind: Kind): Tier {
  if (kind === 'fund') return 'daily';
  return binancePair(symbol, kind) ? 'tick' : 'poll';
}

export const POPULAR: AssetInfo[] = [
  { symbol: 'BTC-USD', name: 'Bitcoin', kind: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum', kind: 'crypto' },
  { symbol: 'SOL-USD', name: 'Solana', kind: 'crypto' },
  { symbol: 'AAPL', name: 'Apple', kind: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', kind: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'stock' },
  { symbol: 'SPY', name: 'S&P 500 ETF', kind: 'etf' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', kind: 'etf' },
  { symbol: 'VT', name: 'World Stock ETF', kind: 'etf' },
  { symbol: 'VFIAX', name: 'Vanguard 500 Index Fund', kind: 'fund' },
  { symbol: 'TLT', name: '20+ Year Treasury Bond ETF', kind: 'bond' },
  { symbol: 'AGG', name: 'US Aggregate Bond ETF', kind: 'bond' },
  { symbol: 'GC=F', name: 'Gold', kind: 'commodity' },
];

// Short label for sentences and readouts: the curated name, else the ticker.
export function assetLabel(symbol: string): string {
  return POPULAR.find((p) => p.symbol === symbol)?.name ?? symbol.replace(/-USD$/, '');
}

// "Apple", "Apple and Bitcoin", "Apple, Bitcoin and Gold"
export function listNames(symbols: string[]): string {
  const names = symbols.map(assetLabel);
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
