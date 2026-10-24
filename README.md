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

## Deploy

The app is hosted on Vercel. Set `NEXT_PUBLIC_SITE_URL` to the public address (for example `https://ifihadinvested1.com`) so link previews use the right domain. Then run `vercel deploy --prod`.

## Notes

- Yahoo has no Bitcoin prices before 2014 and no gold futures (GC=F) before August 2000.
- Binance is blocked in some regions. There, crypto falls back to the 5 s check.
