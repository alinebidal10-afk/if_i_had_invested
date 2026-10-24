import { assetLabel } from './assets';
import { formatAmount, formatDate } from './parse';
import { money } from './format';

export type ShareRow = { symbol: string; available: boolean; value: number | null; buyIso: string | null };

const DAY = 864e5;
const fromLabel = (iso: string) => formatDate(iso, 'day');

// The sentence people paste: honest about assets that started later or have no price on that date.
export function shareText(amount: number, iso: string, rows: ShareRow[]): string {
  const head = `If I had invested ${formatAmount(amount)}`;
  const date = formatDate(iso, 'day');
  const dayMs = (d: string) => Date.parse(d + 'T00:00:00Z');

  if (rows.length === 1) {
    const r = rows[0];
    const name = assetLabel(r.symbol);
    if (!r.available || r.value === null) return `${head} in ${name} on ${date}: there is no price for ${name} on that date.`;
    const late = r.buyIso && dayMs(r.buyIso) - dayMs(iso) > 3 * DAY ? ` (first price ${fromLabel(r.buyIso)})` : '';
    return `${head} in ${name} on ${date}${late}, it would be worth ${money(r.value)} today.`;
  }

  const parts = rows.map((r) => {
    const name = assetLabel(r.symbol);
    if (!r.available || r.value === null) return `${name} (no price on that date)`;
    const late = r.buyIso && dayMs(r.buyIso) - dayMs(iso) > 3 * DAY ? ` (from ${fromLabel(r.buyIso)})` : '';
    return `${name}${late} → ${money(r.value)}`;
  });
  return `${head} on ${date}: ${parts.join(', ')}.`;
}

// The absolute link to this exact comparison.
export function shareUrl(symbols: string[], iso: string, amount: number, origin?: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || origin || '').replace(/\/$/, '');
  return `${base}/?assets=${encodeURIComponent(symbols.join(','))}&date=${iso}&amount=${amount}`;
}

export const tweetUrl = (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
export const whatsappUrl = (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const linkedinUrl = (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
