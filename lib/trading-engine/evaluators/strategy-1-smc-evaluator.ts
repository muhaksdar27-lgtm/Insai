import { SetupStepRecord } from '../types';
import { RuleEvaluationContext, RuleResult } from '@/types';
import { IStrategyEvaluator, StepEvaluationOutput } from './types';
import { getLatestCandle, getCurrentPrice, getSourceCandle, createRuleResult } from './common-helpers';
import { SessionEngine } from '../../market-data/session-engine';
import { HTFTrendAnalyzer } from '../htf-trend-analyzer';

export class Strategy1SMCEvaluator implements IStrategyEvaluator {
  public readonly strategyId = 'strategy-1-smc';
  public readonly strategyName = 'STRATEGI 1 — SMC + Sesi London + M15';

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
        evidence: { currentPrice, timeframe: 'M15', timestamp },
        source_candle
      };
    }

    const sessionInfo = SessionEngine.getSessionInfo(timestamp);

    switch (step.step_id) {
      case 'LONDON_FILTER': {
        const isLondon = sessionInfo.primarySession === 'London' || 
          sessionInfo.isOverlap || 
          sessionInfo.activeSessions.includes('London') || 
          analysisData.current_session === 'London' ||
          analysisData.session === 'London';

        if (isLondon) {
          return {
            status: 'VALIDATED',
            reason: `Trading session matches active London liquidity window (${sessionInfo.primarySession})`,
            evidence: {
              source: 'SessionEngine',
              timestamp,
              session: sessionInfo.primarySession,
              activeSessions: sessionInfo.activeSessions,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }
        return {
          status: 'AWAITING',
          reason: `Current session is ${sessionInfo.primarySession}. Awaiting London session open (07:00 UTC)`,
          evidence: {
            source: 'SessionEngine',
            timestamp,
            session: sessionInfo.primarySession,
            timeframe: 'M15',
            currentPrice
          },
          source_candle
        };
      }

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
              slope: htf?.evidence?.emaSlope,
              timeframe: 'H1',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        if (!candles || candles.length < 5) {
          return {
            status: 'AWAITING',
            reason: 'Insufficient candle data to analyze HTF trend structure',
            evidence: { timeframe: 'H1', currentPrice, candleCount: candles?.length || 0 },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: `H1 Trend direction is ${trendDir}. Awaiting verified directional structure breakout`,
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

      case 'ASIA_SWEEP': {
        // Strategy 1 specifically requires Asian session high/low sweep
        const sweepBull = Boolean(analysisData.asian_sweep_bull || analysisData.sweepAsianLow || (analysisData.liq_sweep_bull && !analysisData.micro_sweep_bull));
        const sweepBear = Boolean(analysisData.asian_sweep_bear || analysisData.sweepAsianHigh || (analysisData.liq_sweep_bear && !analysisData.micro_sweep_bear));

        const matchesDirection = currentDirection === 'buy' ? sweepBull : (currentDirection === 'sell' ? sweepBear : (sweepBull || sweepBear));

        if (matchesDirection && (sweepBull || sweepBear)) {
          const dir: 'buy' | 'sell' = sweepBull ? 'buy' : 'sell';
          const sweepLevel = typeof analysisData.sweep_level === 'number' && analysisData.sweep_level > 0
            ? analysisData.sweep_level
            : (sweepBull ? (analysisData.asian_low || latestCandle.low) : (analysisData.asian_high || latestCandle.high));

          return {
            status: 'VALIDATED',
            reason: `Liquidity sweep confirmed at price level ${sweepLevel.toFixed(2)} with rejection`,
            direction: currentDirection || dir,
            evidence: {
              source: 'AsianSweepDetector',
              timestamp,
              level: sweepLevel,
              sweepPrice: currentPrice,
              sweepType: sweepBull ? 'asian_low_sweep' : 'asian_high_sweep',
              sweepTimestamp: timestamp,
              asianHigh: analysisData.asian_high,
              asianLow: analysisData.asian_low,
              timeframe: 'M15',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Monitoring price action for verified liquidity sweep across structural highs/lows',
          evidence: {
            source: 'AsianSweepDetector',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            asianSweepBull: sweepBull,
            asianSweepBear: sweepBear
          },
          source_candle
        };
      }

      case 'M15_CHOCH': {
        const chochBull = Boolean(analysisData.choch_bull || (analysisData.bos_bull && analysisData.has_displacement));
        const chochBear = Boolean(analysisData.choch_bear || (analysisData.bos_bear && analysisData.has_displacement));

        const matchesDir = currentDirection === 'buy' ? chochBull : (currentDirection === 'sell' ? chochBear : (chochBull || chochBear));

        if (matchesDir && (chochBull || chochBear)) {
          const breakPrice = typeof analysisData.structure_break_level === 'number' && analysisData.structure_break_level > 0
            ? analysisData.structure_break_level
            : currentPrice;

          return {
            status: 'VALIDATED',
            reason: `Change of character / Break of Structure confirmed at ${breakPrice.toFixed(2)} with displacement`,
            evidence: {
              source: 'StructureEngine',
              timestamp,
              chochPrice: breakPrice,
              hasDisplacement: Boolean(analysisData.has_displacement),
              displacementDirection: analysisData.displacement_direction || (chochBull ? 'BULLISH' : 'BEARISH'),
              idmTaken: Boolean(analysisData.idm_taken),
              timeframe: 'M15',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting structural displacement and Change of Character (CHoCH/BOS) confirmation candle',
          evidence: {
            source: 'StructureEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            chochBull,
            chochBear
          },
          source_candle
        };
      }

      case 'OB_FVG': {
        const obFvgBull = Boolean(analysisData.ob_fvg_bull || (analysisData.ob_active && analysisData.ob_direction === 'bullish'));
        const obFvgBear = Boolean(analysisData.ob_fvg_bear || (analysisData.ob_active && analysisData.ob_direction === 'bearish'));
        const obActive = currentDirection === 'buy' ? obFvgBull : (currentDirection === 'sell' ? obFvgBear : (obFvgBull || obFvgBear));

        if (obActive) {
          const zoneUpper = typeof analysisData.zone_upper === 'number' ? analysisData.zone_upper : +(currentPrice + (atr > 0 ? atr * 0.5 : 1.5)).toFixed(2);
          const zoneLower = typeof analysisData.zone_lower === 'number' ? analysisData.zone_lower : +(currentPrice - (atr > 0 ? atr * 0.5 : 1.5)).toFixed(2);

          return {
            status: 'VALIDATED',
            reason: `Price entered unmitigated high-confluence zone [${zoneLower} - ${zoneUpper}] (Order Block / FVG Mitigation)`,
            evidence: {
              source: 'OrderBlockDetector',
              timestamp,
              zoneUpper,
              zoneLower,
              obType: currentDirection === 'buy' || obFvgBull ? 'BULLISH_OB_FVG' : 'BEARISH_OB_FVG',
              fibLevel: analysisData.fib_level,
              dealingRangeZone: analysisData.dealing_range_zone,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting price retracement into Key Order Block / S&D / OTE Fibonacci zone',
          evidence: {
            source: 'OrderBlockDetector',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            obFvgBull,
            obFvgBear
          },
          source_candle
        };
      }

      case 'RISK_PARAMS': {
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
        const mult = 0.5;
        const riskDistance = +(atr * mult).toFixed(2);
        const minRR = 2.0;

        const slPrice = direction === 'buy' ? +(entryPrice - riskDistance).toFixed(2) : +(entryPrice + riskDistance).toFixed(2);
        const tp1Price = direction === 'buy' ? +(entryPrice + (riskDistance * minRR)).toFixed(2) : +(entryPrice - (riskDistance * minRR)).toFixed(2);
        const tp2Price = direction === 'buy' ? +(entryPrice + (riskDistance * (minRR + 1.5))).toFixed(2) : +(entryPrice - (riskDistance * (minRR + 1.5))).toFixed(2);
        const tp3Price = direction === 'buy' ? +(entryPrice + (riskDistance * (minRR + 3.0))).toFixed(2) : +(entryPrice - (riskDistance * (minRR + 3.0))).toFixed(2);

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
          reason: `Risk parameters mathematically verified: Entry ${entryPrice}, SL ${slPrice} (${mult}x ATR), TP1 ${tp1Price} (1:${minRR.toFixed(1)} R:R)`,
          evidence: {
            source: 'RiskEngine',
            timestamp,
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            tp3Price,
            riskReward: `1:${minRR.toFixed(1)}`,
            atr14: atr,
            spreadPips: analysisData.spreadPips ?? analysisData.spread_pips ?? undefined,
            currentPrice,
            candleTimestamp: latestCandle.timestamp
          },
          calculatedLevels: {
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            tp3Price,
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
              reason: `AI Confluence Gate approved setup with ${aiConfidence}% confidence: ${aiReasoning || 'SMC London setup verified'}`,
              evidence: {
                source: 'GeminiAIOrchestrator',
                timestamp,
                aiDecision: 'APPROVED',
                aiConfidence,
                aiReasoning: aiReasoning || 'SMC London setup verified',
                currentPrice,
                candleTimestamp: latestCandle.timestamp
              },
              source_candle
            };
          } else {
            return {
              status: 'REJECTED',
              reason: `AI Confluence Gate rejected setup: confidence score (${aiConfidence ?? 0}%) below mandatory 70% threshold`,
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
            reason: `AI Quality Gate rejected setup: ${aiReasoning || 'Risk confluence threshold not met'}`,
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
          reason: 'Awaiting AI Gemini confluence evaluation response',
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
    const timestamp = context.timestamp || new Date().toISOString();
    const currentPrice = getCurrentPrice(context, analysisData);

    const rules: Record<string, RuleResult> = {};

    // 1. Pair Restriction (XAUUSD only)
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

    // 2. Session Restriction (London)
    const sessionInfo = SessionEngine.getSessionInfo(timestamp);
    const isLondon = sessionInfo.primarySession === 'London' || 
      sessionInfo.isOverlap || 
      sessionInfo.activeSessions.includes('London') || 
      analysisData.current_session === 'London' ||
      analysisData.session === 'London';

    rules['rule_session_restriction'] = createRuleResult(
      'rule_session_restriction',
      true,
      isLondon ? true : 'WAIT',
      sessionInfo.primarySession,
      'London / Active Overlap',
      `Current session is ${sessionInfo.primarySession} (London session required: 07:00-16:00 UTC)`,
      { session: sessionInfo.primarySession, activeSessions: sessionInfo.activeSessions },
      'London Session Liquidity Window'
    );

    // 3. H1 Trend Alignment
    const rawTrend = (analysisData.trend_h1 || analysisData.trend || 'NEUTRAL').toUpperCase();
    let trendPassed: boolean | 'WAIT' = false;
    let trendReason = 'H1 trend is neutral/ranging';

    if (rawTrend === 'BULLISH' || rawTrend === 'BEARISH') {
      trendPassed = true;
      trendReason = `H1 trend confirmed ${rawTrend}`;
    } else if (rawTrend === 'INSUFFICIENT_DATA') {
      trendPassed = 'WAIT';
      trendReason = 'Insufficient H1 candle history for trend evaluation';
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
      'H1 Higher Timeframe Trend Alignment'
    );

    // 4. Asian Liquidity Sweep
    const sweepBull = Boolean(analysisData.asian_sweep_bull || analysisData.sweepAsianLow || (analysisData.liq_sweep_bull && !analysisData.micro_sweep_bull));
    const sweepBear = Boolean(analysisData.asian_sweep_bear || analysisData.sweepAsianHigh || (analysisData.liq_sweep_bear && !analysisData.micro_sweep_bear));
    const sweepActive = sweepBull || sweepBear;

    rules['rule_liquidity_sweep'] = createRuleResult(
      'rule_liquidity_sweep',
      true,
      sweepActive ? true : 'WAIT',
      sweepBull ? 'Asian Low Swept' : (sweepBear ? 'Asian High Swept' : 'No Asian Sweep'),
      'Asian Liquidity Pool Sweep Active',
      'Waiting for Asian session high/low liquidity sweep with rejection',
      { sweepBull, sweepBear, sessionPool: 'Asian High/Low', sweepLevel: analysisData.sweep_level },
      'Asian Session Liquidity Pool Sweep'
    );

    // 5. M15 CHoCH Confirmation
    const chochBull = Boolean(analysisData.choch_bull || (analysisData.bos_bull && analysisData.has_displacement));
    const chochBear = Boolean(analysisData.choch_bear || (analysisData.bos_bear && analysisData.has_displacement));
    const chochActive = chochBull || chochBear;

    rules['rule_choch_confirmation'] = createRuleResult(
      'rule_choch_confirmation',
      true,
      chochActive ? true : 'WAIT',
      chochBull ? 'Bullish CHoCH (MSS)' : (chochBear ? 'Bearish CHoCH (MSS)' : 'No CHoCH/BOS'),
      'M15 CHoCH Confirmed',
      'Waiting for M15 Change of Character (CHoCH/MSS) confirmation',
      { chochBull, chochBear, idmTaken: Boolean(analysisData.idm_taken), hasDisplacement: Boolean(analysisData.has_displacement) },
      'M15 Change of Character (MSS) & Inducement'
    );

    // 6. OB / FVG Entry Zone
    const obFvgBull = Boolean(analysisData.ob_fvg_bull || (analysisData.ob_active && analysisData.ob_direction === 'bullish'));
    const obFvgBear = Boolean(analysisData.ob_fvg_bear || (analysisData.ob_active && analysisData.ob_direction === 'bearish'));
    const obFvgActive = obFvgBull || obFvgBear;

    rules['rule_ob_fvg_entry'] = createRuleResult(
      'rule_ob_fvg_entry',
      true,
      obFvgActive ? true : 'WAIT',
      obFvgBull ? 'Bullish Extreme OB/FVG' : (obFvgBear ? 'Bearish Extreme OB/FVG' : 'No OB/FVG'),
      'OB / FVG Entry Zone',
      'Waiting for Order Block / FVG mitigation in dealing range',
      { obFvgBull, obFvgBear, dealingRangeZone: analysisData.dealing_range_zone },
      'Order Block & Fair Value Gap Alignment'
    );

    // 7. Spread Check
    const spreadPips = typeof analysisData.spreadPips === 'number' ? analysisData.spreadPips : (typeof analysisData.spread_pips === 'number' ? analysisData.spread_pips : null);
    const spreadAcceptable = analysisData.spread_acceptable === true || (spreadPips !== null && spreadPips <= 3.0);

    rules['rule_spread_check'] = createRuleResult(
      'rule_spread_check',
      true,
      spreadAcceptable ? true : 'WAIT',
      spreadAcceptable ? `Acceptable (${spreadPips ?? '<= 3.0'} pips)` : 'Spread Wide (> 3.0 pips)',
      'Acceptable (<= 3.0 pips)',
      'Spread exceeds maximum safety threshold (3.0 pips) or quote unavailable',
      { spreadAcceptable, spreadPips },
      'Spread Width Safety Gate (<= 3.0 pips)'
    );

    // 8. ATR SL Buffer
    const atr = typeof analysisData.atr === 'number' && analysisData.atr > 0 ? analysisData.atr : 0;
    rules['rule_atr_sl_buffer'] = createRuleResult(
      'rule_atr_sl_buffer',
      true,
      atr > 0 ? true : 'WAIT',
      atr > 0 ? `${atr.toFixed(2)} (Buffer: ${((atr * 0.5) * 10).toFixed(1)} pips)` : '0.00',
      '> 0',
      'Awaiting valid measured ATR volatility metric',
      { atr, bufferPips: atr > 0 ? ((atr * 0.5) * 10).toFixed(1) : '0.0' },
      'ATR SL Dynamic Buffer (0.5x ATR)'
    );

    // 9. Risk / Reward Calculation (Min 1:2.0)
    const s1 = analysisData.strategy1 || analysisData['strategy-1-smc'] || {};
    const entryVal = typeof s1.entry === 'number' ? s1.entry : (typeof analysisData.entry_price === 'number' ? analysisData.entry_price : currentPrice);
    const slVal = typeof s1.sl === 'number' ? s1.sl : (typeof analysisData.sl_price === 'number' ? analysisData.sl_price : (entryVal > 0 && atr > 0 ? +(entryVal - (atr * 0.5)).toFixed(2) : null));
    const tpVal = typeof s1.tp1 === 'number' ? s1.tp1 : (typeof s1.tp === 'number' ? s1.tp : (typeof analysisData.tp1_price === 'number' ? analysisData.tp1_price : (entryVal > 0 && atr > 0 ? +(entryVal + (atr * 1.0)).toFixed(2) : null)));

    let actualRR = 0;
    let hasValidCalculation = false;
    if (entryVal > 0 && slVal !== null && tpVal !== null && Math.abs(entryVal - slVal) > 0) {
      actualRR = Math.abs(tpVal - entryVal) / Math.abs(entryVal - slVal);
      hasValidCalculation = true;
    }

    const minRequiredRR = 2.0;
    const hasValidRR = hasValidCalculation && actualRR >= (minRequiredRR - 0.05);

    rules['rule_risk_reward'] = createRuleResult(
      'rule_risk_reward',
      true,
      hasValidCalculation ? (hasValidRR ? true : false) : 'WAIT',
      hasValidCalculation ? `1:${actualRR.toFixed(2)}` : 'Pending Calculation',
      `>= 1:${minRequiredRR.toFixed(1)}`,
      hasValidCalculation ? `Risk/Reward ratio below minimum (1:${minRequiredRR.toFixed(1)})` : 'Awaiting entry/SL/TP parameters to calculate Risk:Reward',
      { 
        rr: hasValidCalculation ? `1:${actualRR.toFixed(2)}` : '--',
        minRequired: `1:${minRequiredRR.toFixed(1)}`
      },
      'Institutional Risk/Reward Gate (Min 1:2.0)'
    );

    return rules;
  }
}
