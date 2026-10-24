import { tierOf } from './assets';
import type { Quote } from './types';

export function freshness(q: Quote, ticked: boolean): { label: string; live: boolean } {
  const tier = tierOf(q.symbol, q.kind);
  if (tier === 'daily') return { label: 'Priced once a day', live: false };
  if (q.kind !== 'crypto') {
    if (q.state === 'CLOSED') return { label: 'Market closed', live: false };
    if (q.state === 'PRE') return { label: 'Pre-market', live: false };
    if (q.state === 'POST') return { label: 'After hours', live: false };
  }
  if (tier === 'tick' && ticked) return { label: 'Live', live: true };
  if (q.delay > 0) return { label: `Delayed ${q.delay} min`, live: false };
  return { label: 'Updates every 5 s', live: false };
}
