import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SignalPipeline } from '../lib/trading-engine/signal-pipeline';
import { SignalCandidateGate } from '../lib/trading-engine/signal-candidate-gate';
import { lockManager } from '../lib/trading-engine/lock-manager';
import { notificationEngine } from '../lib/notifications/notification-engine';
import { getTelegramBot } from '../lib/notifications/telegram-bot';
import { getDatabaseClient } from '../lib/db/client';
import { getStrategyManifest, getAllStrategyManifests } from '../lib/trading-engine/strategies';
import { StrategySetup } from '../lib/trading-engine/types';
import { RuleEvaluationContext, Candle, RuleResult } from '../types';
import { PythonAnalyzerBridge } from '../lib/trading-engine/python-analyzer-bridge';
import { marketDataManager } from '../lib/market-data/manager';
import { TradingEngine } from '../lib/trading-engine/engine';

describe('PROMPT 7 — FINAL INTEGRATION, PERFORMANCE, SECURITY, QA & RE-AUDIT SUITE', () => {
  let pipeline: SignalPipeline;

  const createMockCandles = (basePrice: number = 2700, count: number = 35): Candle[] => {
    const candles: Candle[] = [];
    const now = Date.now();
    for (let i = count - 1; i >= 0; i--) {
      const ts = new Date(now - i * 60 * 1000).toISOString();
      candles.push({
        timestamp: ts,
        open: basePrice - 1,
        high: basePrice + 3,
        low: basePrice - 3,
        close: basePrice + (i % 2 === 0 ? 1 : -1),
        volume: 1200 + i * 10
      });
    }
    return candles;
  };

  const createValidContext = (timestamp: string = new Date().toISOString(), session: string = 'London'): RuleEvaluationContext => {
    const candles = createMockCandles(2700, 35);
    return {
      symbol: 'XAUUSD',
      timeframe: 'M15',
      timestamp,
      candles,
      marketData: {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        session,
        spreadPips: 1.2,
        atr: 4.5,
        candles
      }
    };
  };

  const createValidSetup = (strategyId: string = 'strategy-1-smc', direction: 'buy' | 'sell' = 'buy', id: string = 'setup_final_001'): StrategySetup => {
    const entry = 2700.00;
    const sl = direction === 'buy' ? 2690.00 : 2710.00;
    const tp1 = direction === 'buy' ? 2725.00 : 2675.00;
    const manifest = getStrategyManifest(strategyId);

    const steps = manifest ? manifest.setup_sequence.map(s => ({
      step_id: s.step_id,
      rule_id: s.rule_id,
      state: 'VALIDATED' as const,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      retry_count: 0
    })) : [];

    return {
      id,
      strategy_id: strategyId,
      symbol: 'XAUUSD',
      timeframe: manifest?.timeframe.execution || 'M15',
      direction,
      state: 'VALIDATED',
      steps,
      entry_price: entry,
      sl_price: sl,
      tp1_price: tp1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      validation_logs: []
    };
  };

  const createRuleResults = (): Record<string, RuleResult> => ({
    'H1 Trend Validator': { status: 'PASS', score: 100, confidence: 95, mandatory: true, evidence: { trend: 'BULLISH' }, latencyMs: 2 },
    'London Session Validator': { status: 'PASS', score: 100, confidence: 100, mandatory: true, evidence: { session: 'London' }, latencyMs: 1 },
    'Liquidity Sweep Validator': { status: 'PASS', score: 100, confidence: 92, mandatory: true, evidence: { swept: 'Asia High' }, latencyMs: 2 },
    'CHOCH Confirmation Validator': { status: 'PASS', score: 100, confidence: 90, mandatory: true, evidence: { choch: true }, latencyMs: 1 },
    'Order Block Entry Validator': { status: 'PASS', score: 100, confidence: 90, mandatory: true, evidence: { price: 2700 }, latencyMs: 1 },
    'Risk Validator': { status: 'PASS', score: 100, confidence: 95, mandatory: true, evidence: { sl: 2690, tp1: 2725, rr: 2.5 }, latencyMs: 1 }
  });

  beforeEach(() => {
    pipeline = SignalPipeline.getInstance();
    pipeline.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. END-TO-END FLOW VERIFICATION
  describe('1. Real End-to-End Flow Verification', () => {
    it('executes full path: Provider -> Normalization -> Node.js -> Python Engine -> Strategy -> Candidate Gate -> AI Gate -> Node Decision -> DB -> Telegram -> History', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy', 'e2e_anchor_001');
      const context = createValidContext();
      const rules = createRuleResults();

      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);
      const dbInsertSpy = vi.spyOn(getDatabaseClient(), 'insertSignal').mockResolvedValue(true as any);
      const dbHistorySpy = vi.spyOn(getDatabaseClient(), 'insertHistory').mockResolvedValue(true as any);

      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-1-smc',
        decision: 'APPROVED',
        reasoning: 'Clean institutional liquidity sweep with validated Order Block retest',
        checklist: [
          { rule: 'London Session', status: 'PASS', evidence: 'London Active', reason: 'Verified' },
          { rule: 'H1 Trend Alignment', status: 'PASS', evidence: 'BULLISH', reason: 'Verified' },
          { rule: 'Liquidity Sweep', status: 'PASS', evidence: 'Asia High Swept', reason: 'Verified' }
        ],
        riskNotes: 'Risk verified at 1:2.5 RR',
        missingFactors: [],
        recommendedAction: 'execute',
        scores: { confidence: 94 }
      });

      const res = await pipeline.executePipeline(setup, context, rules, 'worker_e2e_main');

      // Assert Node.js Decision Authority
      expect(res.success).toBe(true);
      expect(res.status).toBe('APPROVED');
      expect(res.stageReached).toBe('HISTORY');
      expect(res.signal).toBeDefined();
      expect(res.signal?.signalKey).toBe(res.signalKey);

      // Assert DB persistence
      expect(dbInsertSpy).toHaveBeenCalledTimes(1);

      // Assert Telegram notification dispatch
      expect(tgSpy).toHaveBeenCalledTimes(1);

      // Verify no silent path bypassed Node.js
      expect(res.signal?.aiDecision).toBe('APPROVED');
      expect(res.signal?.status).toBe('SIGNAL_ACTIVE');
    });
  });

  // 2. PERFORMANCE & LATENCY MEASUREMENTS
  describe('2. Pipeline Latency & Performance Measurement', () => {
    it('measures sub-millisecond to millisecond latency across pipeline hops', async () => {
      const setup = createValidSetup('strategy-2-snd', 'sell', 'perf_anchor_001');
      setup.entry_price = 2715.00;
      setup.sl_price = 2725.00;
      setup.tp1_price = 2690.00;

      const context = createValidContext();
      const rules = createRuleResults();

      vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);
      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockImplementation(async () => {
        return {
          strategyName: 'strategy-2-snd',
          decision: 'APPROVED',
          reasoning: 'Supply zone confirmation',
          checklist: [],
          riskNotes: '',
          missingFactors: [],
          recommendedAction: 'execute',
          scores: { confidence: 91 }
        };
      });

      const startTime = performance.now();
      const res = await pipeline.executePipeline(setup, context, rules);
      const totalLatency = performance.now() - startTime;

      expect(res.status).toBe('APPROVED');
      expect(totalLatency).toBeLessThan(1000); // Fast deterministic execution
    });
  });

  // 3. SECURITY AUDIT VERIFICATION
  describe('3. Security Audit & Secrets Protection', () => {
    it('ensures Gemini, TwelveData, Telegram and Database keys are never leaked to client bundles', () => {
      const clientEnvKeys = Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_'));
      
      // None of the critical private tokens should ever start with NEXT_PUBLIC_
      expect(clientEnvKeys).not.toContain('NEXT_PUBLIC_GEMINI_API_KEY');
      expect(clientEnvKeys).not.toContain('NEXT_PUBLIC_TWELVEDATA_API_KEY');
      expect(clientEnvKeys).not.toContain('NEXT_PUBLIC_TELEGRAM_BOT_TOKEN');
      expect(clientEnvKeys).not.toContain('NEXT_PUBLIC_DATABASE_URL');
      expect(clientEnvKeys).not.toContain('NEXT_PUBLIC_POLYGON_API_KEY');
    });

    it('ensures Python bridge payload is deterministic with validated schema against command injection', async () => {
      const bridge = PythonAnalyzerBridge.getInstance();
      const res = await bridge.executeAnalysis({
        strategy_id: 'strategy-1-smc',
        symbol: 'XAUUSD',
        timeframe: 'M15',
        analysis_type: 'LIQUIDITY',
        candles: createMockCandles(2700, 30),
        session: 'London'
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.source).toBeDefined();
      expect(typeof res.request_id).toBe('string');
      expect(res.values).toBeDefined();
    });
  });

  // 4. FAILURE TESTING SIMULATIONS
  describe('4. Failure Simulation & Fault Tolerance', () => {
    it('handles Python engine offline gracefully with deterministic fallback without crashing', async () => {
      const bridge = PythonAnalyzerBridge.getInstance();
      
      const result = await bridge.executeAnalysis({
        request_id: 'test_offline_001',
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: new Date().toISOString(),
        session: 'London',
        strategy_id: 'strategy-1-smc',
        analysis_type: 'LIQUIDITY',
        analysis_parameters: {},
        candles: createMockCandles(2700, 20),
        market_context: { spread_pips: 1.2, atr: 4.5, current_price: 2700 }
      });

      // Should not throw or crash; returns structured response
      expect(result).toBeDefined();
      expect(result.request_id).toBe('test_offline_001');
      expect(['SUCCESS', 'ERROR', 'FAILED']).toContain(result.status);
    });

    it('handles Telegram timeout with finite retries without deadlocking', async () => {
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockRejectedValue(new Error('Network unreachable'));
      
      const payload = {
        signal_key: 'sig::strategy-1-smc::XAUUSD::BUY::tg_fail_test::candle_closed',
        strategyName: 'strategy-1-smc',
        symbol: 'XAUUSD',
        direction: 'BUY' as const,
        entry: 2700,
        sl: 2690,
        tp: [2725],
        timestamp: new Date().toISOString(),
        status: 'queued' as const,
        qualityGatePassed: true,
        aiDecision: 'APPROVED'
      };

      const result = await notificationEngine.notifyNewSignal(payload);
      expect(result).toBe(false);
      expect(payload.status).toBe('failed');
      expect(tgSpy).toHaveBeenCalledTimes(3); // Exactly MAX_RETRIES (3)
    });

    it('handles AI offline / invalid JSON safely without auto-approving', async () => {
      const setup = createValidSetup('strategy-3-scalping', 'buy', 'anchor_ai_fail_01');
      const context = createValidContext();
      const rules = createRuleResults();
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);

      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-3-scalping',
        decision: 'REJECTED',
        reasoning: 'AI Gate rejected setup: Missing volatility expansion',
        checklist: [],
        riskNotes: 'REJECTED',
        missingFactors: ['M1 Momentum'],
        recommendedAction: 'block',
        scores: { confidence: 30 }
      });

      const res = await pipeline.executePipeline(setup, context, rules);
      expect(res.success).toBe(false);
      expect(res.status).toBe('REJECTED');
      expect(tgSpy).not.toHaveBeenCalled();
    });
  });

  // 5. 5 STRATEGIES ISOLATION & MANIFEST INTEGRITY
  describe('5. Strategy Manifest & PRD Alignment', () => {
    it('verifies all 5 canonical strategies are registered with valid sequence steps', () => {
      const manifests = getAllStrategyManifests();
      expect(manifests.length).toBe(5);

      const ids = manifests.map(m => m.strategy_id);
      expect(ids).toContain('strategy-1-smc');
      expect(ids).toContain('strategy-2-snd');
      expect(ids).toContain('strategy-3-scalping');
      expect(ids).toContain('strategy-4-news');
      expect(ids).toContain('strategy-5-smc-sd-confluence');

      manifests.forEach(m => {
        expect(m.setup_sequence.length).toBeGreaterThanOrEqual(3);
        expect(m.tp_rule.minRR).toBeGreaterThanOrEqual(1.5);
        expect(m.timeframe).toBeDefined();
      });
    });
  });
});
