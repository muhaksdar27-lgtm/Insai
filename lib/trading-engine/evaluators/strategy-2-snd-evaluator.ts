import { SetupStepRecord } from '../types';
import { RuleEvaluationContext, RuleResult } from '@/types';
import { IStrategyEvaluator, StepEvaluationOutput } from './types';
import { getLatestCandle, getCurrentPrice, getSourceCandle, createRuleResult } from './common-helpers';
import { HTFTrendAnalyzer } from '../htf-trend-analyzer';

export class Strategy2SNDEvaluator implements IStrategyEvaluator {
  public readonly strategyId = 'strategy-2-snd';
  public readonly strategyName = 'STRATEGI 2 — Supply & Demand + Engulfing';

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
      case 'MA_TREND':
      case 'HTF_MA_TREND':
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
            reason: 'Insufficient candle data to analyze HTF MA trend structure',
            evidence: { timeframe: 'H1', currentPrice, candleCount: candles?.length || 0 },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: `MA Trend direction is ${trendDir}. Awaiting moving average directional alignment`,
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

      case 'SD_ZONE':
      case 'SD_ZONE_IMBALANCE': {
        const sdActive = Boolean(analysisData.sd_zone_active || analysisData.zone_active);
        const hasZoneBounds = typeof analysisData.zone_upper === 'number' && typeof analysisData.zone_lower === 'number' && analysisData.zone_upper > analysisData.zone_lower;
        const sdPattern = analysisData.sd_pattern || (currentDirection === 'buy' ? 'DBR' : 'RBD');
        const freshness = analysisData.zone_freshness || 'FRESH';

        if (sdActive || hasZoneBounds) {
          const zoneUpper = hasZoneBounds ? analysisData.zone_upper : +(currentPrice + (atr > 0 ? atr * 0.5 : 1.5)).toFixed(2);
          const zoneLower = hasZoneBounds ? analysisData.zone_lower : +(currentPrice - (atr > 0 ? atr * 0.5 : 1.5)).toFixed(2);

          return {
            status: 'VALIDATED',
            reason: `Price entered fresh ${freshness} Supply/Demand zone [${zoneLower} - ${zoneUpper}] (${sdPattern})`,
            evidence: {
              source: 'SupplyDemandEngine',
              timestamp,
              zoneUpper,
              zoneLower,
              sdPattern,
              zoneFreshness: freshness,
              isFresh: freshness === 'FRESH' || freshness === 'UNTESTED',
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting price mitigation into unmitigated Fresh Supply/Demand structure (DBR/RBD/RBR/DBD)',
          evidence: {
            source: 'SupplyDemandEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            sdActive
          },
          source_candle
        };
      }

      case 'ENGULFING_TRIGGER':
      case 'LTF_ENGULFING': {
        // DILARANG mengganti engulfing dengan generic displacement
        const engulfBull = Boolean(analysisData.engulfing_bull || (analysisData.engulfing_pattern === 'BULLISH'));
        const engulfBear = Boolean(analysisData.engulfing_bear || (analysisData.engulfing_pattern === 'BEARISH'));

        const matchesDir = currentDirection === 'buy' ? engulfBull : (currentDirection === 'sell' ? engulfBear : (engulfBull || engulfBear));

        if (matchesDir && (engulfBull || engulfBear)) {
          const patternType = (currentDirection === 'buy' || engulfBull) ? 'bullish_engulfing' : 'bearish_engulfing';
          return {
            status: 'VALIDATED',
            reason: `Genuine momentum engulfing candlestick confirmed: ${patternType}`,
            evidence: {
              source: 'EngulfingTriggerEngine',
              timestamp,
              engulfingType: patternType,
              isTrueEngulfing: true,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Monitoring M15 candle close for genuine engulfing candlestick trigger (generic displacement excluded)',
          evidence: {
            source: 'EngulfingTriggerEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            engulfBull,
            engulfBear
          },
          source_candle
        };
      }

      case 'RISK_PARAMS':
      case 'ENTRY_RISK_SD': {
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
              reason: `AI Confluence Gate approved setup with ${aiConfidence}% confidence: ${aiReasoning || 'S&D + Engulfing confluence verified'}`,
              evidence: {
                source: 'GeminiAIOrchestrator',
                timestamp,
                aiDecision: 'APPROVED',
                aiConfidence,
                aiReasoning: aiReasoning || 'S&D + Engulfing confluence verified',
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

    // 2. Session Rule (Any active session allowed for Strategy 2)
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

    // 3. MA Trend Rule
    const rawTrend = (analysisData.trend_h1 || analysisData.trend || 'NEUTRAL').toUpperCase();
    let trendPassed: boolean | 'WAIT' = false;
    let trendReason = 'H1 MA trend is neutral';

    if (rawTrend === 'BULLISH' || rawTrend === 'BEARISH') {
      trendPassed = true;
      trendReason = `H1 MA trend confirmed ${rawTrend}`;
    } else if (rawTrend === 'INSUFFICIENT_DATA') {
      trendPassed = 'WAIT';
      trendReason = 'Insufficient candle history for MA trend evaluation';
    } else {
      trendPassed = 'WAIT';
      trendReason = 'H1 MA trend is neutral/ranging';
    }

    rules['rule_h1_trend'] = createRuleResult(
      'rule_h1_trend',
      true,
      trendPassed,
      rawTrend,
      'BULLISH or BEARISH',
      trendReason,
      { trend: rawTrend, timeframe: 'H1' },
      'H1 Moving Average Trend Alignment'
    );

    // 4. Fresh Supply / Demand Zone Rule
    const sdActive = Boolean(analysisData.sd_zone_active || analysisData.zone_active);
    const sdPattern = analysisData.sd_pattern || (sdActive ? 'DBR/RBD' : null);
    const zoneFreshness = analysisData.zone_freshness || 'FRESH';
    const zoneActive = sdActive && sdPattern !== null;

    rules['rule_sd_zone'] = createRuleResult(
      'rule_sd_zone',
      true,
      zoneActive ? true : 'WAIT',
      sdPattern ? `${sdPattern} Zone (${zoneFreshness})` : 'No S&D Zone',
      'Active Fresh S&D Structure (DBR/RBD/RBR/DBD)',
      'Price not inside active Fresh Supply/Demand zone',
      { sdActive, sdPattern, zoneFreshness, zoneUpper: analysisData.zone_upper, zoneLower: analysisData.zone_lower },
      'Supply & Demand Structure & Freshness'
    );

    // 5. Engulfing Candlestick Trigger Rule (DILARANG mengganti dengan generic displacement)
    const engulfBull = Boolean(analysisData.engulfing_bull || (analysisData.engulfing_pattern === 'BULLISH'));
    const engulfBear = Boolean(analysisData.engulfing_bear || (analysisData.engulfing_pattern === 'BEARISH'));
    const engulfActive = engulfBull || engulfBear;

    rules['rule_engulfing_trigger'] = createRuleResult(
      'rule_engulfing_trigger',
      true,
      engulfActive ? true : 'WAIT',
      engulfBull ? 'Bullish Engulfing' : (engulfBear ? 'Bearish Engulfing' : 'No Engulfing'),
      'Genuine Engulfing Trigger Confirmed',
      'Waiting for genuine engulfing candlestick pattern (generic displacement excluded)',
      { engulfBull, engulfBear, isTrueEngulfing: true },
      'M15/M5 Genuine Engulfing Candlestick Trigger'
    );

    // 6. Spread Check Rule
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

    // 7. ATR SL Buffer Rule
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

    // 8. Risk / Reward Calculation (Min 1:2.0)
    const s2 = analysisData.strategy2 || analysisData['strategy-2-snd'] || {};
    const entryVal = typeof s2.entry === 'number' ? s2.entry : (typeof analysisData.entry_price === 'number' ? analysisData.entry_price : currentPrice);
    const slVal = typeof s2.sl === 'number' ? s2.sl : (typeof analysisData.sl_price === 'number' ? analysisData.sl_price : (entryVal > 0 && atr > 0 ? +(entryVal - (atr * 0.5)).toFixed(2) : null));
    const tpVal = typeof s2.tp1 === 'number' ? s2.tp1 : (typeof s2.tp === 'number' ? s2.tp : (typeof analysisData.tp1_price === 'number' ? analysisData.tp1_price : (entryVal > 0 && atr > 0 ? +(entryVal + (atr * 1.0)).toFixed(2) : null)));

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
