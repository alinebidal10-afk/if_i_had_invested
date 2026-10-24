'use client';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { KIND_LABEL, MAX_ASSETS, POPULAR, assetLabel } from '../lib/assets';
import { isCompleteDate, monthLabel, parseAmount } from '../lib/parse';
import type { AssetInfo } from '../lib/types';

export type SlotName = 'amount' | 'date' | 'assets';
type Flags = Record<SlotName, boolean>;
type SlotState = 'idle' | 'focus' | 'valid' | 'invalid';
type Caret = 'start' | 'end' | 'all' | number;

// A request from the result screen: focus this blank (and, for assets, pull this one back to text).
export type EditRequest = { n: number; slot: SlotName; symbol?: string };

export type SentenceProps = {
  locked: boolean; // the graph is playing: the sentence is a read-only header
  committed: boolean; // every underline collapses to solid
  amountText: string;
  dateText: string;
  picked: AssetInfo[];
  valid: Flags;
  invalid: Flags;
  shake: Record<SlotName, number>;
  hint: string;
  canStart: boolean;
  refs: Record<SlotName, RefObject<HTMLInputElement | null>>;
  editRequest: EditRequest;
  onAmountText: (v: string) => void;
  onDateText: (v: string) => void;
  onPicked: (v: AssetInfo[]) => void; // assets changed, nothing starts
  onBlurSlot: (slot: SlotName) => void;
  onCommitField: (slot: 'amount' | 'date') => boolean; // format + mark touched; false if the text is not valid
  onFinish: () => void; // Enter in the asset blank with nothing left to resolve
  onEscape: () => boolean; // true if it took the key (back to the result screen)
  onPick: (next: AssetInfo[]) => void; // an asset was chosen from the list: a commit that may start playback
  onDatePick: (text: string) => void; // a month was chosen in the popover: a commit
  onStart: () => void;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const GHOSTS: Record<SlotName, string[]> = {
  amount: ['100', '1,000', '10,000'],
  date: ['Jan 2000', 'Mar 2009', 'Nov 2020'],
  assets: ['Apple', 'Bitcoin', 'Gold', 'S&P 500'],
};
// The three blanks flip on different beats, never together.
const STAGGER: Record<SlotName, number> = { amount: 0, date: 730, assets: 1460 };

// "space →" only appears once a complete value has sat untouched this long.
const IDLE_MS = 3000;

// "Applovin Corporation" reads as "Applovin" in a sentence; a name with no commas also survives being typed back.
const shortName = (name: string) => name.replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Ltd\.?|Limited|Co\.?|Company|Holdings?|PLC|N\.V\.|S\.A\.)$/i, '').trim();
const displayName = (a: AssetInfo) => POPULAR.find((x) => x.symbol === a.symbol)?.name ?? (a.name && a.name !== a.symbol ? shortName(a.name) : assetLabel(a.symbol));
const prefixMatch = (a: AssetInfo, q: string) => {
  const s = q.toLowerCase();
  return a.name.toLowerCase().startsWith(s) || a.symbol.toLowerCase().startsWith(s);
};
const fetchSearch = async (q: string): Promise<AssetInfo[]> => {
  try {
    return await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
  } catch {
    return []; // an empty list reads as "No matches"
  }
};

// Where in a word's text a click landed, so the caret can go to the same place in the input.
function caretInWord(e: MouseEvent<HTMLElement>, length: number): number {
  const d = document as unknown as {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = length;
  if (d.caretPositionFromPoint) {
    const pos = d.caretPositionFromPoint(e.clientX, e.clientY);
    node = pos?.offsetNode ?? null;
    offset = pos?.offset ?? length;
  } else if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(e.clientX, e.clientY);
    node = r?.startContainer ?? null;
    offset = r?.startOffset ?? length;
  }
  return node && node.nodeType === 3 && e.currentTarget.contains(node) ? Math.min(offset, length) : length;
}

// ── one blank's underline, shake and settle ───────────────────────────────
function Slot({ name, state, committed, shakeKey, onClick, children }: { name: SlotName; state: SlotState; committed: boolean; shakeKey: number; onClick?: (e: MouseEvent<HTMLElement>) => void; children: ReactNode }) {
  const reduced = useReducedMotion();
  const slot = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const prev = useRef<SlotState>(state);

  useEffect(() => {
    if (shakeKey && slot.current && !reduced) animate(slot.current, { x: [0, -6, 6, -6, 6, 0] }, { duration: 0.24 });
  }, [shakeKey, reduced]);

  useEffect(() => {
    if (state === 'valid' && prev.current !== 'valid' && line.current && !reduced) {
      animate(line.current, { scaleY: [1, 1.6, 1] }, { duration: 0.26, ease: EASE });
    }
    prev.current = state;
  }, [state, reduced]);

  return (
    <span ref={slot} className="slot" data-slot={name} data-state={state} data-committed={committed} onClick={onClick}>
      {children}
      <span ref={line} className="uline" aria-hidden="true">
        <i className="base" />
        <i className="sheen" />
        <i className="focus" />
      </span>
    </span>
  );
}

// ── a text input that is exactly as wide as what it shows ─────────────────
type AutoProps = {
  value: string;
  onChange: (v: string) => void;
  ghosts: string[];
  tail: string; // faint hint text after the caret; display only, never inserted
  stagger: number;
  paused: boolean;
  label: string;
  inputRef: RefObject<HTMLInputElement | null>;
  inputMode?: 'decimal' | 'text';
  enterKeyHint: 'next' | 'go';
  readOnly: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onTextInsert: (data: string) => boolean; // true: the typed text was handled, do not insert it
  controls?: string;
};

function AutoInput({ value, onChange, ghosts, tail, stagger, paused, label, inputRef, inputMode, enterKeyHint, readOnly, onFocus, onBlur, onKeyDown, onTextInsert, controls }: AutoProps) {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [w, setW] = useState<number>();
  const mirror = useRef<HTMLSpanElement>(null);
  const ghost = ghosts[idx % ghosts.length] ?? '';
  const showGhost = !value && !tail && !!ghost;

  // Idle ghosts roll through their examples; everything stops while any blank has focus.
  useEffect(() => {
    if (value || paused || reduced || ghosts.length < 2) return;
    let iv = 0;
    const first = window.setTimeout(() => {
      setIdx((i) => i + 1);
      iv = window.setInterval(() => setIdx((i) => i + 1), 2200);
    }, 1100 + stagger);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [value, paused, reduced, ghosts.length, stagger]);

  const measure = useCallback(() => {
    if (mirror.current) setW(mirror.current.offsetWidth + 3);
  }, []);
  useLayoutEffect(measure, [value, ghost, tail, measure]);
  useEffect(() => {
    document.fonts?.ready.then(measure);
  }, [measure]);

  // Space and comma are decided before they reach the field. A native beforeinput listener, not a
  // keydown: Android keyboards report Space as keyCode 229 ("Unidentified") but still send beforeinput.
  const insert = useRef(onTextInsert);
  useEffect(() => {
    insert.current = onTextInsert;
  });
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const on = (ev: Event) => {
      const be = ev as InputEvent;
      if (be.inputType === 'insertText' && be.data && insert.current(be.data)) ev.preventDefault();
    };
    el.addEventListener('beforeinput', on);
    return () => el.removeEventListener('beforeinput', on);
  }, [inputRef]);

  return (
    <span className="auto" style={{ width: w }}>
      <span ref={mirror} className="mirror" aria-hidden="true">
        {value || (!tail && ghost) || ' '}
        {tail}
      </span>
      {showGhost && (
        <span className="ghost" aria-hidden="true">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ghost}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.45, ease: EASE }}
            >
              {ghost}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
      {tail && (
        <span className="tail" aria-hidden="true">
          <span className="pad">{value}</span>
          {tail}
        </span>
      )}
      <input
        ref={inputRef}
        value={value}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : 0}
        aria-label={label}
        aria-controls={controls}
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </span>
  );
}

// ── the date popover: a year grid, then a month grid ──────────────────────
function DatePop({ onPick }: { onPick: (text: string) => void }) {
  const [year, setYear] = useState<number | null>(null);
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth();
  const years = Array.from({ length: thisYear - 1980 + 1 }, (_, i) => thisYear - i);
  return (
    <div className="drop pop" onMouseDown={(e) => e.preventDefault()}>
      {year === null ? (
        <>
          <p className="drophead">Pick a year, or just type one</p>
          <div className="grid years">
            {years.map((y) => (
              <button type="button" key={y} tabIndex={-1} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="drophead">
            <button type="button" tabIndex={-1} onClick={() => setYear(null)}>
              ‹ {year}
            </button>
          </p>
          <div className="grid months">
            {Array.from({ length: 12 }, (_, m) => (
              <button type="button" key={m} tabIndex={-1} disabled={year === thisYear && m > thisMonth} onClick={() => onPick(`${monthLabel(m)} ${year}`)}>
                {monthLabel(m)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── the sentence ──────────────────────────────────────────────────────────
export default function Sentence(p: SentenceProps) {
  const [focused, setFocused] = useState<SlotName | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetInfo[]>([]);
  const [resultsFor, setResultsFor] = useState('');
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [idle, setIdle] = useState(false);
  const [poke, setPoke] = useState(0); // any key in a field counts as activity
  const [localHint, setLocalHint] = useState('');
  const [unresolved, setUnresolved] = useState(false);
  const full = p.picked.length >= MAX_ASSETS;

  const caretReq = useRef<Caret | null>(null); // where to put the caret once the asset text has rendered
  const pulled = useRef<{ label: string; asset: AssetInfo } | null>(null); // an asset taken back to text, so it re-commits to itself
  const busy = useRef(false);

  const q = query.trim();
  const stateOf = (s: SlotName): SlotState => (p.invalid[s] || (s === 'assets' && unresolved) ? 'invalid' : focused === s ? 'focus' : p.valid[s] ? 'valid' : 'idle');

  useEffect(() => {
    if (!query.trim()) {
      setSearching(false);
      setResultsFor('');
      return setResults([]);
    }
    setSearching(true);
    let stale = false;
    const text = query.trim();
    const id = setTimeout(async () => {
      const found = await fetchSearch(text);
      if (!stale) {
        setResults(found);
        setResultsFor(text);
        setSearching(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [query]);

  // Popular assets that match the prefix come first ("app" completes to Apple), then the search results;
  // while the search is in flight, or if it fails, the popular list answers alone.
  const near = q ? POPULAR.filter((a) => prefixMatch(a, q)) : POPULAR;
  const found = q && resultsFor === q ? results.filter((r) => !near.some((n) => n.symbol === r.symbol)) : [];
  const options = [...near, ...found].filter((a) => !p.picked.some((x) => x.symbol === a.symbol));
  const top = options[active] ?? options[0];

  // ── faint hints after the caret: display only, never inserted ──
  const topName = top ? displayName(top) : '';
  const completion = focused === 'assets' && query && topName.toLowerCase().startsWith(query.toLowerCase()) && topName.length > query.length ? topName.slice(query.length) : '';
  const addAnother = focused === 'assets' && p.picked.length >= 1 && !full && !completion ? (query ? ' + another' : '+ another') : '';
  const spaceReady = focused === 'amount' ? parseAmount(p.amountText) !== null : focused === 'date' ? isCompleteDate(p.dateText) : false;
  const advance = idle && spaceReady ? ' space →' : '';

  // Any typing, a new focus, or leaving hides the hint and restarts the clock.
  useEffect(() => {
    setIdle(false);
    if (!spaceReady) return;
    const id = setTimeout(() => setIdle(true), IDLE_MS);
    return () => clearTimeout(id);
  }, [focused, spaceReady, p.amountText, p.dateText, poke]);

  const go = useCallback(
    (slot: SlotName, at: Caret) => {
      const el = p.refs[slot].current;
      if (!el) return;
      el.focus();
      if (at === 'all') el.select();
      else {
        const i = at === 'start' ? 0 : at === 'end' ? el.value.length : Math.min(at, el.value.length);
        el.setSelectionRange(i, i);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Put the caret where a pulled-back asset asked, after its text is in the field.
  useLayoutEffect(() => {
    const at = caretReq.current;
    if (at === null) return;
    caretReq.current = null;
    go('assets', at);
  });

  // Take a committed asset back into the field as plain editable text.
  const pull = (a: AssetInfo, at: Caret) => {
    const label = displayName(a);
    pulled.current = { label, asset: a };
    caretReq.current = at;
    p.onPicked(p.picked.filter((x) => x.symbol !== a.symbol));
    setQuery(label);
    setActive(0);
    setUnresolved(false);
    setLocalHint('');
    setMenuOpen(true);
    p.refs.assets.current?.focus();
  };

  // The result screen asked for a blank: focus it with its text selected (an asset comes back as text).
  useEffect(() => {
    const r = p.editRequest;
    if (!r.n) return;
    if (r.slot === 'assets') {
      const a = r.symbol ? p.picked.find((x) => x.symbol === r.symbol) : undefined;
      if (a) pull(a, 'all');
      else go('assets', 'end');
      return;
    }
    go(r.slot, 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editRequest.n]);

  // Turn the typed segment into an asset: the highlighted suggestion, else the first search hit.
  const resolveSegment = async (): Promise<AssetInfo | null> => {
    const back = pulled.current;
    if (back && back.label.toLowerCase() === q.toLowerCase()) return back.asset;
    if (options.length) return top ?? null;
    const found = (await fetchSearch(q)).filter((a) => !p.picked.some((x) => x.symbol === a.symbol));
    return found[0] ?? null;
  };

  const commitSegment = async (startAfter: boolean) => {
    if (!q || busy.current) return;
    if (full) {
      setLocalHint('Up to 5 assets');
      setMenuOpen(false);
      return;
    }
    busy.current = true;
    const a = await resolveSegment();
    busy.current = false;
    if (!a) {
      setUnresolved(true);
      setLocalHint(`No match for “${q}”`);
      setMenuOpen(false);
      return;
    }
    pulled.current = null;
    setQuery('');
    setActive(0);
    setUnresolved(false);
    setLocalHint('');
    setMenuOpen(startAfter ? false : true);
    if (startAfter) p.onPick([...p.picked, a]);
    else p.onPicked([...p.picked, a]);
  };

  // A click or tap on a suggestion commits it and starts at once.
  const pick = (a: AssetInfo) => {
    if (full) return;
    pulled.current = null;
    setQuery('');
    setActive(0);
    setUnresolved(false);
    setLocalHint('');
    setMenuOpen(false);
    p.onPick([...p.picked, a]);
  };

  const acceptCompletion = () => {
    setQuery(topName);
    setUnresolved(false);
    caretReq.current = 'end';
  };

  const focusProps = (slot: SlotName) => ({
    onFocus: () => {
      setFocused(slot);
      if (slot === 'date') setPopOpen(true);
      if (slot === 'assets') setMenuOpen(true);
    },
    onBlur: () => {
      setFocused((f) => (f === slot ? null : f));
      if (slot === 'date') setTimeout(() => setPopOpen(false), 120);
      if (slot === 'assets') setTimeout(() => setMenuOpen(false), 120);
      p.onBlurSlot(slot);
    },
  });

  // Space and comma: the only typed characters that are ever intercepted.
  const inserts = (slot: SlotName) => (data: string): boolean => {
    if (slot === 'amount' && data === ' ') {
      if (parseAmount(p.amountText) !== null && p.onCommitField('amount')) go('date', 'end');
      return true; // amounts have no spaces
    }
    if (slot === 'date' && data === ' ') {
      if (!isCompleteDate(p.dateText)) return false; // "jan 3, 2000" must be typeable
      if (p.onCommitField('date')) go('assets', 'end');
      return true;
    }
    if (slot === 'assets' && data === ',') {
      void commitSegment(false);
      return true;
    }
    return false;
  };

  const keys = (slot: SlotName) => (e: KeyboardEvent<HTMLInputElement>) => {
    setPoke((n) => n + 1);
    if (e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    const collapsed = el.selectionStart === el.selectionEnd;
    const caret = collapsed ? el.selectionStart : null;

    if (e.key === 'Escape') {
      if (popOpen || menuOpen) {
        setPopOpen(false);
        setMenuOpen(false);
      } else if (!p.onEscape()) el.blur();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (slot === 'amount') {
        if (p.onCommitField('amount')) go('date', 'end');
      } else if (slot === 'date') {
        if (p.onCommitField('date')) go('assets', 'end');
      } else if (q) void commitSegment(true);
      else p.onFinish();
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey && slot === 'assets' && completion) {
      e.preventDefault();
      acceptCompletion();
      return;
    }

    if (e.key === 'ArrowDown') {
      if (slot === 'date') {
        e.preventDefault();
        setPopOpen(true);
      } else if (slot === 'assets') {
        e.preventDefault();
        setMenuOpen(true);
        setActive((i) => Math.min(i + 1, options.length - 1));
      }
      return;
    }
    if (e.key === 'ArrowUp' && slot === 'assets') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }

    if (!plain || caret === null) return; // Shift/Option/Cmd and real selections stay native

    // Walk between blanks at the edges of the text.
    if (e.key === 'ArrowLeft' && caret === 0) {
      const prev = slot === 'date' ? 'amount' : slot === 'assets' ? 'date' : null;
      if (prev) {
        e.preventDefault();
        go(prev, 'end');
      }
    } else if (e.key === 'ArrowRight' && caret === el.value.length) {
      if (slot === 'assets') {
        if (completion) {
          e.preventDefault();
          acceptCompletion();
        }
      } else {
        e.preventDefault();
        go(slot === 'amount' ? 'date' : 'assets', 'start');
      }
    } else if (e.key === 'Backspace' && caret === 0) {
      // The press that crosses a boundary deletes nothing; the next one deletes normally.
      if (slot === 'date') {
        e.preventDefault();
        go('amount', 'end');
      } else if (slot === 'assets' && !query) {
        e.preventDefault();
        if (p.picked.length) pull(p.picked[p.picked.length - 1], 'end');
        else go('date', 'end');
      }
    }
  };

  const n = p.picked.length;
  const live = focused === 'assets' || query !== '';
  const sep = (i: number) => (live ? ', ' : i < n - 2 ? ', ' : i === n - 2 ? ' and ' : '');
  const hint = p.hint || localHint;

  return (
    <div className={`sentence-wrap${p.locked ? ' locked' : ''}`}>
      <h1 className="sentence">
        If I had invested{' '}
        <Slot name="amount" state={stateOf('amount')} committed={p.committed} shakeKey={p.shake.amount}>
          <span className="cur" aria-hidden="true">
            $
          </span>
          <AutoInput
            value={p.amountText}
            onChange={p.onAmountText}
            ghosts={GHOSTS.amount}
            tail={focused === 'amount' ? advance : ''}
            stagger={STAGGER.amount}
            paused={focused !== null}
            label="Amount in dollars"
            inputRef={p.refs.amount}
            inputMode="decimal"
            enterKeyHint="next"
            readOnly={p.locked}
            onKeyDown={keys('amount')}
            onTextInsert={inserts('amount')}
            {...focusProps('amount')}
          />
        </Slot>{' '}
        on{' '}
        <Slot name="date" state={stateOf('date')} committed={p.committed} shakeKey={p.shake.date}>
          <AutoInput
            value={p.dateText}
            onChange={(v) => {
              setPopOpen(false);
              p.onDateText(v);
            }}
            ghosts={GHOSTS.date}
            tail={focused === 'date' ? advance : ''}
            stagger={STAGGER.date}
            paused={focused !== null}
            label="Date of investment"
            inputRef={p.refs.date}
            enterKeyHint="next"
            readOnly={p.locked}
            onKeyDown={keys('date')}
            onTextInsert={inserts('date')}
            {...focusProps('date')}
          />
        </Slot>{' '}
        in{' '}
        <Slot
          name="assets"
          state={stateOf('assets')}
          committed={p.committed}
          shakeKey={p.shake.assets}
          onClick={(e) => {
            // The empty space around the words belongs to the field.
            if (!p.locked && !(e.target as HTMLElement).closest('input, .word')) go('assets', 'end');
          }}
        >
          {p.picked.map((a, i) => {
            const label = displayName(a);
            return (
              <Fragment key={a.symbol}>
                <span
                  className="word"
                  data-symbol={a.symbol}
                  onClick={(e) => {
                    if (p.locked) return; // on the result screen the click goes to the header
                    e.stopPropagation();
                    pull(a, caretInWord(e, label.length));
                  }}
                >
                  {label}
                </span>
                {sep(i)}
              </Fragment>
            );
          })}
          {!(p.locked && n > 0) && (
            <AutoInput
              value={query}
              onChange={(v) => {
                pulled.current = pulled.current && pulled.current.label === v ? pulled.current : null;
                setQuery(v);
                setActive(0);
                setMenuOpen(true);
                setUnresolved(false);
                setLocalHint('');
              }}
              ghosts={n ? [] : GHOSTS.assets}
              tail={completion || addAnother}
              stagger={STAGGER.assets}
              paused={focused !== null}
              label="Add an asset"
              inputRef={p.refs.assets}
              enterKeyHint="go"
              readOnly={p.locked}
              controls="asset-list"
              onKeyDown={keys('assets')}
              onTextInsert={inserts('assets')}
              {...focusProps('assets')}
            />
          )}
        </Slot>
        .
      </h1>

      {popOpen && !p.locked && (
        <DatePop
          onPick={(t) => {
            setPopOpen(false);
            p.onDatePick(t);
          }}
        />
      )}
      {menuOpen && !p.locked && !full && (
        <div className="drop menu" id="asset-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {!query.trim() && <p className="drophead">Popular. Or type any stock, coin, fund or commodity.</p>}
          {options.map((a, i) => (
            <button type="button" role="option" tabIndex={-1} aria-selected={i === active} className={i === active ? 'on' : ''} key={a.symbol} onClick={() => pick(a)}>
              <span className="tk">{a.symbol}</span>
              <span className="nm">{a.name}</span>
              <span className="bd">{KIND_LABEL[a.kind]}</span>
            </button>
          ))}
          {query.trim() && !options.length && <p className="drophead">{searching ? 'Searching…' : 'No matches.'}</p>}
        </div>
      )}

      <AnimatePresence>
        {hint && !p.locked && !menuOpen && !popOpen && (
          <motion.p className="hint" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
            {hint}
          </motion.p>
        )}
        {p.canStart && !p.locked && !hint && (
          <motion.button type="button" className="arrow" aria-label="Show me" onClick={p.onStart} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.3 }}>
            →
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
