// How long the replay of a span takes. Pure, so the table in pace.test.ts can pin it.

export const YEAR_MS = 365.25 * 864e5;
const FLOOR_MS = 4000;

export const spanYears = (startMs: number, nowMs: number) => Math.max(0, nowMs - startMs) / YEAR_MS;

// Years of history per second at 1x: 3 months/s for short spans, about 1.5 years/s for long ones.
export const paceAt1x = (years: number) => Math.min(1.5, Math.max(0.25, 0.25 * years ** 0.527));

// The whole replay, in milliseconds at the given speed. A 4 s floor, no upper cap.
export const durationMs = (years: number, speed = 1) => Math.max(FLOOR_MS, (years / paceAt1x(years)) * 1000) / speed;

// What the viewer actually sees: years of history per second right now (floor and speed included).
export const effectivePace = (years: number, speed = 1) => years / (durationMs(years, speed) / 1000);

// "≈ 1.4 years / sec", or months below one year per second: "≈ 3 months / sec".
export function paceLabel(yearsPerSec: number): string {
  const tidy = (n: number) => String(Number(n.toFixed(n < 10 ? 1 : 0)));
  const unit = (n: number, one: string) => (tidy(n) === '1' ? one : `${one}s`);
  if (yearsPerSec >= 1) return `≈ ${tidy(yearsPerSec)} ${unit(yearsPerSec, 'year')} / sec`;
  const months = yearsPerSec * 12;
  return `≈ ${tidy(months)} ${unit(months, 'month')} / sec`;
}
