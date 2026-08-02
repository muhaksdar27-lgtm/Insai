import { SignalPipeline } from './signal-pipeline';
import { Setup } from '@/types';
import { getSupabaseClient } from '../supabase/client';
import { getQueueManager } from '../redis/queue';
import { logger } from '../utils/logger';

export class SignalBuilder {
  private static signalPipeline = new SignalPipeline();

  /**
   * Build and dispatch signal when all mandatory rules PASS.
   * Publishes event signal.created, updates live signals, history, dashboard, and database.
   */
  public static async buildAndDispatchSignal(setup: Setup, marketContext: any): Promise<boolean> {
    logger.info(`SignalBuilder: Assembling and publishing signal for setup ${setup.id} (${setup.sourceStrategy})`);

    // 1. Emit signal through pipeline
    const isEmitted = await this.signalPipeline.emitSignal(setup, marketContext);
    if (!isEmitted) {
      logger.info(`SignalBuilder: Signal ${setup.id} was suppressed or rejected. Skipping event publication and state dispatch.`);
      return false;
    }

    // 2. Directly publish event: signal.created
    try {
      await getQueueManager().publish('events', {
        type: 'signal.created',
        signalKey: setup.id,
        strategyId: setup.sourceStrategy,
        symbol: setup.symbol,
        direction: setup.direction,
        entryPrice: setup.entryPrice,
        slPrice: setup.slPrice,
        tpPrice: setup.tpPrice,
        timestamp: new Date().toISOString()
      });
    } catch (e: any) {
      logger.warn(`SignalBuilder: Event publication warning: ${e.message}`);
    }

    // 3. Persist database & state history
    try {
      await getSupabaseClient().insertStrategyState({
        strategy_id: setup.sourceStrategy,
        symbol: setup.symbol,
        state_name: 'DISPATCHED',
        state_status: 'active',
        reason: 'Signal built, verified, and dispatched to execution stream',
        signal_key: setup.id,
        payload_json: {
          setup,
          marketContext,
          dispatchedAt: new Date().toISOString()
        },
        timeframe: setup.timeframe || 'M15'
      });
    } catch (dbErr: any) {
      logger.error(`SignalBuilder: Failed to update database state: ${dbErr.message}`);
    }

    return true;
  }
}
