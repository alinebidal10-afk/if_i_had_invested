# If I had invested

Terra Week 1. Live at **https://ifihadinvested1.com**

Fill in one sentence: "If I had invested $___ on ___ in ___". You can pick up to 5 assets: stocks, ETFs, funds, bond ETFs, crypto or commodities. When you choose the asset, the sentence moves up into a header and a chart plays out how each investment grew from that date until today. Above the chart you see what each one is worth now, ranked from highest to lowest.

    npm install
    npm run dev      # http://localhost:3000
    npm test

## How it works

- **History:** daily closing prices from Yahoo Finance, adjusted for dividends, so returns count reinvested dividends (`yahoo-finance2`, unofficial).
- **Live prices:**
  - Crypto streams every trade from Binance.
  - Everything else is checked every 5 s.
  - Mutual funds update once a day.
- **Freshness:** each value says how current its price is: Live, Delayed 15 min, Market closed, or Priced once a day.
- **Playback:**
  - Play, Pause and Replay buttons, with speeds of 0.5×, 1×, 2× and 4× (keys 1–4).
  - The chart's axes grow with the line.
  - A crosshair shows the date and value.
- **Editing:** tap any value in the header, or scroll up (swipe down on a phone), to go back to the sentence. If you change nothing and press Enter, you return to the result where you left off.
- **Sharing:**
  - The page URL holds the whole comparison, so a link opens straight to the result.
  - Share (S key) opens the phone's share sheet, or copies the link.
  - Links show a preview image made by `/api/og`.

## Story mode and videos

`?mode=story` turns any link into a 9:16 recording view: no inputs or buttons, a domain watermark, and the right 15% and bottom 20% left clear for TikTok's overlays. Extra options:

- `autoplay=1`: plays on load.
- `duration=25`: the whole run in seconds, including a 2 s hold on the final frame.
- `asOf=2026-09-30`: freezes "today" at that date and turns off live prices, so a video can be made again with the same numbers.
- `hide=1`: blurs the final value until the last second.
- `title=...`: adds a headline above the sentence (plain text, 90 characters at most).
- `units=10000` and `paid=41`: shows a quantity held instead of dollars invested. `paid` is the starting value only when there is no market price on that date.
- `preset=iphone-2007`: uses a product from `data/presets/products.json` ("Instead of buying…").

`npm run render` reads `scenarios/*.json` and writes `out/<id>.mp4` (1080×1920) and `out/<id>.png` (the link's preview image). Set `RENDER_BASE` to the address of a running copy of the site (default `http://localhost:3000`). It needs `ffmpeg` on the PATH for mp4 output.

## Deploy

The app is hosted on Vercel. Set `NEXT_PUBLIC_SITE_URL` to the public address (for example `https://ifihadinvested1.com`) so link previews use the right domain. Then run `vercel deploy --prod`.

## Notes

- Yahoo has no Bitcoin prices before Sep 17, 2014. Earlier daily prices (from Jul 18, 2010) come from Coin Metrics community data, under the CC BY-NC 4.0 license (attribution required, non-commercial use only), in `data/btc-early.json`. Set `EARLY_BTC_ENABLED=false` and redeploy to remove those prices and their credit.
- Yahoo has no gold futures (GC=F) before August 2000.
- Binance is blocked in some regions. There, crypto falls back to the 5 s check.
