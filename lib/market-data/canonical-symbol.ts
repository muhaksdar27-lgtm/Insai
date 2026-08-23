/**
 * Canonical Symbol Definition & Layer
 * Enforces XAUUSD as the single canonical standard across all subsystems.
 */

export const CANONICAL_XAUUSD = 'XAUUSD';

export const SUPPORTED_CANONICAL_SYMBOLS = [
  'XAUUSD',
  'BTCUSD',
  'ETHUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'DXY',
  'US10Y'
] as const;

export type CanonicalSymbol = typeof SUPPORTED_CANONICAL_SYMBOLS[number] | string;

/**
 * Normalizes any external provider symbol, ticker, or user input to canonical format.
 * e.g. "XAU/USD", "xau_usd", "GOLD", "GC=F", "PAXGUSDT", "C:XAUUSD" -> "XAUUSD"
 */
export function toCanonicalSymbol(input: string): string {
  if (!input || typeof input !== 'string') {
    return CANONICAL_XAUUSD;
  }

  let raw = input.trim().toUpperCase();

  // Strip prefixes like "C:", "FOREX:", "SPOT:"
  if (raw.startsWith('C:')) raw = raw.substring(2);
  if (raw.startsWith('FOREX:')) raw = raw.substring(6);
  if (raw.startsWith('SPOT:')) raw = raw.substring(5);

  const clean = raw.replace(/[^A-Z0-9^=.-]/g, '');

  // Gold variants
  if (
    clean === 'XAUUSD' ||
    clean === 'XAU/USD' ||
    clean === 'XAU-USD' ||
    clean === 'XAU_USD' ||
    clean === 'GOLD' ||
    clean === 'GC=F' ||
    clean === 'GC' ||
    clean === 'PAXGUSDT' ||
    clean === 'PAXGUSD' ||
    clean === 'CXAUUSD' ||
    clean === 'FOREXXAUUSD' ||
    clean === 'SPOTXAUUSD'
  ) {
    return CANONICAL_XAUUSD;
  }

  // DXY / Dollar Index
  if (clean === 'DXY' || clean === 'DX-Y.NYB' || clean === 'USDX' || clean === 'DXY.F') {
    return 'DXY';
  }

  // US 10-Year Yield
  if (clean === 'US10Y' || clean === '^TNX' || clean === 'TNX' || clean === 'US10') {
    return 'US10Y';
  }

  // Crypto / Forex standard strips
  const noSlash = clean.replace(/[\/_.-]/g, '');
  if (noSlash === 'BTCUSDT' || noSlash === 'BTCUSD') return 'BTCUSD';
  if (noSlash === 'ETHUSDT' || noSlash === 'ETHUSD') return 'ETHUSD';
  if (noSlash === 'EURUSD' || noSlash === 'EURUSDX') return 'EURUSD';
  if (noSlash === 'GBPUSD' || noSlash === 'GBPUSDX') return 'GBPUSD';
  if (noSlash === 'USDJPY' || noSlash === 'JPYX') return 'USDJPY';

  return noSlash;
}

/**
 * Maps a canonical symbol to the exact format required by a specific provider.
 */
export function isSymbolSupportedByProvider(canonicalSymbol: string, providerName: string): boolean {
  const norm = toCanonicalSymbol(canonicalSymbol);
  const provider = (providerName || '').toLowerCase().trim();

  if (provider.includes('twelvedata') || provider.includes('twelve_data')) {
    return norm !== 'DXY' && norm !== 'US10Y';
  }

  if (provider.includes('binance')) {
    return norm === 'XAUUSD' || norm === 'BTCUSD' || norm === 'ETHUSD';
  }

  if (provider.includes('yahoo')) {
    return true;
  }

  if (provider.includes('polygon')) {
    return norm === 'XAUUSD' || norm === 'EURUSD' || norm === 'GBPUSD' || norm === 'USDJPY';
  }

  return true;
}

/**
 * Maps a canonical symbol to the exact format required by a specific provider.
 */
export function toProviderSymbol(canonicalSymbol: string, providerName: string): string {
  const norm = toCanonicalSymbol(canonicalSymbol);
  const provider = (providerName || '').toLowerCase().trim();

  if (provider.includes('twelvedata') || provider.includes('twelve_data')) {
    if (norm === 'XAUUSD') return 'XAU/USD';
    if (norm === 'BTCUSD') return 'BTC/USD';
    if (norm === 'ETHUSD') return 'ETH/USD';
    if (norm === 'EURUSD') return 'EUR/USD';
    if (norm === 'GBPUSD') return 'GBP/USD';
    if (norm === 'USDJPY') return 'USD/JPY';
    if (norm === 'DXY' || norm === 'US10Y') {
      throw new Error(`Symbol ${norm} is not supported by TwelveData`);
    }
    return norm;
  }

  if (provider.includes('yahoo')) {
    if (norm === 'XAUUSD') return 'GC=F';
    if (norm === 'DXY') return 'DX-Y.NYB';
    if (norm === 'US10Y') return '^TNX';
    if (norm === 'BTCUSD') return 'BTC-USD';
    if (norm === 'ETHUSD') return 'ETH-USD';
    if (norm === 'EURUSD') return 'EURUSD=X';
    if (norm === 'GBPUSD') return 'GBPUSD=X';
    if (norm === 'USDJPY') return 'JPY=X';
    return norm;
  }

  if (provider.includes('binance')) {
    if (norm === 'XAUUSD') return 'PAXGUSDT'; // High-liquidity Spot Gold proxy
    if (norm === 'BTCUSD') return 'BTCUSDT';
    if (norm === 'ETHUSD') return 'ETHUSDT';
    if (norm === 'DXY' || norm === 'US10Y' || norm === 'EURUSD' || norm === 'GBPUSD' || norm === 'USDJPY') {
      throw new Error(`Symbol ${norm} is not supported by Binance`);
    }
    return `${norm}T`;
  }

  if (provider.includes('polygon')) {
    if (norm === 'XAUUSD') return 'C:XAUUSD';
    if (norm === 'EURUSD') return 'C:EURUSD';
    if (norm === 'GBPUSD') return 'C:GBPUSD';
    if (norm === 'USDJPY') return 'C:USDJPY';
    return norm;
  }

  return norm;
}

/**
 * Validates that an input is a valid supported canonical symbol.
 */
export function assertCanonicalSymbol(symbol: string): string {
  const canonical = toCanonicalSymbol(symbol);
  return canonical;
}
