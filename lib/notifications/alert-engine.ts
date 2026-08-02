import { logger } from '../utils/logger';
import { getDatabaseClient } from '../db/client';
import * as crypto from 'crypto';

export interface AlertPayload {
  alert_key: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  message: string;
  details?: any;
  timestamp: string;
}

export class AlertEngine {
  public async raiseAlert(payload: Omit<AlertPayload, 'alert_key' | 'timestamp'>): Promise<void> {
    const alert_key = crypto.randomUUID();
    const alert: AlertPayload = {
        alert_key,
        timestamp: new Date().toISOString(),
        ...payload
    };

    logger.error(`[ALERT] ${alert.severity.toUpperCase()} - ${alert.component}: ${alert.message}`, alert.details);

    // Save to DB (if supported)
    try {
        if (getDatabaseClient().isConnected()) {
            await getDatabaseClient().insertAlert(alert);
        }
    } catch (e: any) {
        logger.error(`Failed to persist alert: ${e.message}`);
    }

    // Telegram output is strictly reserved for approved trading signals (Final Decision Engine output).
    // Debug, system logs, and error alerts are persisted to DB and logger only.
  }
}

export const alertEngine = new AlertEngine();
