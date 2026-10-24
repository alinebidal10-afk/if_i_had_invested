import type { Metadata } from 'next';
import { Suspense } from 'react';
import Story from '../components/Story';
import Terra from '../components/Terra';
import { listNames } from '../lib/assets';
import { formatAmount, formatDate } from '../lib/parse';
import { redirect } from 'next/navigation';
import { resolveScenario, scenarioQuery, sentenceOf } from '../lib/scenario';
import { SITE_DOMAIN } from '../lib/site';
import { parseStoryOpts, STORY_MAX_ASSETS } from '../lib/story';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// A shared link carries the whole comparison, so its preview can too. The image route reads the same params.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const get = (k: string) => first(sp[k]) || null;
  const s = resolveScenario(get);
  if (!s) return {};
  const opts = parseStoryOpts(get);

  const plain = !s.units && !s.preset;
  const title = opts.title || (plain ? `${formatAmount(s.amount ?? 0)} in ${listNames(s.symbols)} since ${formatDate(s.iso, 'day')}` : sentenceOf(s).replace(/\.$/, ''));
  const description = plain ? `If I had invested ${formatAmount(s.amount ?? 0)} on ${formatDate(s.iso, 'day')} in ${listNames(s.symbols)}, what would it be worth today?` : `${sentenceOf(s)} What would it be worth today?`;
  const image = `/api/og?${scenarioQuery(s, { title: opts.title, asOf: opts.asOf })}`;
  return {
    title,
    description,
    openGraph: { type: 'website', title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const get = (k: string) => first(sp[k]) || null;
  const opts = parseStoryOpts(get);
  if (opts.story) {
    // Same rules as a shared link, at most four assets: the 9:16 frame has room for a four-way race.
    const scenario = resolveScenario(get, STORY_MAX_ASSETS);
    if (scenario) return <Story scenario={scenario} opts={opts} domain={SITE_DOMAIN} />;
  } else if (first(sp.preset)) {
    // The page itself has no "Instead of buying" sentence: a preset opens as the plain comparison it stands for.
    const s = resolveScenario(get);
    if (s?.preset) redirect(`/?${scenarioQuery({ ...s, preset: null })}`);
  }
  return (
    <Suspense>
      <Terra />
    </Suspense>
  );
}
