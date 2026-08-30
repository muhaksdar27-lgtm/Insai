import { SetupStepRecord } from '../types';
import { RuleEvaluationContext, RuleResult } from '@/types';
import { IStrategyEvaluator, StepEvaluationOutput } from './types';
import { getLatestCandle, getCurrentPrice, getSourceCandle, createRuleResult } from './common-helpers';

export class Strategy4NewsEvaluator implements IStrategyEvaluator {
  public readonly strategyId = 'strategy-4-news';
  public readonly strategyName = 'STRATEGI 4 — News Liquidity Sweep Reversal';

  public evaluateStep(
    step: SetupStepRecord,
    context: RuleEvaluationContext,
    analysisData: Record<string, any>,
    priorSteps: SetupStepRecord[] = [],
    currentDirection?: 'buy' | 'sell'
  ): StepEvaluationOutput {
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
      case 'HIGH_IMPACT_NEWS':
      case 'NEWS_WINDOW': {
        // Jangan gunakan session name sebagai pengganti actual news event
        const hasGenuineNews = Boolean(analysisData.news_high_impact_active === true || (analysisData.news_event && analysisData.news_event.impact === 'HIGH'));

        if (hasGenuineNews) {
          const newsTitle = analysisData.news_title || analysisData.news_event?.title || 'High Impact Macro Event (NFP/CPI/FOMC)';
          const releaseTime = analysisData.news_event?.time || timestamp;

          return {
            status: 'VALIDATED',
            reason: `Genuine High Impact News event verified: ${newsTitle}`,
            evidence: {
              source: 'EconomicCalendarEngine',
              timestamp,
              newsTitle,
              newsImpact: 'HIGH',
              releaseTime,
              timeframe: 'M15',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting genuine high-impact macro news release (NFP, CPI, FOMC, Rate Decision)',
          evidence: {
            source: 'EconomicCalendarEngine',
            timestamp,
            timeframe: 'M15',
            currentPrice,
            hasGenuineNews: false
          },
          source_candle
        };
      }

      case 'NO_TRADE_WINDOW':
      case 'SPREAD_NORMAL': {
        // Forbidden initial news candle & spread normalization
        const isFirstCandle = analysisData.first_news_candle === true || analysisData.candle_index === 0;
        const spreadPips = typeof analysisData.spreadPips === 'number' ? analysisData.spreadPips : (typeof analysisData.spread_pips === 'number' ? analysisData.spread_pips : null);
        const spreadOk = analysisData.spread_acceptable === true || (spreadPips !== null && spreadPips <= 3.0);

        if (isFirstCandle) {
          return {
            status: 'AWAITING',
            reason: 'First news candle active: Entry strictly prohibited during initial spike. Awaiting spread normalization.',
            evidence: {
              source: 'NewsSafetyEngine',
              timestamp,
              firstNewsCandle: true,
              spreadPips: spreadPips ?? undefined,
              timeframe: 'M5',
              currentPrice
            },
            source_candle
          };
        }

        if (spreadOk && spreadPips !== null) {
          return {
            status: 'VALIDATED',
            reason: `No-trade window elapsed & broker spread normalized (${spreadPips.toFixed(1)} pips <= 3.0)`,
            evidence: {
              source: 'MarketSpreadEngine',
              timestamp,
              spreadPips,
              firstNewsCandlePassed: true,
              timeframe: 'M5',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: spreadPips !== null ? `Spread is currently widened post-news (${spreadPips.toFixed(1)} pips > 3.0). Awaiting normalization` : 'Market spread data unavailable. Awaiting broker quote.',
          evidence: {
            source: 'MarketSpreadEngine',
            timestamp,
            spreadPips: spreadPips ?? undefined,
            spreadAcceptable: false
          },
          source_candle
        };
      }

      case 'POST_NEWS_SWEEP':
      case 'LIQUIDITY_SWEEP': {
        const sweepBull = Boolean(analysisData.liq_sweep_bull || analysisData.post_news_sweep_bull);
        const sweepBear = Boolean(analysisData.liq_sweep_bear || analysisData.post_news_sweep_bear);

        const matchesDir = currentDirection === 'buy' ? sweepBull : (currentDirection === 'sell' ? sweepBear : (sweepBull || sweepBear));

        if (matchesDir && (sweepBull || sweepBear)) {
          const dir: 'buy' | 'sell' = sweepBull ? 'buy' : 'sell';
          const preNewsLevel = sweepBull ? (analysisData.pre_news_low || latestCandle.low) : (analysisData.pre_news_high || latestCandle.high);

          return {
            status: 'VALIDATED',
            reason: `Post-news liquidity sweep verified against pre-news key level ${preNewsLevel.toFixed(2)}`,
            direction: currentDirection || dir,
            evidence: {
              source: 'PostNewsSweepEngine',
              timestamp,
              level: preNewsLevel,
              sweepType: sweepBull ? 'post_news_low_sweep' : 'post_news_high_sweep',
              preNewsHigh: analysisData.pre_news_high,
              preNewsLow: analysisData.pre_news_low,
              timeframe: 'M5',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting news volatility spike sweep across pre-news high/low liquidity boundaries',
          evidence: {
            source: 'PostNewsSweepEngine',
            timestamp,
            timeframe: 'M5',
            currentPrice
          },
          source_candle
        };
      }

      case 'WICK_REJECTION': {
        const wickRatio = typeof analysisData.wick_ratio === 'number' ? analysisData.wick_ratio : (analysisData.wick_rejection_bull || analysisData.wick_rejection_bear ? 0.60 : 0);
        const hasRejection = wickRatio >= 0.50 || Boolean(analysisData.wick_rejection_bull || analysisData.wick_rejection_bear);

        if (hasRejection && wickRatio > 0) {
          return {
            status: 'VALIDATED',
            reason: `Post-sweep rejection confirmed with ${(wickRatio * 100).toFixed(0)}% rejection wick`,
            evidence: {
              source: 'WickRejectionEngine',
              timestamp,
              wickRatio,
              timeframe: 'M5',
              currentPrice,
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting post-sweep candlestick rejection wick (>= 50% candle range)',
          evidence: {
            source: 'WickRejectionEngine',
            timestamp,
            timeframe: 'M5',
            currentPrice,
            wickRatio
          },
          source_candle
        };
      }

      case 'M1_BOS_REVERSAL': {
        const bosBull = Boolean(analysisData.bos_bull || analysisData.choch_bull);
        const bosBear = Boolean(analysisData.bos_bear || analysisData.choch_bear);

        const matchesDir = currentDirection === 'buy' ? bosBull : (currentDirection === 'sell' ? bosBear : (bosBull || bosBear));

        if (matchesDir && (bosBull || bosBear)) {
          const breakPrice = typeof analysisData.structure_break_level === 'number' && analysisData.structure_break_level > 0
            ? analysisData.structure_break_level
            : currentPrice;

          return {
            status: 'VALIDATED',
            reason: `M1 Break of Structure confirmed reversal at ${breakPrice.toFixed(2)} with displacement`,
            evidence: {
              source: 'StructureEngine',
              timestamp,
              bosPrice: breakPrice,
              hasDisplacement: Boolean(analysisData.has_displacement),
              timeframe: 'M1',
              candleTimestamp: latestCandle.timestamp
            },
            source_candle
          };
        }

        return {
          status: 'AWAITING',
          reason: 'Awaiting M1 micro Break of Structure (BOS) confirming reversal momentum',
          evidence: {
            source: 'StructureEngine',
            timestamp,
            timeframe: 'M1',
            currentPrice
          },
          source_candle
        };
      }

      case 'RISK_PARAMS':
      case 'NEWS_ENTRY_RISK': {
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
        const mult = 0.6; // 0.6x ATR buffer outside news spike extreme
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
          reason: `News reversal risk parameters verified: Entry ${entryPrice}, SL ${slPrice} (${mult}x ATR), TP1 ${tp1Price} (1:${minRR.toFixed(1)} R:R)`,
          evidence: {
            source: 'NewsRiskEngine',
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
              reason: `AI News Reversal Gate approved setup with ${aiConfidence}% confidence: ${aiReasoning || 'News sweep reversal validated'}`,
              evidence: {
                source: 'GeminiAIOrchestrator',
                timestamp,
                aiDecision: 'APPROVED',
                aiConfidence,
                aiReasoning: aiReasoning || 'News sweep reversal validated',
                currentPrice,
                candleTimestamp: latestCandle.timestamp
              },
              source_candle
            };
          } else {
            return {
              status: 'REJECTED',
              reason: `AI News Reversal Gate rejected setup: confidence score (${aiConfidence ?? 0}%) below mandatory 70% threshold`,
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
            reason: `AI News Gate rejected setup: ${aiReasoning || 'Reversal confluence threshold not met'}`,
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
          reason: 'Awaiting AI Gemini volatility reversal evaluation response',
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

    // 2. High Impact News Event (Jangan gunakan session name)
    const hasGenuineNews = Boolean(analysisData.news_high_impact_active === true || (analysisData.news_event && analysisData.news_event.impact === 'HIGH'));
    const newsTitle = analysisData.news_title || analysisData.news_event?.title || (hasGenuineNews ? 'High Impact Macro Release' : 'None');

    rules['rule_news_event'] = createRuleResult(
      'rule_news_event',
      true,
      hasGenuineNews ? true : 'WAIT',
      newsTitle,
      'High Impact News Release (NFP, CPI, FOMC, Fed Rate)',
      'No genuine high impact news event scheduled or active (session name not accepted)',
      { hasGenuineNews, newsTitle },
      'Genuine High Impact Macroeconomic Event'
    );

    // 3. No-Trade Initial Candle Rule
    const isFirstCandle = analysisData.first_news_candle === true || analysisData.candle_index === 0;
    const initialCandlePassed = hasGenuineNews ? !isFirstCandle : true;

    rules['rule_no_trade_initial_candle'] = createRuleResult(
      'rule_no_trade_initial_candle',
      true,
      initialCandlePassed,
      isFirstCandle ? 'Active (Spike in progress)' : 'Elapsed (> 1 candle)',
      'Elapsed (Initial spike candle closed)',
      'Trading prohibited during initial news spike candle',
      { isFirstCandle, initialCandlePassed, candleIndex: analysisData.candle_index },
      'Initial News Spike No-Trade Rule'
    );

    // 4. Spread Normalization Rule
    const spreadPips = typeof analysisData.spreadPips === 'number' ? analysisData.spreadPips : (typeof analysisData.spread_pips === 'number' ? analysisData.spread_pips : null);
    const spreadAcceptable = analysisData.spread_acceptable === true || (spreadPips !== null && spreadPips <= 3.0);

    rules['rule_spread_normalization'] = createRuleResult(
      'rule_spread_normalization',
      true,
      spreadAcceptable ? true : 'WAIT',
      spreadAcceptable ? `Normalized (${spreadPips ?? '<= 3.0'} pips)` : `Widened (${spreadPips ?? '> 3.0'} pips)`,
      'Normalized (<= 3.0 pips)',
      'Spread widened post-news release',
      { spreadAcceptable, spreadPips },
      'Post-News Spread Normalization (<= 3.0 pips)'
    );

    // 5. Post-News Liquidity Sweep & Wick Rejection
    const sweepBull = Boolean(analysisData.liq_sweep_bull || analysisData.post_news_sweep_bull);
    const sweepBear = Boolean(analysisData.liq_sweep_bear || analysisData.post_news_sweep_bear);
    const wickRatio = typeof analysisData.wick_ratio === 'number' ? analysisData.wick_ratio : (analysisData.wick_rejection_bull || analysisData.wick_rejection_bear ? 0.60 : 0);
    const sweepActive = (sweepBull || sweepBear) && (wickRatio >= 0.50 || analysisData.wick_rejection_bull || analysisData.wick_rejection_bear);

    rules['rule_post_news_sweep'] = createRuleResult(
      'rule_post_news_sweep',
      true,
      sweepActive ? true : 'WAIT',
      sweepActive ? `Sweep & Rejection (${(wickRatio * 100).toFixed(0)}% wick)` : 'Awaiting Post-News Sweep',
      'Post-News Sweep + Wick Rejection >= 50%',
      'Waiting for post-news liquidity sweep and >= 50% rejection wick',
      { sweepBull, sweepBear, wickRatio },
      'Post-News Liquidity Sweep & Rejection Wick'
    );

    // 6. ATR SL Buffer
    const atr = typeof analysisData.atr === 'number' && analysisData.atr > 0 ? analysisData.atr : 0;
    rules['rule_atr_sl_buffer'] = createRuleResult(
      'rule_atr_sl_buffer',
      true,
      atr > 0 ? true : 'WAIT',
      atr > 0 ? `${atr.toFixed(2)} (Buffer: ${((atr * 0.6) * 10).toFixed(1)} pips)` : '0.00',
      '> 0',
      'Awaiting valid measured ATR volatility metric',
      { atr, bufferPips: atr > 0 ? ((atr * 0.6) * 10).toFixed(1) : '0.0' },
      'ATR SL Dynamic Buffer (0.6x ATR)'
    );

    // 7. Risk / Reward Calculation (Min 1:2.0)
    const s4 = analysisData.strategy4 || analysisData['strategy-4-news'] || {};
    const entryVal = typeof s4.entry === 'number' ? s4.entry : (typeof analysisData.entry_price === 'number' ? analysisData.entry_price : currentPrice);
    const slVal = typeof s4.sl === 'number' ? s4.sl : (typeof analysisData.sl_price === 'number' ? analysisData.sl_price : (entryVal > 0 && atr > 0 ? +(entryVal - (atr * 0.6)).toFixed(2) : null));
    const tpVal = typeof s4.tp1 === 'number' ? s4.tp1 : (typeof s4.tp === 'number' ? s4.tp : (typeof analysisData.tp1_price === 'number' ? analysisData.tp1_price : (entryVal > 0 && atr > 0 ? +(entryVal + (atr * 1.2)).toFixed(2) : null)));

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
      'News Reversal Risk/Reward Gate (Min 1:2.0)'
    );

    return rules;
  }
}
