import { SetupStepRecord } from '../types';
import { RuleEvaluationContext, RuleResult } from '@/types';
import { IStrategyEvaluator, StepEvaluationOutput } from './types';
import { getLatestCandle, getCurrentPrice, getSourceCandle, createRuleResult } from './common-helpers';
import { HTFTrendAnalyzer } from '../htf-trend-analyzer';

export class Strategy5ConfluenceEvaluator implements IStrategyEvaluator {
  public readonly strategyId = 'strategy-5-smc-sd-confluence';
  public readonly strategyName = 'STRATEGI 5 — SMC-SD Pattern Confluence Matrix';

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

    switch (step.step_id) {
      case 'H1_M15_STRUCTURE': {
        const rawTrend = analysisData.trend_h1 || analysisData.trend || (candles && candles.length >= 5 ? HTFTrendAnalyzer.analyzeTrend(candles, 'H1').direction : null);
        const trendDir = (rawTrend ? String(rawTrend).toUpperCase() : 'NEUTRAL') as 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'INSUFFICIENT_DATA';
        const m15Structure = (analysisData.trend_m15 || analysisData.m15_trend || trendDir).toUpperCase();

        if ((trendDir === 'BULLISH' || trendDir === 'BEARISH') && (m15Structure === trendDir || m15Structure === 'ALIGNED' || !analysisData.trend_m15)) {
          const dir: 'buy' | 'sell' = trendDir === 'BULLISH' ? 'buy' : 'sell';
          return {
            status: 'VALIDATED',
            reason: `Multi-timeframe structure harmony verified: H1 ${trendDir} & M15 ${m15Structure}`,
            direction: dir,
            evidence: {
              source: 'MultiTimeframeStructureEngine',
              timestamp,
              h1Trend: trendDir,
              m15Structure,
              isAligned: true,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: `Awaiting structural harmony across H1 (${trendDir}) and M15 (${m15Structure})`,
          evidence: {
            source: 'MultiTimeframeStructureEngine',
            timestamp,
            h1Trend: trendDir,
            m15Structure,
            timeframe: 'M15',
            currentPrice
          },
          source_candle
        };
      }

      case 'SD_FIB_OVERLAP': {
        // S&D / FVG / Fibonacci confluence 2-of-3
        let overlapCount = typeof analysisData.overlap_count === 'number' ? analysisData.overlap_count : 0;
        const activeFactors: string[] = [];

        const hasSd = Boolean(analysisData.sd_zone_active || analysisData.sd_pattern);
        const hasObFvg = Boolean(analysisData.ob_fvg_bull || analysisData.ob_fvg_bear || analysisData.ob_active);
        const fibLevel = typeof analysisData.fib_level === 'number' ? analysisData.fib_level : null;
        const hasFibOte = fibLevel !== null && fibLevel >= 0.50 && fibLevel <= 0.886;

        if (hasSd) activeFactors.push('Supply/Demand Zone');
        if (hasObFvg) activeFactors.push('Order Block / FVG');
        if (hasFibOte) activeFactors.push(`Fibonacci OTE (${fibLevel})`);

        if (overlapCount === 0) {
          overlapCount = activeFactors.length;
        }

        if (overlapCount >= 2 || (hasSd && hasObFvg) || (hasSd && hasFibOte) || (hasObFvg && hasFibOte)) {
          const zoneUpper = typeof analysisData.zone_upper === 'number' ? analysisData.zone_upper : +(currentPrice + (atr > 0 ? atr * 0.5 : 1.5)).toFixed(2);
          const zoneLower = typeof analysisData.zone_lower === 'number' ? analysisData.zone_lower : +(currentPrice - (atr > 0 ? atr * 0.5 : 1.5)).toFixed(2);

          return {
            status: 'VALIDATED',
            reason: `Institutional 2-of-3 confluence overlap validated (${overlapCount} factors: ${activeFactors.join(', ')})`,
            evidence: {
              source: 'ConfluenceMatrixEngine',
              timestamp,
              overlapCount: Math.max(overlapCount, 2),
              confluenceFactors: activeFactors,
              zoneUpper,
              zoneLower,
              fibLevel,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: `Awaiting minimum 2-of-3 confluence overlap (S&D Zone, OB/FVG, Fib 0.618-0.786). Current factors: ${overlapCount}/3`,
          evidence: {
            source: 'ConfluenceMatrixEngine',
            timestamp,
            overlapCount,
            activeFactors,
            timeframe: 'M15',
            currentPrice
          },
          source_candle
        };
      }

      case 'CONFLUENCE_SWEEP': {
        const sweepBull = Boolean(analysisData.confluence_sweep_bull || analysisData.liq_sweep_bull || analysisData.asian_sweep_bull);
        const sweepBear = Boolean(analysisData.confluence_sweep_bear || analysisData.liq_sweep_bear || analysisData.asian_sweep_bear);

        const matchesDir = currentDirection === 'buy' ? sweepBull : (currentDirection === 'sell' ? sweepBear : (sweepBull || sweepBear));

        if (matchesDir && (sweepBull || sweepBear)) {
          const dir: 'buy' | 'sell' = sweepBull ? 'buy' : 'sell';
          const sweepLevel = typeof analysisData.sweep_level === 'number' && analysisData.sweep_level > 0
            ? analysisData.sweep_level
            : (sweepBull ? latestCandle.low : latestCandle.high);

          return {
            status: 'VALIDATED',
            reason: `Confluence zone liquidity sweep confirmed at ${sweepLevel.toFixed(2)}`,
            direction: currentDirection || dir,
            evidence: {
              source: 'ConfluenceSweepEngine',
              timestamp,
              level: sweepLevel,
              sweepPrice: currentPrice,
              timeframe: 'M15',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting liquidity sweep at the confluence zone margin',
          evidence: {
            source: 'ConfluenceSweepEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice
          },
          source_candle
        };
      }

      case 'REJECTION_TRIGGER': {
        const hasRejection = Boolean(
          analysisData.wick_rejection_bull || 
          analysisData.wick_rejection_bear || 
          analysisData.rejection_trigger === true ||
          (typeof analysisData.wick_ratio === 'number' && analysisData.wick_ratio >= 0.50) ||
          analysisData.engulfing_bull ||
          analysisData.engulfing_bear ||
          (analysisData.has_displacement && analysisData.displacement_direction)
        );

        if (hasRejection) {
          const triggerType = analysisData.wick_rejection_bull || analysisData.wick_rejection_bear ? 'Rejection Wick' : (analysisData.engulfing_bull || analysisData.engulfing_bear ? 'Engulfing Trigger' : 'Displacement Trigger');
          return {
            status: 'VALIDATED',
            reason: `Confluence zone trigger confirmed: ${triggerType}`,
            evidence: {
              source: 'ConfluenceTriggerEngine',
              timestamp,
              triggerType,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting rejection wick or momentum displacement trigger within confluence area',
          evidence: {
            source: 'ConfluenceTriggerEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice
          },
          source_candle
        };
      }

      case 'MIN_RR_CALC':
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
          reason: `Confluence risk parameters mathematically verified: Entry ${entryPrice}, SL ${slPrice} (${mult}x ATR), TP1 ${tp1Price} (1:${minRR.toFixed(1)} R:R)`,
          evidence: {
            source: 'RiskEngine',
            timestamp,
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
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
              reason: `AI Confluence Matrix Gate approved setup with ${aiConfidence}% confidence: ${aiReasoning || 'Multi-confluence alignment verified'}`,
              evidence: {
                source: 'GeminiAIOrchestrator',
                timestamp,
                aiDecision: 'APPROVED',
                aiConfidence,
                aiReasoning: aiReasoning || 'Multi-confluence alignment verified',
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
            reason: `AI Confluence Gate rejected setup: ${aiReasoning || 'Confluence threshold not met'}`,
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
          reason: 'Awaiting AI Gemini multi-confluence evaluation response',
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

    // 2. Session Rule (Any active liquidity session)
    const currentSession = analysisData.current_session || analysisData.session || context.session || 'UNKNOWN';
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

    // 3. Multi-Timeframe Structure Harmony (H1 + M15)
    const rawTrend = (analysisData.trend_h1 || analysisData.trend || 'NEUTRAL').toUpperCase();
    const m15Structure = (analysisData.trend_m15 || analysisData.m15_trend || rawTrend).toUpperCase();
    const isAligned = (rawTrend === 'BULLISH' || rawTrend === 'BEARISH') && (m15Structure === rawTrend || m15Structure === 'ALIGNED');

    rules['rule_h1_m15_structure'] = createRuleResult(
      'rule_h1_m15_structure',
      true,
      isAligned ? true : 'WAIT',
      isAligned ? `Aligned (${rawTrend})` : `H1: ${rawTrend}, M15: ${m15Structure}`,
      'H1 & M15 Structure Harmony Aligned',
      'H1 and M15 structural trends not yet in harmony',
      { rawTrend, m15Structure, isAligned },
      'H1 & M15 Structural Harmony'
    );

    // 4. S&D / FVG / Fib Confluence Overlap (2 of 3)
    let overlapCount = typeof analysisData.overlap_count === 'number' ? analysisData.overlap_count : 0;
    const hasSd = Boolean(analysisData.sd_zone_active || analysisData.sd_pattern);
    const hasObFvg = Boolean(analysisData.ob_fvg_bull || analysisData.ob_fvg_bear || analysisData.ob_active);
    const fibLevel = typeof analysisData.fib_level === 'number' ? analysisData.fib_level : null;
    const hasFibOte = fibLevel !== null && fibLevel >= 0.50 && fibLevel <= 0.886;

    if (overlapCount === 0) {
      if (hasSd) overlapCount++;
      if (hasObFvg) overlapCount++;
      if (hasFibOte) overlapCount++;
    }

    const has2of3 = overlapCount >= 2;

    rules['rule_sd_fib_overlap'] = createRuleResult(
      'rule_sd_fib_overlap',
      true,
      has2of3 ? true : 'WAIT',
      has2of3 ? `2-of-3 Confluence (${overlapCount}/3)` : `Confluence Weak (${overlapCount}/3)`,
      'Minimum 2 of 3 Confluence Overlap',
      'Awaiting minimum 2 of 3 structural overlap (S&D zone, OB/FVG, Fibonacci OTE)',
      { overlapCount, hasSd, hasObFvg, hasFibOte, fibLevel },
      '2-of-3 Institutional Confluence Overlap'
    );

    // 5. Spread Check Rule
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

    // 6. ATR SL Buffer
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

    // 7. Risk / Reward Calculation (Min 1:2.0)
    const s5 = analysisData.strategy5 || analysisData['strategy-5-smc-sd-confluence'] || {};
    const entryVal = typeof s5.entry === 'number' ? s5.entry : (typeof analysisData.entry_price === 'number' ? analysisData.entry_price : currentPrice);
    const slVal = typeof s5.sl === 'number' ? s5.sl : (typeof analysisData.sl_price === 'number' ? analysisData.sl_price : (entryVal > 0 && atr > 0 ? +(entryVal - (atr * 0.5)).toFixed(2) : null));
    const tpVal = typeof s5.tp1 === 'number' ? s5.tp1 : (typeof s5.tp === 'number' ? s5.tp : (typeof analysisData.tp1_price === 'number' ? analysisData.tp1_price : (entryVal > 0 && atr > 0 ? +(entryVal + (atr * 1.0)).toFixed(2) : null)));

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
      'Confluence Risk/Reward Gate (Min 1:2.0)'
    );

    return rules;
  }
}
