'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { durationMs, effectivePace, spanYears } from './pace';

export const SPEEDS = [0.5, 1, 2, 4] as const;
const SPEED_KEY = 'terra.speed';

const readSpeed = () => {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
};

// The replay clock. `progress` (0..1 of the span) is integrated from frame times, so a speed change
// only changes the rate: the playhead date never jumps. React sees `playT` about 30 times a second;
// the chart reads `progress` directly every frame.
export function usePlayback({ on, t0, tEnd, instant }: { on: boolean; t0: number; tEnd: number; instant: boolean }) {
  const progress = useRef(0);
  const speedRef = useRef(1);
  const [speed, setSpeedState] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playT, setPlayT] = useState(t0);

  const years = spanYears(t0, tEnd);
  const baseMs = durationMs(years, 1);

  // The saved speed, read after mount so the server and first client render agree.
  useEffect(() => {
    const s = readSpeed();
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s; // takes effect on the next frame, from the current playhead
    setSpeedState(s);
    try {
      localStorage.setItem(SPEED_KEY, String(s));
    } catch {
      /* the speed just resets next visit */
    }
  }, []);

  const finish = useCallback(() => {
    progress.current = 1;
    setPlayT(tEnd);
    setPlaying(false);
    setEnded(true);
  }, [tEnd]);

  const replay = useCallback(() => {
    progress.current = 0;
    setPlayT(t0);
    setEnded(false);
    setPlaying(true);
  }, [t0]);

  // A new run begins when the prices are in (`on`), or stops when the result is left.
  useEffect(() => {
    if (!on || !(tEnd > t0)) {
      progress.current = 0;
      setPlaying(false);
      setEnded(false);
      setPlayT(t0);
      return;
    }
    if (instant) finish();
    else replay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, t0, tEnd]);

  const pause = useCallback(() => setPlaying(false), []);
  const resume = useCallback(() => {
    if (progress.current >= 1) replay();
    else setPlaying(true);
  }, [replay]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    const tick = (now: number) => {
      progress.current = Math.min(1, progress.current + ((now - last) * speedRef.current) / baseMs);
      last = now;
      if (progress.current >= 1) return finish();
      if (now - lastPaint > 33) {
        lastPaint = now;
        setPlayT(t0 + progress.current * (tEnd - t0));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, baseMs, t0, tEnd, finish]);

  return { progress, playT, playing, ended, speed, setSpeed, pause, resume, replay, years, pace: effectivePace(years, speed) };
}
