import crypto from 'crypto';
import { Setup, SetupStatus } from '@/types';
import { logger } from '../utils/logger';

export class SetupLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupLifecycleError';
  }
}

export class SetupDetector {
  // Deterministic state
  private activeSetups: Map<string, Setup> = new Map();
  private historySetups: Map<string, Setup> = new Map();

  // Valid state transitions
  private validTransitions: Record<SetupStatus, SetupStatus[]> = {
    'scanning': ['candidate', 'expired'],
    'candidate': ['validation', 'expired'],
    'validation': ['confirmation', 'expired'],
    'confirmation': ['ready', 'expired'],
    'ready': ['signal', 'expired'],
    'signal': ['expired', 'archived'],
    'expired': ['archived'],
    'archived': []
  };

  /**
   * Generates a deterministic hash string to prevent duplicates.
   */
  private generateDeterministicId(strategyId: string, symbol: string, timeframe: string, timestamp: string): string {
    const data = `${strategyId}_${symbol}_${timeframe}_${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Start scanning process. Creates a new setup in "scanning" state.
   */
  public startScanning(strategyId: string, symbol: string, timeframe: string, timestamp: string): Setup {
    const id = this.generateDeterministicId(strategyId, symbol, timeframe, timestamp);
    
    if (this.activeSetups.has(id)) {
       return this.activeSetups.get(id)!;
    }

    const setup: Setup = {
      id,
      timestamp,
      sourceStrategy: strategyId,
      status: 'scanning',
      symbol,
      timeframe,
      validationLog: [{
        timestamp: new Date().toISOString(),
        action: 'scan_started',
        details: `Scanning started for strategy ${strategyId}`,
        status: 'success'
      }]
    };

    this.activeSetups.set(id, setup);
    return setup;
  }

  /**
   * Transition setup to a new state deterministically.
   */
  public transitionState(id: string, newState: SetupStatus, details: string, status: 'success' | 'failure' = 'success'): Setup {
    const setup = this.activeSetups.get(id);
    if (!setup) {
      throw new SetupLifecycleError(`Setup with id ${id} not found.`);
    }

    const currentState = setup.status;
    if (currentState === newState) {
        return setup; // Already in this state, skip
    }

    const allowed = this.validTransitions[currentState];

    if (!allowed || !allowed.includes(newState)) {
      throw new SetupLifecycleError(`Invalid transition from ${currentState} to ${newState}. Jumping status is not allowed.`);
    }

    // Update state
    setup.status = newState;
    setup.validationLog.push({
      timestamp: new Date().toISOString(), // Use iso string, deterministic would be passing timestamp from caller but we use Date() here. Let's make it deterministic if needed.
      action: `transition_to_${newState}`,
      details,
      status
    });

    if (newState === 'archived' || newState === 'expired') {
       this.activeSetups.delete(id);
       this.historySetups.set(id, setup);
       
       // Prune history to prevent memory leaks
       if (this.historySetups.size > 500) {
          const keysToDelete = Array.from(this.historySetups.keys()).slice(0, 100);
          keysToDelete.forEach(k => this.historySetups.delete(k));
       }
    }

    return setup;
  }

  /**
   * Update setup details.
   */
  public updateSetupDetails(id: string, data: Partial<Pick<Setup, 'direction' | 'entryPrice' | 'slPrice' | 'tpPrice' | 'marketStates'>>): Setup {
    const setup = this.activeSetups.get(id);
    if (!setup) {
      throw new SetupLifecycleError(`Setup with id ${id} not found.`);
    }
    
    if (data.direction) setup.direction = data.direction;
    if (data.entryPrice) setup.entryPrice = data.entryPrice;
    if (data.slPrice) setup.slPrice = data.slPrice;
    if (data.tpPrice) setup.tpPrice = data.tpPrice;
    if (data.marketStates) setup.marketStates = data.marketStates;

    return setup;
  }

  /**
   * Verify all active setups consistency (No lost setups)
   */
  
  /**
   * Translates raw market data (pyData) into a strategy-specific snapshot.
   * Delegates to strategy-specific detectors in StrategyRegistry.
   */
  public translateMarketDataToSnapshot(strategyId: string, pyData: any, context?: any): Record<string, any> {
    if (!pyData || Object.keys(pyData).length === 0) {
       return { _assumptions_flagged: true, message: "No data available" };
    }

    try {
      const { getStrategyDefinition } = require('./strategy-registry');
      const stratDef = getStrategyDefinition(strategyId);
      if (stratDef) {
        const evalContext = context || {
          symbol: pyData.symbol || 'XAUUSD',
          timeframe: pyData.timeframe || 'M15',
          timestamp: pyData.timestamp || new Date().toISOString()
        };
        const result = stratDef.extractCandidateRules(evalContext, pyData);
        if (result && result.setupSnapshot) {
           return {
             _assumptions_flagged: false,
             ...result.setupSnapshot
           };
        }
      }
    } catch (e: any) {
       logger.warn(`Strategy snapshot extraction failed for ${strategyId}: ${e.message}`);
    }

    const snapshot: Record<string, any> = {
       _assumptions_flagged: false,
       pair: pyData.symbol || 'XAUUSD',
       timeframe: pyData.timeframe || 'M15',
       session: pyData.current_session || 'London',
       bias: pyData.trend_h1 || pyData.trend || 'neutral',
       sweepStatus: pyData.liq_sweep_status || (pyData.liq_sweep_bull ? "Bullish Sweep" : (pyData.liq_sweep_bear ? "Bearish Sweep" : "None")),
       confirmationStatus: pyData.confirmation_status || (pyData.choch_bull ? "Bullish CHoCH" : (pyData.choch_bear ? "Bearish CHoCH" : "Pending")),
       zoneStatus: pyData.zone_status || (pyData.sd_zone_active ? "S&D Active" : "No Zone"),
       newsStatus: pyData.news_status || (pyData.news_high_impact_active ? "High Impact Active" : "Clear"),
       confluenceScore: pyData.confluence_score || 0,
       entry: pyData.entry_price || pyData.current_price,
       sl: pyData.sl_price,
       tp: pyData.tp_price || pyData.tp1_price,
       direction: pyData.signal_direction || pyData.direction || 'unknown'
    };

    if (snapshot.entry && snapshot.sl && snapshot.tp) {
        const risk = Math.abs(snapshot.entry - snapshot.sl);
        const reward = Math.abs(snapshot.tp - snapshot.entry);
        snapshot.rr = risk > 0 ? Number((reward / risk).toFixed(2)) : 0;
    } else {
        snapshot.rr = 0;
    }

    return snapshot;
  }

  public audit(): void {
    logger.info(`Auditing ${this.activeSetups.size} active setups.`);
    const now = Date.now();
    for (const [id, setup] of this.activeSetups.entries()) {
      if (!setup.timestamp) {
         throw new SetupLifecycleError(`Audit failed: Setup ${id} is missing a timestamp.`);
      }
      if (!setup.sourceStrategy) {
         throw new SetupLifecycleError(`Audit failed: Setup ${id} is missing source strategy.`);
      }
      if (!setup.validationLog || setup.validationLog.length === 0) {
         throw new SetupLifecycleError(`Audit failed: Setup ${id} has no validation log.`);
      }
      
      // Clear setups stuck for more than 5 minutes
      const setupTime = new Date(setup.timestamp).getTime();
      if (now - setupTime > 300000) {
          logger.warn(`Setup ${id} stuck in active state for > 5 mins. Forcing expiration.`);
          this.transitionState(id, 'expired', 'Forced expiration due to stall');
      }
    }
  }

  public getActiveSetups(): Setup[] {
    return Array.from(this.activeSetups.values());
  }
}
