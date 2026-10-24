import { describe, expect, it } from 'vitest';
import { cleanTitle, parseStoryOpts, playMsFor, TITLE_MAX, validIso } from './story';

const opts = (q: string) => {
  const sp = new URLSearchParams(q);
  return parseStoryOpts((k) => sp.get(k), '2026-10-24');
};

describe('parseStoryOpts', () => {
  it('reads every option', () => {
    expect(opts('mode=story&autoplay=1&duration=25&asOf=2025-06-30&hide=1&title=Hi')).toEqual({
      story: true,
      autoplay: true,
      durationS: 25,
      asOf: '2025-06-30',
      hide: true,
      title: 'Hi',
    });
  });
  it('defaults to off when absent', () => {
    expect(opts('')).toEqual({ story: false, autoplay: false, durationS: null, asOf: null, hide: false, title: '' });
  });
  it('drops malformed values', () => {
    const o = opts('mode=STORY&autoplay=yes&duration=abc&asOf=2025-02-30&hide=2');
    expect(o).toEqual({ story: false, autoplay: false, durationS: null, asOf: null, hide: false, title: '' });
  });
  it('clamps the duration', () => {
    expect(opts('duration=1').durationS).toBe(5);
    expect(opts('duration=9999').durationS).toBe(180);
    expect(opts('duration=-3').durationS).toBe(null);
  });
  it('refuses a future or pre-1980 asOf', () => {
    expect(opts('asOf=2027-01-01').asOf).toBe(null);
    expect(opts('asOf=1979-12-31').asOf).toBe(null);
    expect(opts('asOf=2026-10-24').asOf).toBe('2026-10-24');
  });
});

describe('cleanTitle', () => {
  it('keeps text as text and caps the length', () => {
    expect(cleanTitle('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); // escaped by React, never parsed
    expect(cleanTitle('a\n\tb‮ c')).toBe('a b c');
    expect([...cleanTitle('x'.repeat(200))].length).toBe(TITLE_MAX);
    expect(cleanTitle('   ')).toBe('');
  });
});

describe('validIso', () => {
  it('needs a real calendar day', () => {
    expect(validIso('2024-02-29', '2026-01-01')).toBe('2024-02-29');
    expect(validIso('2023-02-29', '2026-01-01')).toBe(null);
    expect(validIso('2024-2-1', '2026-01-01')).toBe(null);
  });
});

it('takes the final hold out of the requested length', () => {
  expect(playMsFor(25)).toBe(23000);
});
