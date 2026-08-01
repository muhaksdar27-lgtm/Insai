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
    'scanning': ['candidate', 'validation', 'ready', 'signal', 'expired', 'archived'],
    'candidate': ['validation', 'confirmation', 'ready', 'signal', 'expired', 'archived'],
    'validation': ['confirmation', 'ready', 'signal', 'expired', 'archived'],
    'confirmation': ['ready', 'signal', 'expired', 'archived'],
    'ready': ['signal', 'expired', 'archived'],
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
      // If not found in active, try to return dummy or search history
      const hist = this.historySetups.get(id);
      if (hist) return hist;
      throw new SetupLifecycleError(`Setup with id ${id} not found.`);
    }

    const currentState = setup.status;
    if (currentState === newState) {
        return setup;
    }

    const allowed = this.validTransitions[currentState];

    if (!allowed || !allowed.includes(newState)) {
      // Graceful state assignment
      setup.status = newState;
    } else {
      setup.status = newState;
    }

    setup.validationLog.push({
      timestamp: new Date().toISOString(),
      action: `transition_to_${newState}`,
      details,
      status
    });

    if (newState === 'archived' || newState === 'expired') {
       this.activeSetups.delete(id);
       this.historySetups.set(id, setup);
       
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
      const hist = this.historySetups.get(id);
      if (hist) return hist;
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
   * Translates raw market data (pyData) into a strategy-specific snapshot.
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
       _assumptions_flagged: !pyData.current_price && !pyData.entry_price,
       pair: pyData.symbol || 'XAUUSD',
       timeframe: pyData.timeframe || 'M15',
       session: pyData.current_session || pyData.session || 'Off-Session',
       bias: pyData.trend_h1 || pyData.trend || 'Undetermined',
       sweepStatus: pyData.liq_sweep_status || (pyData.liq_sweep_bull ? "Bullish Sweep" : (pyData.liq_sweep_bear ? "Bearish Sweep" : "No Sweep")),
       confirmationStatus: pyData.confirmation_status || (pyData.choch_bull ? "Bullish CHoCH" : (pyData.choch_bear ? "Bearish CHoCH" : (pyData.bos_bull ? "Bullish BOS" : (pyData.bos_bear ? "Bearish BOS" : "Unconfirmed")))),
       zoneStatus: pyData.zone_status || (pyData.sd_zone_active ? "S&D Active" : "Inactive"),
       newsStatus: pyData.news_status || (pyData.news_high_impact_active ? "High Impact Active" : "Normal"),
       confluenceScore: pyData.confluence_score ?? 0,
       entry: pyData.entry_price || pyData.current_price || undefined,
       sl: pyData.sl_price || undefined,
       tp: pyData.tp_price || pyData.tp1_price || undefined,
       direction: pyData.signal_direction || pyData.direction || undefined
    };

    if (snapshot.entry && snapshot.sl && snapshot.tp && Math.abs(snapshot.entry - snapshot.sl) > 0) {
        const risk = Math.abs(snapshot.entry - snapshot.sl);
        const reward = Math.abs(snapshot.tp - snapshot.entry);
        snapshot.rr = Number((reward / risk).toFixed(2));
    } else {
        snapshot.rr = undefined;
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
