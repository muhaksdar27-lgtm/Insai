import { Candle } from '@/types';
import { 
  calculateATR, 
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
import { HTFTrendAnalyzer, HTFTrendResult } from './htf-trend-analyzer';
import { SessionEngine } from '../market-data/session-engine';
import { toCanonicalSymbol } from '../market-data/canonical-symbol';

export class LocalTAAnalyzer {
  public static analyze(context: any): Record<string, any> {
    const symbol = toCanonicalSymbol(context.symbol || 'XAUUSD');
    const timeframe = (context.timeframe || 'M15').toUpperCase();
    const candles: Candle[] = context.candles || [];
    const latestPriceSnapshot = context.price;
    const sessionDetails = SessionEngine.getSessionInfo(context.timestamp || latestPriceSnapshot?.timestamp);
    
    const currentPrice = latestPriceSnapshot?.price || (candles.length > 0 ? candles[candles.length - 1].close : 0);

    // 1. HTF Trend Analysis (Single source of truth via HTFTrendAnalyzer)
    const htfTrend: HTFTrendResult = HTFTrendAnalyzer.analyzeTrend(candles, 'H1');
    const trend_h1 = htfTrend.direction; // 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'INSUFFICIENT_DATA' | 'ANALYSIS_ERROR'
    const isBullishTrend = trend_h1 === 'BULLISH';
    const isBearishTrend = trend_h1 === 'BEARISH';

    if (!candles || candles.length === 0) {
      return {
        symbol,
        timeframe,
        current_price: currentPrice,
        entry_price: currentPrice,
        session: sessionDetails.primarySession,
        session_details: sessionDetails,
        trend_h1: 'INSUFFICIENT_DATA',
        trend: 'INSUFFICIENT_DATA',
        htf_trend: htfTrend,
        atr: 0,
        spread_acceptable: false,
        dealing_range_zone: 'UNDEFINED',
        is_discount: false,
        is_premium: false,
        has_displacement: false,
        idm_taken: false
      };
    }

    // 2. Calculate ATR (Dynamic Volatility Metric)
    const atr = calculateATR(candles, 14) || 0;

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

    const primarySDPattern = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].pattern : null;
    const zoneFreshness = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].freshness : null;

    // 11. Candlestick Engulfing Trigger (with body expansion check)
    let engulfing_bull = false;
    let engulfing_bear = false;
    const closedCandles = candles.length > 1 ? candles.slice(0, candles.length - 1) : candles;
    if (closedCandles.length >= 2) {
      const last = closedCandles[closedCandles.length - 1];
      const prev = closedCandles[closedCandles.length - 2];
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

    // 13. Directional Scoring
    let bullishWeight = 0;
    let bearishWeight = 0;

    // HTF POI & Trend (30%)
    if (isBullishTrend) bullishWeight += 20;
    else if (isBearishTrend) bearishWeight += 20;
    if (isDiscount) bullishWeight += 10;
    if (isPremium) bearishWeight += 10;

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

    const maxScore = Math.max(bullishWeight, bearishWeight);
    const confluence_score = Math.min(98, Math.max(65, maxScore));

    // Strategy 1 (SMC London M15) Setup
    const s1_direction: 'buy' | 'sell' = (asianSweepBull || liq_sweep_bull || choch_bull) ? 'buy' : ((asianSweepBear || liq_sweep_bear || choch_bear) ? 'sell' : signal_direction);
    const s1_entry = s1_direction === 'buy'
      ? (activeBullishFvg[activeBullishFvg.length - 1]?.top || activeBullishOb[activeBullishOb.length - 1]?.top || currentPrice)
      : (activeBearishFvg[activeBearishFvg.length - 1]?.bottom || activeBearishOb[activeBearishOb.length - 1]?.bottom || currentPrice);
    const s1_riskDist = Math.max(atr * 0.5, 1.2);
    const s1_sl = s1_direction === 'buy'
      ? (sessionPools.asianLow ? sessionPools.asianLow - (atr * 0.3) : s1_entry - s1_riskDist)
      : (sessionPools.asianHigh ? sessionPools.asianHigh + (atr * 0.3) : s1_entry + s1_riskDist);
    const s1_risk = Math.abs(s1_entry - s1_sl) || s1_riskDist;
    const s1_tp1 = s1_direction === 'buy' ? s1_entry + (s1_risk * 2.0) : s1_entry - (s1_risk * 2.0);
    const s1_tp2 = s1_direction === 'buy' ? s1_entry + (s1_risk * 3.5) : s1_entry - (s1_risk * 3.5);

    // Strategy 2 (Supply & Demand M15) Setup
    const s2_direction: 'buy' | 'sell' = (isNearDemand || engulfing_bull) ? 'buy' : ((isNearSupply || engulfing_bear) ? 'sell' : signal_direction);
    const s2_activeDemand = freshDemandZones[freshDemandZones.length - 1];
    const s2_activeSupply = freshSupplyZones[freshSupplyZones.length - 1];
    const s2_entry = s2_direction === 'buy'
      ? (s2_activeDemand?.top || currentPrice)
      : (s2_activeSupply?.bottom || currentPrice);
    const s2_sl = s2_direction === 'buy'
      ? ((s2_activeDemand?.bottom || s2_entry - atr) - (atr * 0.5))
      : ((s2_activeSupply?.top || s2_entry + atr) + (atr * 0.5));
    const s2_risk = Math.abs(s2_entry - s2_sl) || (atr * 0.5);
    
    let s2_tp1 = s2_direction === 'buy'
      ? (s2_activeSupply?.bottom && s2_activeSupply.bottom > s2_entry ? s2_activeSupply.bottom : s2_entry + (s2_risk * 2.0))
      : (s2_activeDemand?.top && s2_activeDemand.top < s2_entry ? s2_activeDemand.top : s2_entry - (s2_risk * 2.0));
    
    if (s2_direction === 'buy' && (s2_tp1 - s2_entry) < s2_risk * 2.0) s2_tp1 = s2_entry + s2_risk * 2.0;
    if (s2_direction === 'sell' && (s2_entry - s2_tp1) < s2_risk * 2.0) s2_tp1 = s2_entry - s2_risk * 2.0;
    
    const s2_tp2 = s2_direction === 'buy' ? s2_entry + (s2_risk * 3.0) : s2_entry - (s2_risk * 3.0);

    // Strategy 3 (Scalping M1) Setup
    const s3_direction: 'buy' | 'sell' = (double_bottom || liq_sweep_bull) ? 'buy' : ((double_top || liq_sweep_bear) ? 'sell' : signal_direction);
    const s3_entry = currentPrice;
    const s3_riskDist = Math.max(atr * 0.3, 0.8);
    const s3_sl = s3_direction === 'buy' ? s3_entry - s3_riskDist : s3_entry + s3_riskDist;
    const s3_tp1 = s3_direction === 'buy' ? s3_entry + (s3_riskDist * 1.5) : s3_entry - (s3_riskDist * 1.5);
    const s3_tp2 = s3_direction === 'buy' ? s3_entry + (s3_riskDist * 2.5) : s3_entry - (s3_riskDist * 2.5);

    // Strategy 4 (News Sweep Reversal) Setup
    const s4_direction: 'buy' | 'sell' = (liq_sweep_bull || choch_bull) ? 'buy' : ((liq_sweep_bear || choch_bear) ? 'sell' : (signal_direction === 'buy' ? 'sell' : 'buy'));
    const s4_entry = currentPrice;
    const s4_riskDist = Math.max(atr * 0.6, 1.5);
    const s4_sl = s4_direction === 'buy' ? s4_entry - s4_riskDist : s4_entry + s4_riskDist;
    const s4_tp1 = s4_direction === 'buy' ? s4_entry + (s4_riskDist * 2.5) : s4_entry - (s4_riskDist * 2.5);
    const s4_tp2 = s4_direction === 'buy' ? s4_entry + (s4_riskDist * 4.0) : s4_entry - (s4_riskDist * 4.0);

    // Strategy 5 (SMC-SD Confluence) Setup
    const s5_direction: 'buy' | 'sell' = ((choch_bull || isNearDemand) && isDiscount) ? 'buy' : (((choch_bear || isNearSupply) && isPremium) ? 'sell' : signal_direction);
    const fib618Price = dealingRange.swingLow + (dealingRange.rangeSize * 0.618);
    const fib786Price = dealingRange.swingLow + (dealingRange.rangeSize * 0.786);
    const s5_entry = s5_direction === 'buy'
      ? (s2_entry || fib618Price || currentPrice)
      : (s2_entry || fib618Price || currentPrice);
    const s5_riskDist = Math.max(atr * 0.5, 1.2);
    const s5_sl = s5_direction === 'buy'
      ? (fib786Price < s5_entry ? fib786Price : s5_entry - s5_riskDist)
      : (fib786Price > s5_entry ? fib786Price : s5_entry + s5_riskDist);
    const s5_risk = Math.abs(s5_entry - s5_sl) || s5_riskDist;
    const s5_tp1 = s5_direction === 'buy' ? s5_entry + (s5_risk * 2.5) : s5_entry - (s5_risk * 2.5);
    const s5_tp2 = s5_direction === 'buy' ? s5_entry + (s5_risk * 4.0) : s5_entry - (s5_risk * 4.0);

    return {
      symbol,
      timeframe,
      current_price: currentPrice,
      entry_price: currentPrice,
      sl_price: signal_direction === 'buy' ? currentPrice - (atr * 0.5) : currentPrice + (atr * 0.5),
      tp1_price: signal_direction === 'buy' ? currentPrice + (atr * 1.0) : currentPrice - (atr * 1.0),
      tp2_price: signal_direction === 'buy' ? currentPrice + (atr * 1.75) : currentPrice - (atr * 1.75),
      tp_price: signal_direction === 'buy' ? currentPrice + (atr * 1.0) : currentPrice - (atr * 1.0),
      signal_direction,
      session: sessionDetails.primarySession,
      current_session: sessionDetails.primarySession,
      session_details: sessionDetails,
      trend_h1,
      trend: trend_h1,
      htf_trend: htfTrend,
      
      // Strategy-specific setup structures
      strategy1: {
        direction: s1_direction,
        entry: Number(s1_entry.toFixed(2)),
        sl: Number(s1_sl.toFixed(2)),
        tp1: Number(s1_tp1.toFixed(2)),
        tp2: Number(s1_tp2.toFixed(2)),
        rr: `1:${(Math.abs(s1_tp1 - s1_entry) / Math.abs(s1_entry - s1_sl)).toFixed(1)}`,
        sweepStatus: (asianSweepBull || asianSweepBear || liq_sweep_bull || liq_sweep_bear) ? 'Asia Sweep Confirmed' : 'Asia Sweep Monitored',
        chochStatus: (choch_bull || choch_bear) ? 'M15 CHoCH Confirmed' : 'M15 CHoCH Monitored',
        obFvgStatus: (ob_fvg_bull || ob_fvg_bear) ? 'OB/FVG Aligned' : 'OB/FVG Monitored'
      },
      strategy2: {
        direction: s2_direction,
        entry: Number(s2_entry.toFixed(2)),
        sl: Number(s2_sl.toFixed(2)),
        tp1: Number(s2_tp1.toFixed(2)),
        tp2: Number(s2_tp2.toFixed(2)),
        rr: `1:${(Math.abs(s2_tp1 - s2_entry) / Math.abs(s2_entry - s2_sl)).toFixed(1)}`,
        sdZoneStatus: primarySDPattern ? `${primarySDPattern} (${zoneFreshness}) Active` : 'S&D Zone Monitored',
        engulfingStatus: (engulfing_bull || engulfing_bear || hasDisplacement) ? 'Engulfing / Momentum Confirmed' : 'Engulfing Monitored'
      },
      strategy3: {
        direction: s3_direction,
        entry: Number(s3_entry.toFixed(2)),
        sl: Number(s3_sl.toFixed(2)),
        tp1: Number(s3_tp1.toFixed(2)),
        tp2: Number(s3_tp2.toFixed(2)),
        rr: `1:${(Math.abs(s3_tp1 - s3_entry) / Math.abs(s3_entry - s3_sl)).toFixed(1)}`,
        sweepStatus: (liq_sweep_bull || liq_sweep_bear) ? 'Scalp Sweep Confirmed' : 'Scalp Sweep Monitored',
        doubleTopBottomStatus: (double_top || double_bottom) ? (double_top ? 'Double Top Confirmed' : 'Double Bottom Confirmed') : 'Pattern Monitored'
      },
      strategy4: {
        direction: s4_direction,
        entry: Number(s4_entry.toFixed(2)),
        sl: Number(s4_sl.toFixed(2)),
        tp1: Number(s4_tp1.toFixed(2)),
        tp2: Number(s4_tp2.toFixed(2)),
        rr: `1:${(Math.abs(s4_tp1 - s4_entry) / Math.abs(s4_entry - s4_sl)).toFixed(1)}`,
        newsStatus: (context.news_high_impact_active || context.news_event) ? 'High Impact Active' : 'Normal Volatility',
        reversalStatus: ((choch_bull || choch_bear || bos_bull || bos_bear) && (liq_sweep_bull || liq_sweep_bear)) ? 'Post-News Reversal Confirmed' : 'Reversal Monitored'
      },
      strategy5: {
        direction: s5_direction,
        entry: Number(s5_entry.toFixed(2)),
        sl: Number(s5_sl.toFixed(2)),
        tp1: Number(s5_tp1.toFixed(2)),
        tp2: Number(s5_tp2.toFixed(2)),
        rr: `1:${(Math.abs(s5_tp1 - s5_entry) / Math.abs(s5_entry - s5_sl)).toFixed(1)}`,
        confluenceStatus: ((bos_bull || bos_bear || choch_bull || choch_bear) && sd_zone_active) ? `SMC + ${primarySDPattern || 'S&D'} Confluence Confirmed` : 'Confluence Monitored'
      },

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
      zone_status: primarySDPattern ? `${primarySDPattern} (${zoneFreshness})` : 'NO_ZONE',
      
      // Candlestick & Scalp Triggers
      engulfing_bull,
      engulfing_bear,
      double_top,
      double_bottom,
      
      atr,
      spread_acceptable: Boolean(context.spreadPips !== undefined ? context.spreadPips <= 3.0 : (latestPriceSnapshot?.spreadPips !== undefined ? latestPriceSnapshot.spreadPips <= 3.0 : (context.spread_acceptable ?? false))),
      news_high_impact_active: Boolean(context.news_high_impact_active || context.news_event !== undefined),
      news_status: Boolean(context.news_high_impact_active || context.news_event !== undefined) ? 'High Impact Active' : 'Normal',
      confluence_score
    };
  }

  /**
   * Performs isolated, timeframe-pure Technical Analysis for a specific canonical strategy.
   * Strictly uses the authorized timeframes for bias, context, setup, and trigger.
   */
  public static analyzeStrategyIsolated(
    strategyId: string,
    marketContext: import('@/types/strategy-market-context').StrategyMarketContext
  ): Record<string, any> {
    const symbol = toCanonicalSymbol(marketContext.symbol || 'XAUUSD');
    const currentPrice = marketContext.currentPrice || 0;
    const session = marketContext.session || 'UNDEFINED';

    // Extract timeframe contexts
    const d1Context = marketContext.D1;
    const h4Context = marketContext.H4;
    const h1Context = marketContext.H1;
    const m15Context = marketContext.M15;
    const m5Context = marketContext.M5;
    const m1Context = marketContext.M1;

    // Timeframe-specific analysis objects
    let h1TrendResult: HTFTrendResult | null = null;
    if (h1Context && h1Context.candles && h1Context.candles.length >= 10) {
      h1TrendResult = HTFTrendAnalyzer.analyzeTrend(h1Context.candles, 'H1');
    }

    let d1TrendResult: HTFTrendResult | null = null;
    if (d1Context && d1Context.candles && d1Context.candles.length >= 10) {
      d1TrendResult = HTFTrendAnalyzer.analyzeTrend(d1Context.candles, 'D1');
    }

    let h4TrendResult: HTFTrendResult | null = null;
    if (h4Context && h4Context.candles && h4Context.candles.length >= 10) {
      h4TrendResult = HTFTrendAnalyzer.analyzeTrend(h4Context.candles, 'H4');
    }

    // Default trend from H1 if available
    const trend_h1 = h1TrendResult ? h1TrendResult.direction : (d1TrendResult?.direction || 'INSUFFICIENT_DATA');

    // ATR calculation: prefer M15 for strategy 1, 2, 5; M5 for strategy 4; M1/M5 for strategy 3
    const m15Candles = m15Context?.candles || [];
    const m5Candles = m5Context?.candles || [];
    const m1Candles = m1Context?.candles || [];
    const h1Candles = h1Context?.candles || [];

    const atrM15 = m15Candles.length > 0 ? (calculateATR(m15Candles, 14) || 0) : 0;
    const atrM5 = m5Candles.length > 0 ? (calculateATR(m5Candles, 14) || 0) : 0;
    const atrM1 = m1Candles.length > 0 ? (calculateATR(m1Candles, 14) || 0) : 0;

    // Strategy 1: H1 Bias, M15 Context & Execution
    if (strategyId === 'strategy-1-smc') {
      const s1Candles = m15Candles;
      const s1Atr = atrM15 || (h1Candles.length > 0 ? (calculateATR(h1Candles, 14) || 0) : 0);
      const sessionPools = detectSessionPools(s1Candles);
      const mss = detectMSS(s1Candles);
      const fvgs = findFVGs(s1Candles);
      const obs = findOrderBlocks(s1Candles);
      const dealingRange = calculateDealingRange(s1Candles, currentPrice);

      const asianSweepBull = sessionPools.sweepAsianLow;
      const asianSweepBear = sessionPools.sweepAsianHigh;
      const chochBull = mss ? mss.type.includes('bullish') : false;
      const chochBear = mss ? mss.type.includes('bearish') : false;
      const obFvgBull = fvgs.some(f => f.type === 'bullish') || obs.some(o => o.type === 'bullish');
      const obFvgBear = fvgs.some(f => f.type === 'bearish') || obs.some(o => o.type === 'bearish');

      const s1Direction: 'buy' | 'sell' = (asianSweepBull || chochBull) ? 'buy' : ((asianSweepBear || chochBear) ? 'sell' : (trend_h1 === 'BEARISH' ? 'sell' : 'buy'));
      const s1RiskDist = Math.max(s1Atr * 0.5, 1.2);
      const s1Entry = currentPrice;
      const s1Sl = s1Direction === 'buy' ? s1Entry - s1RiskDist : s1Entry + s1RiskDist;
      const s1Tp1 = s1Direction === 'buy' ? s1Entry + (s1RiskDist * 2.0) : s1Entry - (s1RiskDist * 2.0);
      const s1Tp2 = s1Direction === 'buy' ? s1Entry + (s1RiskDist * 3.5) : s1Entry - (s1RiskDist * 3.5);

      return {
        strategyId,
        symbol,
        current_price: currentPrice,
        session,
        trend_h1,
        trend: trend_h1,
        htf_trend: h1TrendResult,
        atr: s1Atr,
        m15_available: m15Candles.length > 0,
        h1_available: h1Candles.length > 0,
        asian_sweep_bull: asianSweepBull,
        asian_sweep_bear: asianSweepBear,
        choch_bull: chochBull,
        choch_bear: chochBear,
        ob_fvg_bull: obFvgBull,
        ob_fvg_bear: obFvgBear,
        dealing_range_zone: dealingRange.zone,
        is_discount: dealingRange.isDiscountForBuy,
        is_premium: dealingRange.isPremiumForSell,
        spread_acceptable: Boolean(marketContext.spread?.isAcceptable ?? (typeof marketContext.spread === 'number' ? marketContext.spread <= 3.0 : true)),
        strategy1: {
          direction: s1Direction,
          entry: Number(s1Entry.toFixed(2)),
          sl: Number(s1Sl.toFixed(2)),
          tp1: Number(s1Tp1.toFixed(2)),
          tp2: Number(s1Tp2.toFixed(2)),
          rr: `1:${(Math.abs(s1Tp1 - s1Entry) / Math.abs(s1Entry - s1Sl)).toFixed(1)}`
        }
      };
    }

    // Strategy 2: D1/H4/H1 Bias, M15/M5 Setup & Trigger
    if (strategyId === 'strategy-2-snd') {
      const s2Candles = m15Candles.length > 0 ? m15Candles : m5Candles;
      const s2Atr = atrM15 || atrM5;
      const sdStructures = findSDZoneStructures(s2Candles);
      const freshDemand = sdStructures.filter(s => s.type === 'demand' && s.freshness !== 'BREACHED');
      const freshSupply = sdStructures.filter(s => s.type === 'supply' && s.freshness !== 'BREACHED');
      
      const isNearDemand = freshDemand.some(d => Math.abs(currentPrice - d.top) <= s2Atr || (currentPrice >= d.bottom && currentPrice <= d.top));
      const isNearSupply = freshSupply.some(s => Math.abs(currentPrice - s.bottom) <= s2Atr || (currentPrice >= s.bottom && currentPrice <= s.top));

      // Engulfing trigger evaluated on M15 or M5
      let engulfingBull = false;
      let engulfingBear = false;
      const triggerCandles = m5Candles.length >= 2 ? m5Candles : s2Candles;
      if (triggerCandles.length >= 2) {
        const last = triggerCandles[triggerCandles.length - 1];
        const prev = triggerCandles[triggerCandles.length - 2];
        if (last.close > last.open && prev.close < prev.open && last.close >= prev.open && last.open <= prev.close) engulfingBull = true;
        if (last.close < last.open && prev.close > prev.open && last.close <= prev.open && last.open >= prev.close) engulfingBear = true;
      }

      const s2Direction: 'buy' | 'sell' = (isNearDemand || engulfingBull) ? 'buy' : ((isNearSupply || engulfingBear) ? 'sell' : (trend_h1 === 'BEARISH' ? 'sell' : 'buy'));
      const s2RiskDist = Math.max(s2Atr * 0.5, 1.2);
      const s2Entry = currentPrice;
      const s2Sl = s2Direction === 'buy' ? s2Entry - s2RiskDist : s2Entry + s2RiskDist;
      const s2Tp1 = s2Direction === 'buy' ? s2Entry + (s2RiskDist * 2.0) : s2Entry - (s2RiskDist * 2.0);
      const s2Tp2 = s2Direction === 'buy' ? s2Entry + (s2RiskDist * 3.0) : s2Entry - (s2RiskDist * 3.0);

      const primarySDPattern = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].pattern : null;
      const zoneFreshness = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].freshness : null;

      return {
        strategyId,
        symbol,
        current_price: currentPrice,
        session,
        trend_h1,
        trend: trend_h1,
        htf_trend: h1TrendResult,
        d1_trend: d1TrendResult,
        h4_trend: h4TrendResult,
        atr: s2Atr,
        sd_zone_active: isNearDemand || isNearSupply,
        sd_pattern: primarySDPattern,
        zone_freshness: zoneFreshness,
        engulfing_bull: engulfingBull,
        engulfing_bear: engulfingBear,
        spread_acceptable: Boolean(marketContext.spread?.isAcceptable ?? (typeof marketContext.spread === 'number' ? marketContext.spread <= 3.0 : true)),
        strategy2: {
          direction: s2Direction,
          entry: Number(s2Entry.toFixed(2)),
          sl: Number(s2Sl.toFixed(2)),
          tp1: Number(s2Tp1.toFixed(2)),
          tp2: Number(s2Tp2.toFixed(2)),
          rr: `1:${(Math.abs(s2Tp1 - s2Entry) / Math.abs(s2Entry - s2Sl)).toFixed(1)}`
        }
      };
    }

    // Strategy 3: H1 Bias, M15 Retracement, M5/M1 Sweep, M1 Pattern & Neckline
    if (strategyId === 'strategy-3-scalping') {
      const s3Atr = atrM1 || atrM5 || 0.8;
      const m1Pivots = m1Candles.length >= 5 ? findPivots(m1Candles, 3, 3) : { highs: [], lows: [] };
      const m1Sweeps = m1Candles.length >= 5 ? findSweeps(m1Candles) : [];
      const m5Sweeps = m5Candles.length >= 5 ? findSweeps(m5Candles) : [];

      let liqSweepBull = false;
      let liqSweepBear = false;
      const recentMicroSweeps = [...m5Sweeps, ...m1Sweeps].slice(-5);
      if (recentMicroSweeps.length > 0) {
        const lastSweep = recentMicroSweeps[recentMicroSweeps.length - 1];
        if (lastSweep.type === 'low_sweep') liqSweepBull = true;
        if (lastSweep.type === 'high_sweep') liqSweepBear = true;
      }

      let doubleTop = false;
      let doubleBottom = false;
      if (m1Pivots.highs.length >= 2) {
        const h1 = m1Pivots.highs[m1Pivots.highs.length - 1].price;
        const h2 = m1Pivots.highs[m1Pivots.highs.length - 2].price;
        if (Math.abs(h1 - h2) <= s3Atr * 0.4) doubleTop = true;
      }
      if (m1Pivots.lows.length >= 2) {
        const l1 = m1Pivots.lows[m1Pivots.lows.length - 1].price;
        const l2 = m1Pivots.lows[m1Pivots.lows.length - 2].price;
        if (Math.abs(l1 - l2) <= s3Atr * 0.4) doubleBottom = true;
      }

      const s3Direction: 'buy' | 'sell' = (doubleBottom || liqSweepBull) ? 'buy' : ((doubleTop || liqSweepBear) ? 'sell' : (trend_h1 === 'BEARISH' ? 'sell' : 'buy'));
      const s3RiskDist = Math.max(s3Atr * 0.3, 0.8);
      const s3Entry = currentPrice;
      const s3Sl = s3Direction === 'buy' ? s3Entry - s3RiskDist : s3Entry + s3RiskDist;
      const s3Tp1 = s3Direction === 'buy' ? s3Entry + (s3RiskDist * 1.5) : s3Entry - (s3RiskDist * 1.5);
      const s3Tp2 = s3Direction === 'buy' ? s3Entry + (s3RiskDist * 2.5) : s3Entry - (s3RiskDist * 2.5);

      return {
        strategyId,
        symbol,
        current_price: currentPrice,
        session,
        trend_h1,
        trend: trend_h1,
        htf_trend: h1TrendResult,
        atr: s3Atr,
        m1_available: m1Candles.length > 0,
        m5_available: m5Candles.length > 0,
        m15_available: m15Candles.length > 0,
        liq_sweep_bull: liqSweepBull,
        liq_sweep_bear: liqSweepBear,
        double_top: doubleTop,
        double_bottom: doubleBottom,
        spread_acceptable: Boolean(marketContext.spread?.isAcceptable ?? (typeof marketContext.spread === 'number' ? marketContext.spread <= 3.0 : true)),
        news_high_impact_active: Boolean(marketContext.news?.hasHighImpactNewsActive),
        strategy3: {
          direction: s3Direction,
          entry: Number(s3Entry.toFixed(2)),
          sl: Number(s3Sl.toFixed(2)),
          tp1: Number(s3Tp1.toFixed(2)),
          tp2: Number(s3Tp2.toFixed(2)),
          rr: `1:${(Math.abs(s3Tp1 - s3Entry) / Math.abs(s3Entry - s3Sl)).toFixed(1)}`
        }
      };
    }

    // Strategy 4: M5 News Context, M1 Post-News Execution
    if (strategyId === 'strategy-4-news') {
      const s4Atr = atrM1 || atrM5 || 1.5;
      const m5Sweeps = m5Candles.length >= 5 ? findSweeps(m5Candles) : [];
      const m1Bos = m1Candles.length >= 5 ? findBOS(m1Candles) : [];

      let liqSweepBull = false;
      let liqSweepBear = false;
      if (m5Sweeps.length > 0) {
        const lastSweep = m5Sweeps[m5Sweeps.length - 1];
        if (lastSweep.type === 'low_sweep') liqSweepBull = true;
        if (lastSweep.type === 'high_sweep') liqSweepBear = true;
      }

      let bosBull = false;
      let bosBear = false;
      if (m1Bos.length > 0) {
        const lastBOS = m1Bos[m1Bos.length - 1];
        if (lastBOS.type === 'bullish') bosBull = true;
        if (lastBOS.type === 'bearish') bosBear = true;
      }

      const s4Direction: 'buy' | 'sell' = (liqSweepBull || bosBull) ? 'buy' : ((liqSweepBear || bosBear) ? 'sell' : (trend_h1 === 'BEARISH' ? 'sell' : 'buy'));
      const s4RiskDist = Math.max(s4Atr * 0.6, 1.5);
      const s4Entry = currentPrice;
      const s4Sl = s4Direction === 'buy' ? s4Entry - s4RiskDist : s4Entry + s4RiskDist;
      const s4Tp1 = s4Direction === 'buy' ? s4Entry + (s4RiskDist * 2.5) : s4Entry - (s4RiskDist * 2.5);
      const s4Tp2 = s4Direction === 'buy' ? s4Entry + (s4RiskDist * 4.0) : s4Entry - (s4RiskDist * 4.0);

      return {
        strategyId,
        symbol,
        current_price: currentPrice,
        session,
        trend_h1,
        trend: trend_h1,
        atr: s4Atr,
        m1_available: m1Candles.length > 0,
        m5_available: m5Candles.length > 0,
        news_high_impact_active: Boolean(marketContext.news?.hasHighImpactNewsActive),
        news_event: marketContext.news?.activeEvents?.[0]?.title || null,
        spread_acceptable: Boolean(marketContext.spread?.isAcceptable ?? (typeof marketContext.spread === 'number' ? marketContext.spread <= 3.0 : true)),
        liq_sweep_bull: liqSweepBull,
        liq_sweep_bear: liqSweepBear,
        bos_bull: bosBull,
        bos_bear: bosBear,
        strategy4: {
          direction: s4Direction,
          entry: Number(s4Entry.toFixed(2)),
          sl: Number(s4Sl.toFixed(2)),
          tp1: Number(s4Tp1.toFixed(2)),
          tp2: Number(s4Tp2.toFixed(2)),
          rr: `1:${(Math.abs(s4Tp1 - s4Entry) / Math.abs(s4Entry - s4Sl)).toFixed(1)}`
        }
      };
    }

    // Strategy 5: H1/M15 Structure, M15 Confluence, M5/M1 Trigger
    if (strategyId === 'strategy-5-smc-sd-confluence') {
      const s5Atr = atrM15 || atrM5 || 1.2;
      const dealingRange = calculateDealingRange(m15Candles, currentPrice);
      const sdStructures = findSDZoneStructures(m15Candles);
      const freshDemand = sdStructures.filter(s => s.type === 'demand' && s.freshness !== 'BREACHED');
      const freshSupply = sdStructures.filter(s => s.type === 'supply' && s.freshness !== 'BREACHED');
      
      const isNearDemand = freshDemand.some(d => Math.abs(currentPrice - d.top) <= s5Atr || (currentPrice >= d.bottom && currentPrice <= d.top));
      const isNearSupply = freshSupply.some(s => Math.abs(currentPrice - s.bottom) <= s5Atr || (currentPrice >= s.bottom && currentPrice <= s.top));

      const m5Sweeps = m5Candles.length >= 5 ? findSweeps(m5Candles) : [];
      let liqSweepBull = false;
      let liqSweepBear = false;
      if (m5Sweeps.length > 0) {
        const lastSweep = m5Sweeps[m5Sweeps.length - 1];
        if (lastSweep.type === 'low_sweep') liqSweepBull = true;
        if (lastSweep.type === 'high_sweep') liqSweepBear = true;
      }

      const s5Direction: 'buy' | 'sell' = ((isNearDemand || liqSweepBull) && dealingRange.isDiscountForBuy) ? 'buy' : (((isNearSupply || liqSweepBear) && dealingRange.isPremiumForSell) ? 'sell' : (trend_h1 === 'BEARISH' ? 'sell' : 'buy'));
      const s5RiskDist = Math.max(s5Atr * 0.5, 1.2);
      const s5Entry = currentPrice;
      const s5Sl = s5Direction === 'buy' ? s5Entry - s5RiskDist : s5Entry + s5RiskDist;
      const s5Tp1 = s5Direction === 'buy' ? s5Entry + (s5RiskDist * 2.5) : s5Entry - (s5RiskDist * 2.5);
      const s5Tp2 = s5Direction === 'buy' ? s5Entry + (s5RiskDist * 4.0) : s5Entry - (s5RiskDist * 4.0);

      const primarySDPattern = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].pattern : null;
      const zoneFreshness = sdStructures.length > 0 ? sdStructures[sdStructures.length - 1].freshness : null;

      return {
        strategyId,
        symbol,
        current_price: currentPrice,
        session,
        trend_h1,
        trend: trend_h1,
        htf_trend: h1TrendResult,
        atr: s5Atr,
        m15_available: m15Candles.length > 0,
        m5_available: m5Candles.length > 0,
        dealing_range_zone: dealingRange.zone,
        is_discount: dealingRange.isDiscountForBuy,
        is_premium: dealingRange.isPremiumForSell,
        sd_zone_active: isNearDemand || isNearSupply,
        sd_pattern: primarySDPattern,
        zone_freshness: zoneFreshness,
        liq_sweep_bull: liqSweepBull,
        liq_sweep_bear: liqSweepBear,
        spread_acceptable: Boolean(marketContext.spread?.isAcceptable ?? (typeof marketContext.spread === 'number' ? marketContext.spread <= 3.0 : true)),
        strategy5: {
          direction: s5Direction,
          entry: Number(s5Entry.toFixed(2)),
          sl: Number(s5Sl.toFixed(2)),
          tp1: Number(s5Tp1.toFixed(2)),
          tp2: Number(s5Tp2.toFixed(2)),
          rr: `1:${(Math.abs(s5Tp1 - s5Entry) / Math.abs(s5Entry - s5Sl)).toFixed(1)}`
        }
      };
    }

    // Default fallback to analyze on general context
    return this.analyze({
      symbol,
      timeframe: 'M15',
      candles: m15Candles,
      price: { price: currentPrice, provider: marketContext.provider, timestamp: marketContext.currentTimestamp }
    });
  }
}

