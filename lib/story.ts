// URL options for story (recording) mode. Pure, so the rules can be tested without a browser.
// Every value is validated here; anything malformed is dropped as if it were absent.
import { MIN_DATE, parseAmount } from './parse';

export const STORY_MAX_ASSETS = 4;
export const TITLE_MAX = 90;
export const HOLD_MS = 2000; // the final frame stays on screen this long before the run counts as done
const DURATION_MIN = 5;
const DURATION_MAX = 180;

export type StoryOpts = {
  story: boolean; // ?mode=story
  autoplay: boolean; // ?autoplay=1
  durationS: number | null; // ?duration=25: the whole run, final hold included
  asOf: string | null; // ?asOf=YYYY-MM-DD: "today" frozen, no live quotes
  hide: boolean; // ?hide=1: the final value stays blurred until the last second
  title: string; // ?title=...: a headline above the sentence
};

type Get = (key: string) => string | null | undefined;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const flag = (v: string | null | undefined) => v === '1' || v === 'true';

export function validIso(v: string | null | undefined, today: string): string | null {
  if (!v || !ISO.test(v)) return null;
  const t = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== v) return null;
  return v >= MIN_DATE && v <= today ? v : null;
}

// Plain text only: control characters out, whitespace collapsed, at most TITLE_MAX characters.
// React escapes it when rendering; nothing here is ever treated as markup.
export function cleanTitle(v: string | null | undefined): string {
  if (!v) return '';
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...t].slice(0, TITLE_MAX).join('').trim();
}

export function parseStoryOpts(get: Get, today = new Date().toISOString().slice(0, 10)): StoryOpts {
  const d = Number(get('duration'));
  return {
    story: get('mode') === 'story',
    autoplay: flag(get('autoplay')),
    durationS: Number.isFinite(d) && d > 0 ? Math.min(DURATION_MAX, Math.max(DURATION_MIN, d)) : null,
    asOf: validIso(get('asOf'), today),
    hide: flag(get('hide')),
    title: cleanTitle(get('title')),
  };
}

// The playback part of a run, given the whole length the URL asked for: the hold comes out of it.
export const playMsFor = (durationS: number) => durationS * 1000 - HOLD_MS;

// Units and money typed into a URL: "10000", "10k", "$41".
export const parsePositive = (v: string | null | undefined) => (v ? parseAmount(v) : null);
