import { RiskContext, RiskDecision, RiskLimits } from './types';
import { positionSizingEngine } from './position-sizing';
import { getDatabaseClient } from '../db/client';
import { logger } from '../utils/logger';
import { 
    DailyRiskEngine, 
    ConsecutiveLossProtection, 
    DrawdownGuard,
    CapitalPreservationEngine,
} from '../mcp/engines/risk';

export class RiskEngine {
  private defaultLimits: RiskLimits = {
    maxDailyLoss: 5, // 5%
    maxWeeklyLoss: 10,
    maxMonthlyLoss: 20,
    maxConsecutiveLosses: 3,
    maxDrawdown: 15, // 15%
    maxSignalsPerDay: 5,
    maxSignalsPerSession: 2,
    riskPerSignalPercent: 1, // 1% per signal
  };

  public async evaluateRisk(context: RiskContext, currentLimits?: RiskLimits): Promise<RiskDecision> {
    const limits = currentLimits || this.defaultLimits;
    logger.info(`Evaluating risk for strategy: ${context.strategyId}`);

    if (!context.entryPrice || !context.stopLoss) {
      return this.createDecision('suppress', 'Missing critical price levels for risk calculation.', context, limits);
    }

    const sizing = positionSizingEngine.calculateSize(context, limits.riskPerSignalPercent);
    if (!sizing.allowed) {
      return this.createDecision('block', sizing.reason, context, limits);
    }

    const signalsToday = await this.getSignalsCountToday(context.strategyId);
    if (signalsToday >= limits.maxSignalsPerDay) {
      return this.createDecision('block', `Max signals per day reached (${limits.maxSignalsPerDay}).`, context, limits);
    }

    const consecutiveLosses = await this.getConsecutiveLosses();
    const clpResult = ConsecutiveLossProtection.evaluate(consecutiveLosses, limits.maxConsecutiveLosses);
    if (clpResult.status === 'breached') {
      return this.createDecision('suppress', clpResult.reason || 'Consecutive loss limit reached.', context, limits);
    }

    const dailyLoss = await this.getDailyLoss();
    const dreResult = DailyRiskEngine.evaluate(dailyLoss, limits.maxDailyLoss);
    if (dreResult.status === 'breached') {
      return this.createDecision('suppress', dreResult.reason || 'Max daily loss reached.', context, limits);
    }

    const currentDrawdown = await this.getCurrentDrawdown();
    const dgResult = DrawdownGuard.evaluate(currentDrawdown, limits.maxDrawdown);
    if (dgResult.status === 'breached') {
      return this.createDecision('kill_switch', dgResult.reason || 'Max drawdown exceeded.', context, limits);
    }
    
    // Capital Preservation Check
    const cpResult = CapitalPreservationEngine.evaluate(100 - currentDrawdown, 100);
    let finalSize = sizing.size;
    if (cpResult.status === 'active') {
        finalSize = finalSize / 2; // Halve position size
        logger.info(`Capital Preservation active. Halved size to ${finalSize}`);
    }

    if (context.newsWindow) {
      return this.createDecision('warning', 'High volatility expected due to news window. Proceed with caution.', context, limits, finalSize);
    }

    return this.createDecision('allow', 'Risk checks passed.', context, limits, finalSize);
  }

  private createDecision(
    status: RiskDecision['status'],
    reason: string,
    context: RiskContext,
    limits: RiskLimits,
    suggestedSize?: number
  ): RiskDecision {
    const decision: RiskDecision = {
      status,
      reason,
      parameters: {
        entryPrice: context.entryPrice,
        stopLoss: context.stopLoss,
        accountBalance: context.accountBalance,
      },
      thresholds: limits,
      timestamp: new Date().toISOString(),
      strategyReference: context.strategyId,
      suggestedPositionSize: suggestedSize,
    };
    this.auditRiskDecision(decision).catch(e => logger.error('Failed to audit risk decision', { reason: e instanceof Error ? e.message : String(e) }));
    return decision;
  }

  private async auditRiskDecision(decision: RiskDecision) {
    if (!getDatabaseClient().isConnected()) return;
    try {
      const db = getDatabaseClient();
      const pool = db.getPool();
      if (pool) {
        await pool.query(
          `INSERT INTO risk_events (strategy_id, decision, reason, threshold_json, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [decision.strategyReference, decision.status, decision.reason, JSON.stringify(decision.thresholds || {})]
        );
      }
    } catch (error) {
      logger.error('Error persisting risk decision', { reason: error instanceof Error ? error.message : String(error) });
    }
  }

  private async getSignalsCountToday(strategyId: string): Promise<number> {
    if (!getDatabaseClient().isConnected()) return 0;
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const pool = getDatabaseClient().getPool();
      if (!pool) return 0;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int as count FROM signals WHERE strategy_id = $1 AND created_at >= $2`,
        [strategyId, today.toISOString()]
      );
      return rows[0]?.count || 0;
    } catch {
      return 0;
    }
  }

  private async getConsecutiveLosses(): Promise<number> {
    if (!getDatabaseClient().isConnected()) return 0;
    try {
      const pool = getDatabaseClient().getPool();
      if (!pool) return 0;
      const { rows } = await pool.query(
        `SELECT outcome FROM history ORDER BY closed_at DESC LIMIT 10`
      );
      if (!rows) return 0;
      let lossCount = 0;
      for (const row of rows) {
        if (row.outcome === 'LOSS') lossCount++;
        else break;
      }
      return lossCount;
    } catch {
      return 0;
    }
  }

  private async getDailyLoss(): Promise<number> {
    if (!getDatabaseClient().isConnected()) return 0;
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const pool = getDatabaseClient().getPool();
      if (!pool) return 0;
      const { rows } = await pool.query(
        `SELECT rr_realized FROM history WHERE closed_at >= $1`,
        [today.toISOString()]
      );
      if (!rows) return 0;
      let totalDailyRr = 0;
      for (const row of rows) {
        const rr = Number(row.rr_realized) || 0;
        totalDailyRr += rr;
      }
      return totalDailyRr < 0 ? Math.abs(totalDailyRr) : 0;
    } catch {
      return 0;
    }
  }

  private async getCurrentDrawdown(): Promise<number> {
    if (!getDatabaseClient().isConnected()) return 0;
    try {
      const pool = getDatabaseClient().getPool();
      if (!pool) return 0;
      const { rows } = await pool.query(
        `SELECT rr_realized FROM history ORDER BY closed_at ASC LIMIT 100`
      );
      if (!rows || rows.length === 0) return 0;
      let balance = 100;
      let peak = balance;
      let maxDrawdown = 0;
      let currentDrawdown = 0;
      for (const row of rows) {
        const rr = Number(row.rr_realized) || 0;
        balance += rr;
        
        if (balance > peak) {
          peak = balance;
        }
        const drawdown = ((peak - balance) / peak) * 100;
        currentDrawdown = drawdown;
        
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
      return currentDrawdown;
    } catch {
      return 0;
    }
  }
}
export const riskEngine = new RiskEngine();
