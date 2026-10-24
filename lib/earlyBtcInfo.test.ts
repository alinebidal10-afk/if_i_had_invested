import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async (v: string | undefined) => {
  vi.resetModules();
  if (v === undefined) vi.stubEnv('EARLY_BTC_ENABLED', undefined as unknown as string);
  else vi.stubEnv('EARLY_BTC_ENABLED', v);
  return { info: await import('./earlyBtcInfo'), data: await import('./btcEarly') };
};
const yahoo = [{ t: Date.parse('2014-09-17T00:00:00Z'), p: 457 }];

describe('EARLY_BTC_ENABLED', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is on by default: early prices merged, source credited', async () => {
    const { info, data } = await load(undefined);
    expect(info.usesEarlyBtc(['BTC-USD'], '2012-01-01')).toBe(true);
    expect(data.withEarlyBtc('BTC-USD', '2012-01-01', yahoo).length).toBeGreaterThan(900);
  });
  it.each(['false', 'FALSE', '0', 'off', 'no'])('%s removes the prices and the credit', async (v) => {
    const { info, data } = await load(v);
    expect(info.EARLY_BTC_ENABLED).toBe(false);
    expect(info.usesEarlyBtc(['BTC-USD'], '2012-01-01')).toBe(false);
    expect(data.withEarlyBtc('BTC-USD', '2012-01-01', yahoo)).toBe(yahoo);
  });
  it('true keeps them', async () => {
    const { info } = await load('true');
    expect(info.EARLY_BTC_ENABLED).toBe(true);
  });
});
