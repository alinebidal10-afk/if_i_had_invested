# Design notes

Decisions that depart from the house style (`design-taste-frontend`), and why.

## Type sizes under the 16px floor

The 16px minimum is for reading text. These are labels on a data graphic, where a smaller size is the convention and 16px would crowd the plot.

| Element | Size | Weight | Colour |
|---|---|---|---|
| Axis tick labels, both axes | 13px | 400, tabular-nums | white at 55% |
| "invested" reference label | 13px | 400 | white at 55% |
| Crosshair date tag | 14px | 600, tabular-nums | black on white |
| Crosshair price tags | 14px | 600, tabular-nums | black or white on the line colour, chosen by luminance |
| Pace readout ("≈ 1.4 years / sec") | 14px | 400 | white at 60% |

## Not a shadow, not a glow

The speed control's selected state, the crosshair tags and the highlight tints are flat fills. The `text-shadow` glow on the result number was dropped because the lint rejects it.

## Radius tokens

`--radius-sm` 4px (tints, small badges) · `--radius-md` 6px (buttons, segmented control, focus rings, toasts, tags) · `--radius-lg` 8px (popovers, suggestion list, share popover). Nothing larger, no pills.

## The chart camera

The chart is a growing chart: the x axis always runs from the invest date to the playhead and keeps stretching, and the y axis fits the highest and lowest value reached so far. Early moves look big while they happen and shrink as history accumulates; at the end it is one plain linear chart of the full span.

- x window is never narrower than 3% of the span or 30 days (whichever is larger, capped at the span), so the first frames are not infinitely zoomed.
- y gets 12% air top and bottom and is never tighter than 20% of its midpoint (20 points in Change mode), so noise on a flat asset cannot read as a crash.
- y grows with a 0.20 lerp per frame and shrinks with 0.05, so a new high shows at once and the view does not jitter.
- Ticks are re-chosen only when a domain moves more than 2% and at most 10 times a second; their positions follow every frame. Ticks fade in and out over 150 ms.

## Link previews

`/api/og` runs on Node (yahoo-finance2 needs it) and is cached for an hour. Previews only work once the site is deployed and `NEXT_PUBLIC_SITE_URL` is set.
