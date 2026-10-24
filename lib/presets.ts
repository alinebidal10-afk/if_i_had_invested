// F1 product presets: "Instead of buying [name] for $[price] in [Mon YYYY], I bought [asset]."
// Prices and dates live in data/presets/products.json; each entry's sourceUrl says where they came from.
import products from '../data/presets/products.json';

export type Product = { id: string; name: string; launchDate: string; launchPriceUSD: number; ticker: string; sourceUrl: string };

const ID = /^[a-z0-9-]{1,40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Only well-formed entries count, so a typo in the JSON shows up as "unknown preset", not a broken page.
const PRODUCTS: Product[] = (products as Product[]).filter(
  (p) => ID.test(p.id) && p.name && ISO.test(p.launchDate) && p.launchPriceUSD > 0 && /^[A-Z0-9.\-=^]{1,15}$/.test(p.ticker),
);

export function getPreset(id: string | null | undefined): Product | null {
  return id && ID.test(id) ? (PRODUCTS.find((p) => p.id === id) ?? null) : null;
}

export const allPresets = () => PRODUCTS;
