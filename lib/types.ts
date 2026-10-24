export type Kind = 'crypto' | 'stock' | 'etf' | 'fund' | 'bond' | 'commodity';
export type Tier = 'tick' | 'poll' | 'daily';
export type Point = { t: number; p: number };
export type AssetInfo = { symbol: string; name: string; kind: Kind };
export type Quote = AssetInfo & { price: number; ts: number; state: string; delay: number };
