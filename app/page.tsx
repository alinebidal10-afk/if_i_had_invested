import type { Metadata } from 'next';
import { Suspense } from 'react';
import Terra from '../components/Terra';
import { listNames } from '../lib/assets';
import { formatAmount, formatDate, parseDate } from '../lib/parse';
import { parseSymbols } from '../lib/yahoo';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// A shared link carries the whole comparison, so its preview can too. The image route reads the same params.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const symbols = parseSymbols(first(sp.assets));
  const iso = first(sp.date);
  const amount = Number(first(sp.amount));
  if (!symbols.length || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !parseDate(iso).ok || !(amount > 0 && amount <= 1e12)) return {};

  const title = `${formatAmount(amount)} in ${listNames(symbols)} since ${formatDate(iso, 'day')}`;
  const description = `If I had invested ${formatAmount(amount)} on ${formatDate(iso, 'day')} in ${listNames(symbols)}, what would it be worth today?`;
  const image = `/api/og?${new URLSearchParams({ assets: symbols.join(','), date: iso, amount: String(amount) })}`;
  return {
    title,
    description,
    openGraph: { type: 'website', title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default function Page() {
  return (
    <Suspense>
      <Terra />
    </Suspense>
  );
}
