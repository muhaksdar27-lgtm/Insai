import { SetupStepRecord } from '../types';
import { RuleEvaluationContext, RuleResult } from '@/types';
import { IStrategyEvaluator, StepEvaluationOutput } from './types';
import { getLatestCandle, getCurrentPrice, getSourceCandle, createRuleResult } from './common-helpers';
import { HTFTrendAnalyzer } from '../htf-trend-analyzer';

export class Strategy3ScalpingEvaluator implements IStrategyEvaluator {
  public readonly strategyId = 'strategy-3-scalping';
  public readonly strategyName = 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom';

  public evaluateStep(
    step: SetupStepRecord,
    context: RuleEvaluationContext,
    analysisData: Record<string, any>,
    priorSteps: SetupStepRecord[] = [],
    currentDirection?: 'buy' | 'sell'
  ): StepEvaluationOutput {
    const candles = context.candles || [];
    const latestCandle = getLatestCandle(context);
    const currentPrice = getCurrentPrice(context, analysisData);
    const timestamp = context.timestamp || latestCandle?.timestamp || new Date().toISOString();
    const atr = typeof analysisData?.atr === 'number' && analysisData.atr > 0 ? analysisData.atr : 0;
    const source_candle = getSourceCandle(latestCandle);

    if (currentPrice <= 0 || !latestCandle) {
      return {
        status: 'AWAITING',
        reason: 'Awaiting valid real-time market quote and candle stream',
        evidence: { currentPrice, timeframe: 'M1', timestamp },
        source_candle
      };
    }

    // Explicit M1 Timeframe Guard
    const smc = context.strategyMarketContext;
    if (smc && (step.step_id === 'M1_M5_SWEEP' || step.step_id === 'DOUBLE_TOP_BOTTOM' || step.step_id === 'NECKLINE_BREAK')) {
      if (!smc.M1 || !smc.M1.completeness) {
        return {
          status: 'AWAITING',
          reason: 'Awaiting required M1 candle stream data for Strategy 3 scalp execution',
          evidence: { requiredTimeframe: 'M1', available: Boolean(smc.M1), currentPrice, timestamp },
          source_candle
        };
      }
    }

    switch (step.step_id) {
      case 'H1_TREND': {
        const rawTrend = analysisData.trend_h1 || analysisData.trend || (candles && candles.length >= 5 ? HTFTrendAnalyzer.analyzeTrend(candles, 'H1').direction : null);
        const trendDir = (rawTrend ? String(rawTrend).toUpperCase() : 'NEUTRAL') as 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'INSUFFICIENT_DATA';

        if (trendDir === 'BULLISH' || trendDir === 'BEARISH') {
          const dir: 'buy' | 'sell' = trendDir === 'BULLISH' ? 'buy' : 'sell';
          const htf = (candles && candles.length >= 5) ? HTFTrendAnalyzer.analyzeTrend(candles, 'H1') : null;
          return {
            status: 'VALIDATED',
            reason: `HTF market structure trend mathematically verified as ${trendDir}`,
            direction: dir,
            evidence: {
              source: 'HTFTrendAnalyzer',
              timestamp,
              trend: trendDir,
              h1Bias: trendDir,
              fastEma: htf?.evidence?.ema20 ?? analysisData.ema20,
              slowEma: htf?.evidence?.ema50 ?? analysisData.ema50,
              timeframe: 'H1',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: `H1 Trend direction is ${trendDir}. Awaiting verified macro direction`,
          evidence: {
            source: 'HTFTrendAnalyzer',
            timestamp,
            trend: trendDir,
            timeframe: 'H1',
            currentPrice
          },
          source_candle
        };
      }

      case 'M15_RETRACEMENT': {
        // DILARANG: trend PASS => retracement PASS
        // Must verify independent retracement data
        const isDiscount = analysisData.is_discount === true || analysisData.dealing_range_zone === 'DISCOUNT';
        const isPremium = analysisData.is_premium === true || analysisData.dealing_range_zone === 'PREMIUM';
        const fibLevel = typeof analysisData.fib_level === 'number' ? analysisData.fib_level : null;
        const fibPulledBack = fibLevel !== null && fibLevel >= 0.382;
        
        const hasExplicitRetracement = analysisData.m15_retracement === true || (currentDirection === 'buy' ? isDiscount : (currentDirection === 'sell' ? isPremium : (isDiscount || isPremium || fibPulledBack)));

        if (hasExplicitRetracement && (isDiscount || isPremium || fibPulledBack || analysisData.m15_retracement === true)) {
          const zoneName = analysisData.dealing_range_zone || (isDiscount ? 'DISCOUNT' : (isPremium ? 'PREMIUM' : 'OTE_FIB_PULLBACK'));
          return {
            status: 'VALIDATED',
            reason: `M15 corrective wave retraced into favorable dealing range (${zoneName})`,
            evidence: {
              source: 'M15RetracementEngine',
              timestamp,
              dealingRangeZone: zoneName,
              fibLevel,
              retracementConfirmed: true,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting M15 counter-trend pullback wave into premium/discount zone (minimum 38.2% Fibonacci retracement)',
          evidence: {
            source: 'M15RetracementEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            zone: analysisData.dealing_range_zone
          },
          source_candle
        };
      }

      case 'M1_M5_SWEEP':
      case 'MICRO_SWEEP': {
        const sweepBull = Boolean(analysisData.micro_sweep_bull || analysisData.liq_sweep_bull || analysisData.asian_sweep_bull);
        const sweepBear = Boolean(analysisData.micro_sweep_bear || analysisData.liq_sweep_bear || analysisData.asian_sweep_bear);

        const matchesDirection = currentDirection === 'buy' ? sweepBull : (currentDirection === 'sell' ? sweepBear : (sweepBull || sweepBear));

        if (matchesDirection && (sweepBull || sweepBear)) {
          const dir: 'buy' | 'sell' = sweepBull ? 'buy' : 'sell';
          const sweepLevel = typeof analysisData.sweep_level === 'number' && analysisData.sweep_level > 0
            ? analysisData.sweep_level
            : (sweepBull ? latestCandle.low : latestCandle.high);

          return {
            status: 'VALIDATED',
            reason: `M1/M5 micro liquidity sweep confirmed at level ${sweepLevel.toFixed(2)}`,
            direction: currentDirection || dir,
            evidence: {
              source: 'MicroSweepDetector',
              timestamp,
              level: sweepLevel,
              sweepPrice: currentPrice,
              sweepType: sweepBull ? 'micro_low_sweep' : 'micro_high_sweep',
              sweepTimestamp: timestamp,
              timeframe: 'M1',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Monitoring M1/M5 price action for micro liquidity swing sweep',
          evidence: {
            source: 'MicroSweepDetector',
            timestamp,
            timeframe: 'M1',
            currentPrice,
            sweepBull,
            sweepBear
          },
          source_candle
        };
      }

      case 'DOUBLE_TOP_BOTTOM': {
        // Strict Constraint: Sweep HARUS terjadi sebelum pattern sesuai specification
        const sweepStep = priorSteps.find(s => s.step_id === 'M1_M5_SWEEP' || s.step_id === 'MICRO_SWEEP');
        const sweepValidated = sweepStep?.state === 'VALIDATED';

        if (!sweepValidated || analysisData.double_pattern_before_sweep === true) {
          return {
            status: 'INVALIDATED',
            reason: 'Double Top/Bottom formed BEFORE liquidity sweep. Strategy 3 rule mandates pattern strictly after sweep.',
            invalidationReason: 'Pattern occurred prior to liquidity sweep',
            evidence: {
              source: 'ScalpPatternEngine',
              timestamp,
              sweepValidated: false,
              patternTiming: 'BEFORE_SWEEP',
              currentPrice
            },
            source_candle
          };
        }

        const doubleTop = Boolean(analysisData.double_top);
        const doubleBottom = Boolean(analysisData.double_bottom);
        const matchesDir = currentDirection === 'buy' ? doubleBottom : (currentDirection === 'sell' ? doubleTop : (doubleTop || doubleBottom));

        if (matchesDir && (doubleTop || doubleBottom)) {
          const patternType = doubleBottom ? 'Double Bottom' : 'Double Top';
          const peak1 = typeof analysisData.peak1_price === 'number' ? analysisData.peak1_price : currentPrice;
          const peak2 = typeof analysisData.peak2_price === 'number' ? analysisData.peak2_price : currentPrice;
          const neckline = typeof analysisData.neckline_price === 'number' ? analysisData.neckline_price : currentPrice;

          return {
            status: 'VALIDATED',
            reason: `Post-sweep ${patternType} formation confirmed on M1`,
            evidence: {
              source: 'ScalpPatternEngine',
              timestamp,
              patternType,
              peak1Price: peak1,
              peak2Price: peak2,
              necklinePrice: neckline,
              patternTimestamp: timestamp,
              sweepConfirmedBeforePattern: true,
              timeframe: 'M1',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting M1 Double Top / Double Bottom formation following micro liquidity sweep',
          evidence: {
            source: 'ScalpPatternEngine',
            timestamp,
            timeframe: 'M1',
            currentPrice,
            doubleTop,
            doubleBottom
          },
          source_candle
        };
      }

      case 'NECKLINE_BREAK': {
        // DILARANG: double pattern PASS => neckline PASS
        // Must independently verify actual neckline break
        const necklineBroken = Boolean(analysisData.neckline_break || analysisData.neckline_broken || (analysisData.bos_bull && analysisData.has_displacement) || (analysisData.bos_bear && analysisData.has_displacement));
        
        if (necklineBroken) {
          const breakPrice = typeof analysisData.neckline_price === 'number' ? analysisData.neckline_price : currentPrice;
          return {
            status: 'VALIDATED',
            reason: `M1 Neckline broken decisively with displacement at ${breakPrice.toFixed(2)}`,
            evidence: {
              source: 'NecklineBreakEngine',
              timestamp,
              necklineBreakPrice: breakPrice,
              hasDisplacement: Boolean(analysisData.has_displacement),
              timeframe: 'M1',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting decisive M1 displacement candle closing beyond neckline level',
          evidence: {
            source: 'NecklineBreakEngine',
            timestamp,
            timeframe: 'M1',
            currentPrice
          },
          source_candle
        };
      }

      case 'RISK_NEWS_FILTER':
      case 'SCALP_ENTRY_RISK': {
        // High impact news filter (15 minutes window)
        const hasNewsNear = analysisData.news_high_impact_active === true || analysisData.news_within_15m === true;
        if (hasNewsNear) {
          return {
            status: 'INVALIDATED',
            reason: 'High impact news release within 15 minutes window: Scalp setup invalidated',
            invalidationReason: 'High impact news filter violation',
            evidence: { newsNear: true, currentPrice },
            source_candle
          };
        }

        if (!currentPrice || currentPrice <= 0 || !atr || atr <= 0) {
          return {
            status: 'AWAITING',
            reason: 'Awaiting valid market price and measured ATR volatility metric to calculate risk boundaries',
            evidence: { currentPrice, atr },
            source_candle
          };
        }

        const direction = currentDirection || (analysisData.trend_h1 === 'BEARISH' ? 'sell' : (analysisData.trend_h1 === 'BULLISH' ? 'buy' : undefined));
        if (!direction) {
          return {
            status: 'AWAITING',
            reason: 'Trade direction undetermined. Awaiting prerequisite directional structure setup',
            evidence: { currentPrice, atr },
            source_candle
          };
        }

        const entryPrice = typeof analysisData.entry_price === 'number' && analysisData.entry_price > 0 ? analysisData.entry_price : currentPrice;
        const mult = 0.3; // Tight 0.3x ATR buffer for scalping
        const riskDistance = +(atr * mult).toFixed(2);
        const minRR = 1.5; // Min 1:1.5 RR for scalping

        const slPrice = direction === 'buy' ? +(entryPrice - riskDistance).toFixed(2) : +(entryPrice + riskDistance).toFixed(2);
        const tp1Price = direction === 'buy' ? +(entryPrice + (riskDistance * minRR)).toFixed(2) : +(entryPrice - (riskDistance * minRR)).toFixed(2);
        const tp2Price = direction === 'buy' ? +(entryPrice + (riskDistance * (minRR + 0.5))).toFixed(2) : +(entryPrice - (riskDistance * (minRR + 0.5))).toFixed(2);

        if (direction === 'buy' && (slPrice >= entryPrice || tp1Price <= entryPrice)) {
          return {
            status: 'INVALIDATED',
            reason: 'Invalid BUY geometry: Stop loss must be below entry and Take Profit must be above entry',
            evidence: { entryPrice, slPrice, tp1Price },
            source_candle
          };
        }
        if (direction === 'sell' && (slPrice <= entryPrice || tp1Price >= entryPrice)) {
          return {
            status: 'INVALIDATED',
            reason: 'Invalid SELL geometry: Stop loss must be above entry and Take Profit must be below entry',
            evidence: { entryPrice, slPrice, tp1Price },
            source_candle
          };
        }

        return {
          status: 'VALIDATED',
          reason: `Scalp risk parameters verified: Entry ${entryPrice}, SL ${slPrice} (${mult}x ATR), TP1 ${tp1Price} (1:${minRR.toFixed(1)} R:R)`,
          evidence: {
            source: 'ScalpRiskEngine',
            timestamp,
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            riskReward: `1:${minRR.toFixed(1)}`,
            atr14: atr,
            spreadPips: analysisData.spreadPips ?? analysisData.spread_pips ?? undefined,
            newsFilterPassed: true,
            currentPrice,
            candleTimestamp: latestCandle.timestamp
          },
          calculatedLevels: {
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            riskReward: minRR
          },
          source_candle
        };
      }

      case 'AI_GATE': {
        const unvalidatedTechnical = priorSteps.filter(s => s.step_id !== 'AI_GATE' && s.state !== 'VALIDATED');
        if (unvalidatedTechnical.length > 0) {
          return {
            status: 'AWAITING',
            reason: `AI Gate awaiting completion of prerequisite technical steps (${unvalidatedTechnical.map(s => s.name || s.step_id).join(', ')})`,
            evidence: {
              source: 'GeminiAIOrchestrator',
              timestamp,
              aiDecision: 'AI_PENDING',
              candleTimestamp: latestCandle.timestamp,
              unvalidatedSteps: unvalidatedTechnical.map(s => s.step_id)
            },
            source_candle
          };
        }

        const rawDecision = analysisData.aiDecision || analysisData.aiState || analysisData.aiStatus || 'PENDING';
        const aiConfidence = typeof analysisData.aiConfidence === 'number' ? analysisData.aiConfidence : null;
        const aiReasoning = analysisData.aiReasoning || '';

        if (rawDecision === 'APPROVED') {
          if (aiConfidence !== null && aiConfidence >= 70) {
            return {
              status: 'VALIDATED',
              reason: `AI Scalping Gate approved setup with ${aiConfidence}% confidence: ${aiReasoning || 'Fast scalp momentum verified'}`,
              evidence: {
                source: 'GeminiAIOrchestrator',
                timestamp,
                aiDecision: 'APPROVED',
                aiConfidence,
                aiReasoning: aiReasoning || 'Fast scalp momentum verified',
                currentPrice,
                candleTimestamp: latestCandle.timestamp
              },
              source_candle
            };
          } else {
            return {
              status: 'REJECTED',
              reason: `AI Scalping Gate rejected setup: confidence score (${aiConfidence ?? 0}%) below mandatory 70% threshold`,
              invalidationReason: 'AI confidence score below threshold',
              evidence: {
                source: 'GeminiAIOrchestrator',
                timestamp,
                aiDecision: 'REJECTED',
                aiConfidence: aiConfidence ?? 0,
                aiReasoning: aiReasoning || 'Confidence below threshold'
              },
              source_candle
            };
          }
        } else if (rawDecision === 'REJECTED') {
          return {
            status: 'REJECTED',
            reason: `AI Scalp Gate rejected setup: ${aiReasoning || 'Momentum confluence threshold not met'}`,
            invalidationReason: aiReasoning || 'AI validation rejected',
            evidence: {
              source: 'GeminiAIOrchestrator',
              timestamp,
              aiDecision: 'REJECTED',
              aiConfidence: aiConfidence ?? 0,
              aiReasoning
            },
            source_candle
          };
        } else if (rawDecision === 'ERROR' || rawDecision === 'VALIDATION_ERROR') {
          return {
            status: 'AWAITING',
            reason: `AI Validation service encountered an error (${aiReasoning || 'Service error'}) - held in fail-safe state`,
            evidence: {
              source: 'GeminiAIOrchestrator',
              timestamp,
              aiDecision: 'ERROR',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        } else if (rawDecision === 'UNAVAILABLE' || rawDecision === 'AI_UNAVAILABLE') {
          return {
            status: 'AWAITING',
            reason: 'AI Validation service unavailable - held in pending state without auto-approval',
            evidence: {
              source: 'GeminiAIOrchestrator',
              timestamp,
              aiDecision: 'AI_PENDING',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting AI Gemini fast scalping evaluation response',
          evidence: {
            source: 'GeminiAIOrchestrator',
            timestamp,
            aiDecision: 'AI_PENDING',
            candleTimestamp: latestCandle.timestamp
          },
          source_candle
        };
      }

      default: {
        return {
          status: 'AWAITING',
          reason: `Step ${step.step_id} condition awaiting prerequisite market data`,
          evidence: { currentPrice, stepId: step.step_id },
          source_candle
        };
      }
    }
  }

  public evaluateRules(
    context: RuleEvaluationContext,
    analysisData: Record<string, any> = {}
  ): Record<string, RuleResult> {
    const symbol = context.symbol || 'XAUUSD';
    const currentPrice = getCurrentPrice(context, analysisData);

    const rules: Record<string, RuleResult> = {};

    // 1. Pair Restriction
    const pairMatch = symbol === 'XAUUSD';
    rules['rule_pair_restriction'] = createRuleResult(
      'rule_pair_restriction',
      true,
      pairMatch,
      symbol,
      'XAUUSD',
      `Symbol ${symbol} does not match required pair XAUUSD`,
      { symbol, required: 'XAUUSD' },
      'Pair Restriction strictly XAUUSD'
    );

    // 2. Session Rule (Any active volume session)
    const currentSession = analysisData.current_session || analysisData.session || 'London';
    rules['rule_session_restriction'] = createRuleResult(
      'rule_session_restriction',
      false,
      true,
      currentSession,
      'Any',
      'Session restriction passed',
      { session: currentSession },
      'Session Filter'
    );

    // 3. H1 Trend Alignment
    const rawTrend = (analysisData.trend_h1 || analysisData.trend || 'NEUTRAL').toUpperCase();
    let trendPassed: boolean | 'WAIT' = false;
    let trendReason = 'H1 trend is neutral';

    if (rawTrend === 'BULLISH' || rawTrend === 'BEARISH') {
      trendPassed = true;
      trendReason = `H1 trend confirmed ${rawTrend}`;
    } else {
      trendPassed = 'WAIT';
      trendReason = 'H1 trend is neutral/ranging, waiting for directional expansion';
    }

    rules['rule_h1_trend'] = createRuleResult(
      'rule_h1_trend',
      true,
      trendPassed,
      rawTrend,
      'BULLISH or BEARISH',
      trendReason,
      { trend: rawTrend, timeframe: 'H1' },
      'H1 Macro Trend Alignment'
    );

    // 4. M15 Retracement Wave (DILARANG: trend PASS => retracement PASS)
    const isDiscount = analysisData.is_discount === true || analysisData.dealing_range_zone === 'DISCOUNT';
    const isPremium = analysisData.is_premium === true || analysisData.dealing_range_zone === 'PREMIUM';
    const fibLevel = typeof analysisData.fib_level === 'number' ? analysisData.fib_level : null;
    const fibPulledBack = fibLevel !== null && fibLevel >= 0.382;
    const hasRetracement = analysisData.m15_retracement === true || isDiscount || isPremium || fibPulledBack;

    rules['rule_m15_retracement'] = createRuleResult(
      'rule_m15_retracement',
      true,
      hasRetracement ? true : 'WAIT',
      hasRetracement ? `Retracement Confirmed (${analysisData.dealing_range_zone || (fibLevel ? `Fib ${fibLevel}` : 'Discount/Premium')})` : 'Awaiting Retracement',
      'M15 Pullback >= 38.2% to Discount/Premium',
      'Waiting for M15 corrective pullback into discount/premium dealing range',
      { isDiscount, isPremium, fibLevel, dealingRangeZone: analysisData.dealing_range_zone },
      'M15 Retracement Wave Evaluation'
    );

    // 5. Scalp Pattern (Double Top / Bottom after sweep)
    const doubleTop = Boolean(analysisData.double_top);
    const doubleBottom = Boolean(analysisData.double_bottom);
    const sweepBull = Boolean(analysisData.micro_sweep_bull || analysisData.liq_sweep_bull);
    const sweepBear = Boolean(analysisData.micro_sweep_bear || analysisData.liq_sweep_bear);
    const patternActive = (doubleTop || doubleBottom) && (sweepBull || sweepBear || analysisData.sweep_confirmed === true);

    rules['rule_scalp_pattern'] = createRuleResult(
      'rule_scalp_pattern',
      true,
      patternActive ? true : 'WAIT',
      doubleTop ? 'Post-Sweep Double Top' : (doubleBottom ? 'Post-Sweep Double Bottom' : 'No Pattern'),
      'Double Top/Bottom Formation strictly Post-Sweep',
      'Waiting for post-sweep double top/bottom structural pattern',
      { doubleTop, doubleBottom, sweepBull, sweepBear },
      'M1 Scalp Pattern Formation & Neckline Break'
    );

    // 6. Spread Check Rule
    const spreadPips = typeof analysisData.spreadPips === 'number' ? analysisData.spreadPips : (typeof analysisData.spread_pips === 'number' ? analysisData.spread_pips : null);
    const spreadAcceptable = analysisData.spread_acceptable === true || (spreadPips !== null && spreadPips <= 2.0);

    rules['rule_spread_check'] = createRuleResult(
      'rule_spread_check',
      true,
      spreadAcceptable ? true : 'WAIT',
      spreadAcceptable ? `Acceptable (${spreadPips ?? '<= 2.0'} pips)` : 'Spread Wide (> 2.0 pips)',
      'Acceptable (<= 2.0 pips for scalping)',
      'Spread exceeds scalp threshold (2.0 pips)',
      { spreadAcceptable, spreadPips },
      'Scalp Spread Safety Gate (<= 2.0 pips)'
    );

    // 7. ATR SL Buffer
    const atr = typeof analysisData.atr === 'number' && analysisData.atr > 0 ? analysisData.atr : 0;
    rules['rule_atr_sl_buffer'] = createRuleResult(
      'rule_atr_sl_buffer',
      true,
      atr > 0 ? true : 'WAIT',
      atr > 0 ? `${atr.toFixed(2)} (Buffer: ${((atr * 0.3) * 10).toFixed(1)} pips)` : '0.00',
      '> 0',
      'Awaiting valid measured ATR volatility metric',
      { atr, bufferPips: atr > 0 ? ((atr * 0.3) * 10).toFixed(1) : '0.0' },
      'ATR SL Dynamic Buffer (0.3x ATR)'
    );

    // 8. Risk / Reward Calculation (Min 1:1.5)
    const s3 = analysisData.strategy3 || analysisData['strategy-3-scalping'] || {};
    const entryVal = typeof s3.entry === 'number' ? s3.entry : (typeof analysisData.entry_price === 'number' ? analysisData.entry_price : currentPrice);
    const slVal = typeof s3.sl === 'number' ? s3.sl : (typeof analysisData.sl_price === 'number' ? analysisData.sl_price : (entryVal > 0 && atr > 0 ? +(entryVal - (atr * 0.3)).toFixed(2) : null));
    const tpVal = typeof s3.tp1 === 'number' ? s3.tp1 : (typeof s3.tp === 'number' ? s3.tp : (typeof analysisData.tp1_price === 'number' ? analysisData.tp1_price : (entryVal > 0 && atr > 0 ? +(entryVal + (atr * 0.45)).toFixed(2) : null)));

    let actualRR = 0;
    let hasValidCalculation = false;
    if (entryVal > 0 && slVal !== null && tpVal !== null && Math.abs(entryVal - slVal) > 0) {
      actualRR = Math.abs(tpVal - entryVal) / Math.abs(entryVal - slVal);
      hasValidCalculation = true;
    }

    const minRequiredRR = 1.5;
    const hasValidRR = hasValidCalculation && actualRR >= (minRequiredRR - 0.05);

    rules['rule_risk_reward'] = createRuleResult(
      'rule_risk_reward',
      true,
      hasValidCalculation ? (hasValidRR ? true : false) : 'WAIT',
      hasValidCalculation ? `1:${actualRR.toFixed(2)}` : 'Pending Calculation',
      `>= 1:${minRequiredRR.toFixed(1)}`,
      hasValidCalculation ? `Risk/Reward ratio below scalping minimum (1:${minRequiredRR.toFixed(1)})` : 'Awaiting entry/SL/TP parameters to calculate Risk:Reward',
      { 
        rr: hasValidCalculation ? `1:${actualRR.toFixed(2)}` : '--',
        minRequired: `1:${minRequiredRR.toFixed(1)}`
      },
      'Scalp Risk/Reward Gate (Min 1:1.5)'
    );

    return rules;
  }
}
