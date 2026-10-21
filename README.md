# Terra Week 1: What if I had bought

Pick an amount, a date and up to 5 assets (stocks, ETFs, funds, bond ETFs, crypto,
commodities). See what each would be worth now, ranked, with a live chart.

    npm install
    npm run dev      # http://localhost:3000
    npm test

- History: daily dividend-adjusted closes (total return) from Yahoo Finance (`yahoo-finance2`, unofficial).
- Live: crypto streams from Binance every trade; everything else is polled every 5s; mutual funds update once a day.
- Every card shows how fresh its price is (LIVE, DELAYED, DAILY, MARKET CLOSED).
- The page URL holds the whole comparison, so it is shareable.
