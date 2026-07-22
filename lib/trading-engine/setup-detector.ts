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
       throw new SetupLifecycleError(`Setup with id ${id} already exists. Duplicates are not allowed.`);
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
   * Recognizes: London session, Asia liquidity sweep, CHoCH, FVG, OB, S&D zone, 
   * engulfing, double top/bottom, news filter, zone overlap.
   */
  public translateMarketDataToSnapshot(_strategyId: string, pyData: any): Record<string, any> {
    if (!pyData || Object.keys(pyData).length === 0) {
       return { _assumptions_flagged: true, message: "No data available" };
    }

    const snapshot: Record<string, any> = {
       _assumptions_flagged: false,
       pair: pyData.symbol || 'XAUUSD',
       timeframe: pyData.timeframe || 'M15',
    };

    const getValue = (key: string, fallback: any = null) => {
       return pyData[key] !== undefined && pyData[key] !== null ? pyData[key] : fallback;
    };

    // 1. Session
    snapshot.session = getValue('current_session');
    if (!snapshot.session) snapshot._assumptions_flagged = true;
    
    // 2. Bias (HTF Trend)
    snapshot.bias = getValue('trend_h1') || getValue('trend');
    if (!snapshot.bias) snapshot._assumptions_flagged = true;

    // 3. Liquidity Sweep
    snapshot.sweepStatus = getValue('liq_sweep_status');
    if (!snapshot.sweepStatus) {
       const sweepBull = getValue('liq_sweep_bull');
       const sweepBear = getValue('liq_sweep_bear');
       if (sweepBull) snapshot.sweepStatus = "Bullish Sweep";
       else if (sweepBear) snapshot.sweepStatus = "Bearish Sweep";
       else snapshot.sweepStatus = "None";
    }

    // 4. Confirmation Status (CHoCH / Engulfing / Reversal)
    snapshot.confirmationStatus = getValue('confirmation_status');
    if (!snapshot.confirmationStatus) {
       const chochBull = getValue('choch_bull');
       const chochBear = getValue('choch_bear');
       if (chochBull) snapshot.confirmationStatus = "Bullish CHoCH";
       else if (chochBear) snapshot.confirmationStatus = "Bearish CHoCH";
       else snapshot.confirmationStatus = "Pending";
    }

    // 5. Zone Status (OB / FVG / S&D)
    snapshot.zoneStatus = getValue('zone_status');
    if (!snapshot.zoneStatus) {
       const fvg = getValue('ob_fvg_bull') || getValue('ob_fvg_bear');
       const sdActive = getValue('sd_zone_active');
       if (fvg) snapshot.zoneStatus = "FVG/OB Present";
       else if (sdActive) snapshot.zoneStatus = "S&D Active";
       else snapshot.zoneStatus = "No Zone";
    }

    // 6. News Status
    snapshot.newsStatus = getValue('news_status');
    if (!snapshot.newsStatus) {
        snapshot.newsStatus = getValue('news_high_impact_active') ? "High Impact Active" : "Clear";
    }

    // 7. Confluence Score
    snapshot.confluenceScore = getValue('confluence_score', 0);
    
    // 8. Prices (Entry, SL, TP)
    snapshot.entry = getValue('entry_price') || getValue('current_price');
    snapshot.sl = getValue('sl_price');
    snapshot.tp = getValue('tp_price') || getValue('tp1_price');
    
    // 9. Direction & RR
    snapshot.direction = getValue('signal_direction') || getValue('direction');
    if (!snapshot.direction && snapshot.bias) {
        snapshot.direction = snapshot.bias === 'bullish' ? 'buy' : (snapshot.bias === 'bearish' ? 'sell' : 'unknown');
    }

    if (snapshot.entry && snapshot.sl && snapshot.tp) {
        const risk = Math.abs(snapshot.entry - snapshot.sl);
        const reward = Math.abs(snapshot.tp - snapshot.entry);
        snapshot.rr = risk > 0 ? Number((reward / risk).toFixed(2)) : 0;
    } else {
        snapshot.rr = 0;
        snapshot._assumptions_flagged = true; // missing critical levels
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
