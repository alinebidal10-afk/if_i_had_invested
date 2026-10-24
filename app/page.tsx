import type { Metadata } from 'next';
import { Suspense } from 'react';
import Story from '../components/Story';
import Terra from '../components/Terra';
import { listNames } from '../lib/assets';
import { formatAmount, formatDate, parseDate } from '../lib/parse';
import { SITE_DOMAIN } from '../lib/site';
import { parseStoryOpts, STORY_MAX_ASSETS } from '../lib/story';
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

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const opts = parseStoryOpts((k) => first(sp[k]) || null);
  if (opts.story) {
    // Same rules as a shared link, at most four assets: the 9:16 frame has room for a four-way race.
    const symbols = parseSymbols(first(sp.assets), STORY_MAX_ASSETS);
    const d = parseDate(first(sp.date));
    const amount = Number(first(sp.amount));
    if (symbols.length && d.ok && amount > 0 && amount <= 1e12) {
      return <Story symbols={symbols} iso={d.value.iso} amount={amount} opts={opts} domain={SITE_DOMAIN} />;
    }
  }
  return (
    <Suspense>
      <Terra />
    </Suspense>
  );
}
