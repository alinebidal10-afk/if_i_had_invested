// Typed amount and date input. Pure functions, so they can be tested without a browser.

export const MIN_DATE = '1980-01-01';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "100", "$100", "1k", "1,000", "2.5k", "1m"
export function parseAmount(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d*\.?\d+)([kmb])?$/);
  if (!m) return null;
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2] as 'k' | 'm' | 'b'] ?? 1);
  return n > 0 && n <= 1e12 ? n : null;
}

export const formatAmountPlain = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const formatAmount = (n: number) => `$${formatAmountPlain(n)}`;

export type Precision = 'year' | 'month' | 'day';
export type ParsedDate = { iso: string; precision: Precision };
export type DateResult = { ok: true; value: ParsedDate } | { ok: false; hint: string };

const pad = (n: number) => String(n).padStart(2, '0'); // taste-skill-ignore: ISO dates, not index labels
const realDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3));

// "2000", "jan 2000", "2000-01-03", "1/3/2000", "Jan 3, 2000", "3 jan 2000".
// A year alone means 1 Jan of that year, a month alone the 1st of that month;
// the first trading day on or after it is found later, from the price data.
export function parseDate(text: string, today = new Date().toISOString().slice(0, 10)): DateResult {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const bad: DateResult = { ok: false, hint: 'Try a date like Jan 3, 2000' };
  if (!t) return bad;

  let y = 0;
  let mo = 1;
  let d = 1;
  let precision: Precision = 'day';
  let m: RegExpMatchArray | null;

  if ((m = t.match(/^(\d{4})$/))) {
    y = +m[1];
    precision = 'year';
  } else if ((m = t.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) {
    y = +m[1];
    mo = +m[2];
    if (m[3]) d = +m[3];
    else precision = 'month';
  } else if ((m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
    y = +m[3];
    mo = +m[1];
    d = +m[2];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // 25/12/2020
  } else if ((m = t.match(/^([a-z]{3,9})\.?(?: (\d{1,2}))?,? (\d{4})$/))) {
    mo = monthIndex(m[1]) + 1;
    y = +m[3];
    if (m[2]) d = +m[2];
    else precision = 'month';
  } else if ((m = t.match(/^(\d{1,2}) ([a-z]{3,9})\.?,? (\d{4})$/))) {
    d = +m[1];
    mo = monthIndex(m[2]) + 1;
    y = +m[3];
  } else return bad;

  if (mo < 1 || mo > 12 || !realDay(y, mo, d)) return bad;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  if (iso < MIN_DATE) return { ok: false, hint: 'Pick a date after Jan 1980' };
  if (iso >= today) return { ok: false, hint: 'Pick a date before today' };
  return { ok: true, value: { iso, precision } };
}

// Space advances the date blank only once the text is a whole date that ends in a 4-digit year (or is full ISO),
// so "jan 3, 2000" stays typeable: "jan 3," is not a date yet.
export function isCompleteDate(text: string): boolean {
  const t = text.trim();
  return (/\d{4}$/.test(t) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) && parseDate(t).ok;
}

export function formatDate(iso: string, precision: Precision = 'day'): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (precision === 'year') return String(y);
  if (precision === 'month') return `${MONTH_NAMES[m - 1]} ${y}`;
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

// Text the date blank shows for a stored ISO date (shared links carry full dates).
export const dateText = (iso: string) => formatDate(iso, 'day');
export const monthLabel = (i: number) => MONTH_NAMES[i];
