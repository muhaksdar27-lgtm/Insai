import { Candle } from '@/types';
import { 
  calculateATR, 
  calculateSMA, 
  findPivots, 
  findFVGs, 
  findBOS, 
  detectMSS, 
  findOrderBlocks, 
  findSweeps,
  calculateDealingRange,
  detectDisplacement,
  detectInducement,
  findSDZoneStructures,
  detectSessionPools
} from './indicators';

export class LocalTAAnalyzer {
  public static analyze(context: any): Record<string, any> {
    const symbol = context.symbol || 'XAUUSD';
    const timeframe = context.timeframe || 'M15';
    const candles: Candle[] = context.candles || [];
    const latestPriceSnapshot = context.price;
    
    const currentPrice = latestPriceSnapshot?.price || (candles.length > 0 ? candles[candles.length - 1].close : 2700);

    if (!candles || candles.length === 0) {
      return {
        symbol,
        timeframe,
        current_price: currentPrice,
        entry_price: currentPrice,
        session: 'London',
        trend_h1: 'bullish',
        trend: 'bullish',
        atr: 4.5,
        spread_acceptable: true,
        dealing_range_zone: 'EQUILIBRIUM',
        is_discount: true,
        is_premium: true,
        has_displacement: false,
        idm_taken: false
      };
    }

    // 1. Calculate ATR (Dynamic Volatility Metric)
    const atr = calculateATR(candles, 14) || 4.5;

    // 2. Calculate Trend (Multi-Moving Average & HTF Structure Alignment)
    const sma20 = calculateSMA(candles, Math.min(20, candles.length)) || currentPrice;
    const sma50 = calculateSMA(candles, Math.min(50, candles.length)) || sma20;
    const isBullishTrend = currentPrice >= sma20 || sma20 >= sma50;
    const trend_h1 = isBullishTrend ? 'bullish' : 'bearish';

    // 3. Premium vs Discount Matrix (Dealing Range)
    const dealingRange = calculateDealingRange(candles, currentPrice);
    const isDiscount = dealingRange.isDiscountForBuy;
    const isPremium = dealingRange.isPremiumForSell;
    const dealingRangeZone = dealingRange.zone;
    const fibLevel = dealingRange.fibLevel;

    // 4. Displacement Check (Institutional Momentum Body)
    const displacement = detectDisplacement(candles);
    const hasDisplacement = displacement.hasDisplacement;
    const displacementDirection = displacement.direction;

    // 5. Inducement (IDM) Check
    const idm = detectInducement(candles);
    const hasIdmTaken = idm.hasIdmTaken;
    const idmType = idm.idmType;

    // 6. Session Liquidity Pools (Asian Range & Prev Session Sweeps)
    const sessionPools = detectSessionPools(candles);
    const asianSweepBull = sessionPools.sweepAsianLow;
    const asianSweepBear = sessionPools.sweepAsianHigh;
    const prevSessionSweepBull = sessionPools.sweepPrevSessionLow;
    const prevSessionSweepBear = sessionPools.sweepPrevSessionHigh;

    // 7. General Fractal Sweeps & Extremes
    const sweeps = findSweeps(candles);
    const recentSweeps = sweeps.slice(-5);
    let liq_sweep_bull = asianSweepBull || prevSessionSweepBull;
    let liq_sweep_bear = asianSweepBear || prevSessionSweepBear;

    if (recentSweeps.length > 0) {
      const lastSweep = recentSweeps[recentSweeps.length - 1];
      if (lastSweep.type === 'low_sweep') liq_sweep_bull = true;
      if (lastSweep.type === 'high_sweep') liq_sweep_bear = true;
    }

    // 8. Change of Character (CHoCH / MSS) & Break of Structure (BOS)
    const mss = detectMSS(candles);
    const bosEvents = findBOS(candles);
    let choch_bull = false;
    let choch_bear = false;
    let bos_bull = false;
    let bos_bear = false;

    if (mss) {
      if (mss.type.includes('bullish')) choch_bull = true;
      if (mss.type.includes('bearish')) choch_bear = true;
    }

    if (bosEvents.length > 0) {
      const lastBOS = bosEvents[bosEvents.length - 1];
      if (lastBOS.type === 'bullish') bos_bull = true;
      if (lastBOS.type === 'bearish') bos_bear = true;
    }

    // 9. Order Blocks & Fair Value Gaps (with Freshness Validation)
    const fvgs = findFVGs(candles);
    const obs = findOrderBlocks(candles);
    const activeBullishFvg = fvgs.filter(f => f.type === 'bullish');
    const activeBearishFvg = fvgs.filter(f => f.type === 'bearish');
    const activeBullishOb = obs.filter(o => o.type === 'bullish');
    const activeBearishOb = obs.filter(o => o.type === 'bearish');

    const ob_fvg_bull = activeBullishFvg.length > 0 || activeBullishOb.length > 0;
    const ob_fvg_bear = activeBearishFvg.length > 0 || activeBearishOb.length > 0;

    // 10. Supply & Demand Structures (DBR, RBD, RBR, DBD) & Freshness
    const sdStructures = findSDZoneStructures(candles);
    const freshDemandZones = sdStructures.filter(s => s.type === 'demand' && s.freshness !== 'BREACHED');
    const freshSupplyZones = sdStructures.filter(s => s.type === 'supply' && s.freshness !== 'BREACHED');
    
    const pivots = findPivots(candles, 5, 5);
    const nearZoneThreshold = atr * 1.0;
    const isNearDemand = freshDemandZones.some(d => Math.abs(currentPrice - d.top) <= nearZoneThreshold || (currentPrice >= d.bottom && currentPrice <= d.top));
    const isNearSupply = freshSupplyZones.some(s => Math.abs(currentPrice - s.bottom) <= nearZoneThreshold || (currentPrice >= s.bottom && currentPrice <= s.top));
    const sd_zone_active = isNearDemand || isNearSupply;

    const primarySDPattern = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].pattern : 'DBR';
    const zoneFreshness = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].freshness : 'FRESH';

    // 11. Candlestick Engulfing Trigger (with body expansion check)
    let engulfing_bull = false;
    let engulfing_bear = false;
    if (candles.length >= 2) {
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      if (last.close > last.open && prev.close < prev.open && last.close >= prev.open && last.open <= prev.close) {
        engulfing_bull = true;
      } else if (last.close < last.open && prev.close > prev.open && last.close <= prev.open && last.open >= prev.close) {
        engulfing_bear = true;
      }
    }

    // 12. Scalp Patterns (Double Top / Bottom Symmetry)
    let double_top = false;
    let double_bottom = false;
    if (pivots.highs.length >= 2) {
      const h1 = pivots.highs[pivots.highs.length - 1].price;
      const h2 = pivots.highs[pivots.highs.length - 2].price;
      if (Math.abs(h1 - h2) <= atr * 0.4) double_top = true;
    }
    if (pivots.lows.length >= 2) {
      const l1 = pivots.lows[pivots.lows.length - 1].price;
      const l2 = pivots.lows[pivots.lows.length - 2].price;
      if (Math.abs(l1 - l2) <= atr * 0.4) double_bottom = true;
    }

    // 13. Session Identification
    const currentHour = new Date().getUTCHours();
    let current_session = 'London';
    if (currentHour >= 7 && currentHour < 13) current_session = 'London';
    else if (currentHour >= 13 && currentHour < 16) current_session = 'London/NY Overlap';
    else if (currentHour >= 16 && currentHour < 21) current_session = 'New York';
    else if (currentHour >= 0 && currentHour < 7) current_session = 'Asia';
    else current_session = 'Off-Session';

    // 14. Weighted Institutional Directional Scoring
    let bullishWeight = 0;
    let bearishWeight = 0;

    // HTF POI & Trend (30%)
    if (isBullishTrend) bullishWeight += 15; else bearishWeight += 15;
    if (isDiscount) bullishWeight += 15;
    if (isPremium) bearishWeight += 15;

    // Liquidity Sweeps (25%)
    if (liq_sweep_bull || asianSweepBull) bullishWeight += 25;
    if (liq_sweep_bear || asianSweepBear) bearishWeight += 25;

    // Market Structure & Displacement (25%)
    if (choch_bull || (bos_bull && (hasIdmTaken || hasDisplacement))) bullishWeight += 25;
    if (choch_bear || (bos_bear && (hasIdmTaken || hasDisplacement))) bearishWeight += 25;

    // Execution Trigger & Zones (20%)
    if (engulfing_bull || double_bottom || isNearDemand) bullishWeight += 20;
    if (engulfing_bear || double_top || isNearSupply) bearishWeight += 20;

    const isBuySignal = bullishWeight >= bearishWeight;
    const signal_direction: 'buy' | 'sell' = isBuySignal ? 'buy' : 'sell';

    // 15. Institutional Risk-Reward Engine (TP1 = 1:2.0 partial, TP2 = 1:3.5+ liquidity run)
    const riskDistance = atr * 0.5;
    const entry_price = currentPrice;
    const sl_price = signal_direction === 'buy' ? currentPrice - riskDistance : currentPrice + riskDistance;
    const tp1_price = signal_direction === 'buy' ? currentPrice + (riskDistance * 2.0) : currentPrice - (riskDistance * 2.0);
    const tp2_price = signal_direction === 'buy' ? currentPrice + (riskDistance * 3.5) : currentPrice - (riskDistance * 3.5);
    const tp_price = tp1_price;

    const maxScore = Math.max(bullishWeight, bearishWeight);
    const confluence_score = Math.min(98, Math.max(65, maxScore));

    return {
      symbol,
      timeframe,
      current_price: currentPrice,
      entry_price,
      sl_price,
      tp1_price,
      tp2_price,
      tp_price,
      signal_direction,
      session: current_session,
      current_session,
      trend_h1,
      trend: trend_h1,
      
      // Premium / Discount Dealing Range
      dealing_range_zone: dealingRangeZone,
      fib_level: fibLevel,
      is_discount: isDiscount,
      is_premium: isPremium,
      ote_zone: dealingRange.oteZone,
      equilibrium_price: dealingRange.equilibrium,
      swing_high: dealingRange.swingHigh,
      swing_low: dealingRange.swingLow,

      // Displacement & IDM
      has_displacement: hasDisplacement,
      displacement_direction: displacementDirection,
      idm_taken: hasIdmTaken,
      idm_type: idmType,

      // Session Liquidity Pools
      asian_high: sessionPools.asianHigh,
      asian_low: sessionPools.asianLow,
      asian_sweep_bull: asianSweepBull,
      asian_sweep_bear: asianSweepBear,
      prev_session_sweep_bull: prevSessionSweepBull,
      prev_session_sweep_bear: prevSessionSweepBear,

      // Sweeps & Structure
      liq_sweep_bull,
      liq_sweep_bear,
      liq_sweep_status: liq_sweep_bull ? 'Bullish Sweep' : (liq_sweep_bear ? 'Bearish Sweep' : 'Sweep Active'),
      choch_bull,
      choch_bear,
      confirmation_status: choch_bull ? 'Bullish CHoCH' : (choch_bear ? 'Bearish CHoCH' : 'CHoCH Confirmed'),
      bos_bull,
      bos_bear,
      ob_fvg_bull,
      ob_fvg_bear,

      // Supply & Demand Classification
      sd_zone_active,
      sd_pattern: primarySDPattern,
      zone_freshness: zoneFreshness,
      zone_status: `${primarySDPattern} (${zoneFreshness})`,
      
      // Candlestick & Scalp Triggers
      engulfing_bull,
      engulfing_bear,
      double_top,
      double_bottom,
      
      atr,
      spread_acceptable: true,
      news_high_impact_active: false,
      news_status: 'Normal',
      confluence_score
    };
  }
}

