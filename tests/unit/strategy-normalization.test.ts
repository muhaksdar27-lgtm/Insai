import { describe, it, expect } from 'vitest';
import { normalizeStrategyFromDB } from '@/lib/trading-engine/strategy-normalize';
import { normalizeStrategy, buildTimeline } from '@/lib/strategyViewModel';
import { StrategyResponse } from '@/types';

describe('Strategy Normalization Contract & Anti-Forging Tests', () => {
  it('should map AI_PENDING from backend to UI without forging to APPROVED', () => {
    const rawBackendRow = {
      id: 'strategy-1-smc',
      name: 'Strategy 1 SMC',
      description: 'SMC strategy',
      state: 'AI_PENDING',
      current_step_id: 'AI_GATE',
      setup_snapshot: {
        symbol: 'XAUUSD',
        direction: 'BUY',
        current_step: 'AI_GATE',
        aiDecision: 'PENDING',
        setupObject: {
          steps: [
            { step_id: 'LONDON_FILTER', step_order: 1, state: 'VALIDATED' },
            { step_id: 'H1_TREND', step_order: 2, state: 'VALIDATED' },
            { step_id: 'ASIA_SWEEP', step_order: 3, state: 'VALIDATED' },
            { step_id: 'M15_CHOCH', step_order: 4, state: 'VALIDATED' },
            { step_id: 'OB_FVG', step_order: 5, state: 'VALIDATED' },
            { step_id: 'RISK_PARAMS', step_order: 6, state: 'VALIDATED' },
            { step_id: 'AI_GATE', step_order: 7, state: 'ACTIVE' },
            { step_id: 'DISPATCHED', step_order: 8, state: 'AWAITING' },
          ]
        }
      },
      rule_results: {},
      signal: null,
      updated_at: new Date().toISOString()
    };

    const normalizedApi = normalizeStrategyFromDB(rawBackendRow);
    expect(normalizedApi.status).toBe('AI_PENDING');
    expect(normalizedApi.currentStep).toBe('AI_GATE');

    const uiViewModel = normalizeStrategy(normalizedApi);
    expect(uiViewModel.setupStatus).toBe('AI_PENDING');
    expect(uiViewModel.setupStatus).not.toBe('approved');
    expect(uiViewModel.setupStatus).not.toBe('active');
  });

  it('should not forge status to APPROVED even if progress is 100% or signal key exists when backend says AWAITING', () => {
    const strategyWithSignal: StrategyResponse = {
      id: 'strategy-2-snd',
      name: 'Supply & Demand',
      description: 'SD strategy',
      status: 'AWAITING',
      progress: 100,
      currentStep: 'AWAITING_TRIGGER',
      steps: [
        { id: 'MA_TREND', name: 'MA Trend', status: 'awaiting' },
        { id: 'SD_ZONE', name: 'SD Zone', status: 'awaiting' },
        { id: 'ENGULFING_TRIGGER', name: 'Engulfing Trigger', status: 'awaiting' },
        { id: 'RISK_PARAMS', name: 'Risk Check', status: 'awaiting' },
        { id: 'AI_GATE', name: 'AI Gate', status: 'awaiting' },
        { id: 'DISPATCHED', name: 'Dispatched', status: 'awaiting' }
      ],
      setupSnapshot: {
        symbol: 'XAUUSD',
        direction: 'SELL'
      },
      ruleResults: {},
      signal: 'XAUUSD_M15_strategy-2-snd_12345',
      updatedAt: new Date().toISOString()
    };

    const uiViewModel = normalizeStrategy(strategyWithSignal);
    expect(uiViewModel.setupStatus).toBe('AWAITING');
    expect(uiViewModel.setupStatus).not.toBe('approved');
  });

  it('should map DATABASE_UNAVAILABLE state correctly', () => {
    const rawBackendRow = {
      id: 'strategy-3-scalping',
      name: 'Scalping',
      description: 'Scalping strategy',
      state: 'DATABASE_UNAVAILABLE',
      current_step_id: 'NONE',
      setup_snapshot: {},
      rule_results: {},
      signal: null,
      updated_at: new Date().toISOString()
    };

    const normalizedApi = normalizeStrategyFromDB(rawBackendRow);
    expect(normalizedApi.status).toBe('DATABASE_UNAVAILABLE');

    const uiViewModel = normalizeStrategy(normalizedApi);
    expect(uiViewModel.setupStatus).toBe('DATABASE_UNAVAILABLE');
  });

  it('should maintain 1:1 canonical step mapping from backend setupObject steps', () => {
    const strategyWithStepRecords: StrategyResponse = {
      id: 'strategy-1-smc',
      name: 'Strategy 1 SMC',
      description: 'SMC strategy',
      status: 'ACTIVE',
      progress: 50,
      currentStep: 'OB_FVG',
      steps: [],
      setupSnapshot: {
        symbol: 'XAUUSD',
        setupObject: {
          steps: [
            { step_id: 'LONDON_FILTER', step_order: 1, state: 'VALIDATED' },
            { step_id: 'H1_TREND', step_order: 2, state: 'VALIDATED' },
            { step_id: 'ASIA_SWEEP', step_order: 3, state: 'VALIDATED' },
            { step_id: 'M15_CHOCH', step_order: 4, state: 'VALIDATED' },
            { step_id: 'OB_FVG', step_order: 5, state: 'ACTIVE' },
            { step_id: 'RISK_PARAMS', step_order: 6, state: 'AWAITING' },
            { step_id: 'AI_GATE', step_order: 7, state: 'AWAITING' },
            { step_id: 'DISPATCHED', step_order: 8, state: 'AWAITING' }
          ]
        }
      },
      ruleResults: {},
      signal: null,
      updatedAt: new Date().toISOString()
    };

    const timeline = buildTimeline(strategyWithStepRecords);
    expect(timeline.length).toBe(8);
    expect(timeline[0].status).toBe('validated');
    expect(timeline[1].status).toBe('validated');
    expect(timeline[2].status).toBe('validated');
    expect(timeline[3].status).toBe('validated');
    expect(timeline[4].status).toBe('active');
    expect(timeline[5].status).toBe('awaiting');
    expect(timeline[6].status).toBe('awaiting');
    expect(timeline[7].status).toBe('awaiting');
  });

  it('should map REJECTED and INVALIDATED statuses faithfully', () => {
    const rejectedStrategy: StrategyResponse = {
      id: 'strategy-4-news',
      name: 'News Reversal',
      description: 'News strategy',
      status: 'REJECTED',
      progress: 25,
      currentStep: 'SPREAD_NORMAL',
      steps: [
        { id: 'NEWS_WINDOW', name: 'News Window', status: 'validated' },
        { id: 'SPREAD_NORMAL', name: 'Spread Normal', status: 'rejected' },
        { id: 'POST_NEWS_SWEEP', name: 'Post News Sweep', status: 'awaiting' }
      ],
      setupSnapshot: {},
      ruleResults: {},
      signal: null,
      updatedAt: new Date().toISOString()
    };

    const uiViewModel = normalizeStrategy(rejectedStrategy);
    expect(uiViewModel.setupStatus).toBe('REJECTED');
  });
});
