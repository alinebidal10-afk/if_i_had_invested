import { describe, expect, it } from 'vitest';
import { shareText, shareUrl } from './share';

describe('shareText', () => {
  it('one asset reads as a sentence', () => {
    expect(shareText(100, '2000-01-03', [{ symbol: 'AAPL', available: true, value: 4321.5, buyIso: '2000-01-03' }])).toBe(
      'If I had invested $100 in Apple on Jan 3, 2000, it would be worth $4,321.50 today.',
    );
  });

  it('several assets list each value', () => {
    const t = shareText(100, '2000-01-03', [
      { symbol: 'AAPL', available: true, value: 10, buyIso: '2000-01-03' },
      { symbol: 'BTC-USD', available: true, value: 20, buyIso: '2000-01-03' },
    ]);
    expect(t).toBe('If I had invested $100 on Jan 3, 2000: Apple → $10.00, Bitcoin → $20.00.');
  });

  it('is honest about a later start and about no price', () => {
    const t = shareText(100, '2014-09-01', [
      { symbol: 'AAPL', available: true, value: 10, buyIso: '2014-09-02' },
      { symbol: 'BTC-USD', available: true, value: 20, buyIso: '2014-09-17' },
      { symbol: 'GC=F', available: false, value: null, buyIso: null },
    ]);
    expect(t).toContain('Bitcoin (from Sep 17, 2014) → $20.00');
    expect(t).toContain('Gold (no price on that date)');
    expect(t).toContain('Apple → $10.00');
  });
});

describe('shareUrl', () => {
  it('builds an absolute link from the same state as the page URL', () => {
    expect(shareUrl(['AAPL', 'BTC-USD'], '2020-01-01', 2500, 'https://x.test/')).toBe('https://x.test/?assets=AAPL%2CBTC-USD&date=2020-01-01&amount=2500');
  });
});
