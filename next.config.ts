import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['yahoo-finance2'],
  // Build-time switch, read on the server and in the browser alike (lib/earlyBtcInfo.ts). Unset means on.
  env: { EARLY_BTC_ENABLED: process.env.EARLY_BTC_ENABLED ?? 'true' },
};

export default config;
