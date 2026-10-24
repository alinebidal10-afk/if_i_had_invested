import { describe, expect, it } from 'vitest';
import { resolveScenario, scenarioQuery, sentenceOf, startOf, symbolsFrom } from './scenario';

const today = '2026-10-24';
const get = (q: string) => {
  const sp = new URLSearchParams(q);
  return (k: string) => sp.get(k);
};
const r = (q: string, max?: number) => resolveScenario(get(q), max, today);
const day = (iso: string) => Date.parse(iso + 'T00:00:00Z');

describe('resolveScenario', () => {
  it('reads an old link unchanged', () => {
    expect(r('assets=BTC-USD,AAPL,NVDA&date=2015-01-01&amount=1000')).toEqual({ symbols: ['BTC-USD', 'AAPL', 'NVDA'], iso: '2015-01-01', amount: 1000, units: null, paid: null, preset: null });
  });
  it('caps the asset count', () => {
    expect(r('assets=A,B,C,D,E&date=2015-01-01&amount=1', 4)?.symbols).toEqual(['A', 'B', 'C', 'D']);
  });
  it('takes units over amount, for one asset', () => {
    const s = r('assets=BTC-USD,AAPL&date=2010-05-22&units=10000&paid=41&amount=5');
    expect(s).toMatchObject({ symbols: ['BTC-USD'], amount: null, units: 10000, paid: 41 });
  });
  it('ignores paid without units', () => {
    expect(r('assets=AAPL&date=2010-05-22&amount=5&paid=41')?.paid).toBe(null);
  });
  it('fills a preset, and lets assets override its ticker', () => {
    expect(r('preset=iphone-2007')).toMatchObject({ symbols: ['AAPL'], iso: '2007-06-29', amount: 499 });
    expect(r('preset=iphone-2007&assets=SPY,QQQ&date=2020-01-01&amount=9')).toMatchObject({ symbols: ['SPY', 'QQQ'], iso: '2007-06-29', amount: 499 });
  });
  it('refuses junk', () => {
    expect(r('preset=nope')).toBe(null);
    expect(r('preset=../../etc')).toBe(null);
    expect(r('assets=<b>&date=2015-01-01&amount=1')).toBe(null);
    expect(r('assets=AAPL&date=1975-01-01&amount=1')).toBe(null);
    expect(r('assets=AAPL&date=2015-01-01&amount=-1')).toBe(null);
    expect(r('assets=AAPL&date=2015-01-01&units=abc')).toBe(null);
  });
});

describe('sentenceOf', () => {
  it('has one wording per format', () => {
    expect(sentenceOf(r('assets=BTC-USD&date=2010-05-22&units=10000&paid=41')!)).toBe('If I had kept 10,000 BTC from May 2010.');
    expect(sentenceOf(r('assets=AAPL&date=2010-05-03&units=1')!)).toBe('If I had kept 1 share of Apple from May 2010.');
    expect(sentenceOf(r('preset=iphone-2007')!)).toBe('Instead of buying the first iPhone for $499 in Jun 2007, I bought Apple.');
    expect(sentenceOf(r('assets=AAPL,NVDA&date=2015-01-01&amount=1000')!)).toBe('If I had invested $1,000 on Jan 1, 2015 in Apple and NVIDIA.');
  });
});

describe('startOf', () => {
  const pts = [
    { t: day('2010-07-18'), p: 0.08 },
    { t: day('2010-07-19'), p: 0.09 },
  ];
  it('uses paid only when the market has no price that week', () => {
    const s = startOf(r('assets=BTC-USD&date=2010-05-22&units=10000&paid=41')!, pts)!;
    expect(s.implied).toBe(true);
    expect(s.qty * s.buy.p).toBeCloseTo(41);
    expect(s.points[0]).toEqual({ t: day('2010-05-22'), p: 0.0041 });
  });
  it('never invents a price without paid', () => {
    expect(startOf(r('assets=BTC-USD&date=2010-05-22&units=10000')!, pts)).toBe(null);
    expect(startOf(r('assets=BTC-USD&date=2010-05-22&amount=100')!, pts)).toBe(null);
  });
  it('prefers the market price when there is one', () => {
    const s = startOf(r('assets=BTC-USD&date=2010-07-17&units=10&paid=999')!, pts)!;
    expect(s).toMatchObject({ implied: false, qty: 10, buy: pts[0] });
  });
});

it('round-trips through the query string', () => {
  for (const q of ['assets=AAPL&date=2015-01-01&amount=1000', 'assets=BTC-USD&date=2010-05-22&units=10000&paid=41', 'assets=AAPL&preset=iphone-2007']) {
    const s = r(q)!;
    expect(r(scenarioQuery(s).toString())).toEqual(s);
  }
  expect(symbolsFrom(' aapl , AAPL,nvda')).toEqual(['AAPL', 'NVDA']);
});
