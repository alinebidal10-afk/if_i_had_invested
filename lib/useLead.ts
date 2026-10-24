'use client';
import { useEffect, useRef, useState } from 'react';

export type LeadMark = { t: number; symbol: string };

const MARGIN = 1.02; // a new leader must be 2% ahead, so two lines running side by side do not flicker
const GAP_MS = 1200; // and the call is not made again within this long

// Who is ahead in a race, and when the lead changed. `t` is the playhead; a step back means a new run.
export function useLead(values: { symbol: string; value: number | null }[], t: number, running: boolean) {
  const [lead, setLead] = useState<string | null>(null);
  const [marks, setMarks] = useState<LeadMark[]>([]);
  const [flash, setFlash] = useState<{ symbol: string; n: number } | null>(null);
  const st = useRef({ lead: null as string | null, lastT: -Infinity, at: 0, n: 0 });

  const ranked = values.filter((v): v is { symbol: string; value: number } => v.value !== null).sort((a, b) => b.value - a.value);
  const top = ranked[0];
  const holder = st.current.lead ? ranked.find((v) => v.symbol === st.current.lead) : undefined;

  useEffect(() => {
    const S = st.current;
    if (t < S.lastT) {
      S.lead = null;
      setMarks([]);
      setFlash(null);
    }
    S.lastT = t;
    if (values.length < 2 || !top) return;
    if (!S.lead || !holder) {
      S.lead = top.symbol;
      setLead(top.symbol);
      return;
    }
    if (top.symbol === S.lead || top.value < holder.value * MARGIN) return;
    S.lead = top.symbol;
    setLead(top.symbol);
    const now = performance.now();
    if (!running || now - S.at < GAP_MS) return;
    S.at = now;
    setMarks((m) => [...m, { t, symbol: top.symbol }]);
    setFlash({ symbol: top.symbol, n: ++S.n });
  });

  return { lead: values.length > 1 ? lead : null, marks, flash };
}
