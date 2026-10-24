// Renders story videos from scenario files.
//
//   npm run render                         every scenarios/*.json
//   npm run render -- scenarios/example.json --only pizza-2010
//   RENDER_BASE=https://ifihadinvested1.com npm run render
//
// Each scenario is { id, url, account, notes }. The URL is opened with mode=story&autoplay=1 (and asOf, so the
// numbers never drift) in a 1080×1920 viewport (the story view zooms its phone layout to fill it). It waits for
// window.__playbackDone, then writes out/<id>.mp4 (cut from the first still frame to the end of the final hold)
// and out/<id>.png (the link's preview image). Needs the site running at RENDER_BASE (default localhost:3000).
// Without ffmpeg on the PATH it keeps the raw out/<id>.webm instead.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

type Scenario = { id: string; url: string; account?: string; notes?: string };

const BASE = (process.env.RENDER_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT = 'out';
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/; // the id becomes a file name
const VIEW = { width: 1080, height: 1920 }; // the video's own size: the recorder captures CSS pixels
const LEAD_IN_S = 0.1; // a few frames before the first still frame, so the cut never lands mid-fade

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const files = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--only');
const inputs = files.length ? files : readdirSync('scenarios').filter((f) => f.endsWith('.json')).map((f) => join('scenarios', f));

function load(file: string): Scenario[] {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${file}: expected an array of scenarios`);
  for (const s of list) {
    if (!s || typeof s.id !== 'string' || !ID.test(s.id)) throw new Error(`${file}: bad id ${JSON.stringify(s?.id)}`);
    if (typeof s.url !== 'string') throw new Error(`${file}: ${s.id} has no url`);
  }
  return list;
}

// The scenario's link, forced into recording mode. asOf defaults to yesterday (UTC), and the log says so.
function storyUrl(raw: string): { url: URL; asOfAdded: string | null } {
  const url = new URL(raw, BASE + '/');
  const base = new URL(BASE);
  url.protocol = base.protocol;
  url.host = base.host;
  url.searchParams.set('mode', 'story');
  url.searchParams.set('autoplay', '1');
  let asOfAdded: string | null = null;
  if (!url.searchParams.get('asOf')) {
    asOfAdded = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    url.searchParams.set('asOf', asOfAdded);
  }
  return { url, asOfAdded };
}

const which = (cmd: string) => {
  try {
    return execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
};
const FFMPEG = which('ffmpeg');
const FFPROBE = which('ffprobe');

const probe = (file: string) =>
  FFPROBE ? Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()) : NaN;

async function render(s: Scenario, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const { url, asOfAdded } = storyUrl(s.url);
  const tmp = join(OUT, `.tmp-${s.id}`);
  rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    recordVideo: { dir: tmp, size: VIEW },
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  const t0 = Date.now(); // the video starts with the page
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__storyReady || window.__storyError, null, { timeout: 60_000 });
    const failed = await page.evaluate(() => window.__storyError);
    if (failed) throw new Error(failed);
    await page.waitForFunction(() => window.__playbackDone, null, { timeout: 300_000, polling: 100 });
    const { ready, done } = await page.evaluate(() => ({ ready: window.__storyReady!, done: window.__playbackDoneAt! }));
    const video = page.video();
    await ctx.close(); // flushes the video
    const raw = await video!.path();

    const start = Math.max(0, (ready - t0) / 1000 - LEAD_IN_S);
    const length = (done - ready) / 1000 + LEAD_IN_S;
    let file: string;
    if (FFMPEG) {
      file = join(OUT, `${s.id}.mp4`);
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', start.toFixed(3), '-i', raw, '-t', length.toFixed(3), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file]);
    } else {
      file = join(OUT, `${s.id}.webm`);
      renameSync(raw, file);
    }

    // The preview image of the same link (story options are ignored by the image route).
    const og = await fetch(`${BASE}/api/og?${url.searchParams}`);
    if (!og.ok) throw new Error(`preview image: HTTP ${og.status}`);
    writeFileSync(join(OUT, `${s.id}.png`), Buffer.from(await og.arrayBuffer()));

    return { id: s.id, file, mb: statSync(file).size / 1e6, seconds: probe(file), png: join(OUT, `${s.id}.png`), asOfAdded, errors };
  } finally {
    await ctx.close().catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const scenarios = inputs.flatMap(load).filter((s) => !only || s.id === only);
  if (!scenarios.length) throw new Error('no scenarios to render');
  if (!FFMPEG) console.warn('ffmpeg not found on the PATH: keeping .webm files, not trimmed.');
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const s of scenarios) {
      process.stdout.write(`${s.id} … `);
      try {
        const r = await render(s, browser);
        console.log(`${r.file} ${r.mb.toFixed(1)} MB ${Number.isFinite(r.seconds) ? r.seconds.toFixed(1) + ' s' : ''} · ${r.png}${r.asOfAdded ? ` · asOf=${r.asOfAdded} added` : ''}${r.errors.length ? ` · page errors: ${r.errors.join('; ')}` : ''}`);
      } catch (e) {
        failed++;
        console.log(`FAILED: ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exitCode = 1;
}

declare global {
  interface Window {
    __storyReady?: number;
    __playbackDone?: boolean;
    __playbackDoneAt?: number;
    __storyError?: string;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
