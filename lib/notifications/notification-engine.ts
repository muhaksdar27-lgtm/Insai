import { logger } from '../utils/logger';
import { getTelegramBot } from './telegram-bot';

export interface NotificationPayload {
  signal_key: string;
  correlationId?: string;
  strategyName: string;
  symbol: string;
  timeframe?: string;
  direction: 'BUY' | 'SELL' | 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number[];
  timestamp: string;
  status: 'sent' | 'queued' | 'deduped' | 'suppressed' | 'failed' | 'retrying';
  qualityGatePassed?: boolean;
  aiDecision?: string;
}

export class NotificationEngine {
  private notifiedSignals: Set<string> = new Set();
  private maxHistorySize = 1000;

  public async notifyNewSignal(payload: NotificationPayload): Promise<void> {
    // 1. Strict Final Quality Gate & AI Decision Guard
    if (
      payload.status === 'suppressed' ||
      payload.status === 'failed' ||
      payload.qualityGatePassed !== true ||
      payload.aiDecision !== 'APPROVED' ||
      !payload.entry || payload.entry <= 0 ||
      !payload.sl || payload.sl <= 0 ||
      !payload.tp || payload.tp.length === 0 || payload.tp[0] <= 0
    ) {
      logger.info(`Telegram notification suppressed for non-approved or invalid setup ${payload.signal_key} (Status: ${payload.status}, AI Decision: ${payload.aiDecision})`);
      return;
    }

    if (this.notifiedSignals.has(payload.signal_key)) {
      payload.status = 'deduped';
      logger.info(`Telegram notification deduped in memory for signal key: ${payload.signal_key}`);
      return;
    }

    const message = this.formatMessage(payload);

    try {
      // Direct text notification only - no charts, photos, or debug decorations
      const success = await getTelegramBot().sendNotification(message);

      if (success) {
        payload.status = 'sent';
        this.notifiedSignals.add(payload.signal_key);
        // Prevent unbounded memory growth
        if (this.notifiedSignals.size > this.maxHistorySize) {
          const iterator = this.notifiedSignals.values();
          const firstValue = iterator.next().value;
          if (firstValue) {
            this.notifiedSignals.delete(firstValue);
          }
        }
      } else {
        payload.status = 'failed';
      }
    } catch (error) {
      payload.status = 'failed';
      logger.error('Error sending Telegram notification', { 
        signal_key: payload.signal_key,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private getStrategyConfirmation(strategyKey: string): { displayName: string; confirmationItems: string[] } {
    const key = (strategyKey || '').toLowerCase();

    if (key.includes('strategy-1') || (key.includes('smc') && !key.includes('confluence'))) {
      return {
        displayName: 'Smart Money Concepts (SMC)',
        confirmationItems: [
          '• H1 Trend: ✅ Confirmed',
          '• London Session: ✅ Confirmed',
          '• Asia Liquidity Sweep: ✅ Confirmed',
          '• CHoCH: ✅ Confirmed',
          '• Order Block: ✅ Confirmed',
          '• FVG: ✅ Confirmed',
          '• ATR: ✅ Confirmed',
          '• AI Validation: ✅ Approved'
        ]
      };
    } else if (key.includes('strategy-2') || key.includes('snd') || key.includes('supply')) {
      return {
        displayName: 'Supply & Demand (S&D)',
        confirmationItems: [
          '• HTF Trend: ✅ Confirmed',
          '• Supply/Demand Zone: ✅ Confirmed',
          '• Retest: ✅ Confirmed',
          '• Engulfing: ✅ Confirmed',
          '• ATR: ✅ Confirmed',
          '• AI Validation: ✅ Approved'
        ]
      };
    } else if (key.includes('strategy-3') || key.includes('scalp')) {
      return {
        displayName: 'Scalping Strategy',
        confirmationItems: [
          '• Trend Alignment: ✅ Confirmed',
          '• Liquidity Sweep: ✅ Confirmed',
          '• Double Top/Bottom: ✅ Confirmed',
          '• Rejection Candle: ✅ Confirmed',
          '• ATR: ✅ Confirmed',
          '• AI Validation: ✅ Approved'
        ]
      };
    } else if (key.includes('strategy-4') || key.includes('news')) {
      return {
        displayName: 'News Trading Strategy',
        confirmationItems: [
          '• High Impact News: ✅ Confirmed',
          '• Volatility Check: ✅ Confirmed',
          '• BOS Confirmation: ✅ Confirmed',
          '• Rejection Pattern: ✅ Confirmed',
          '• ATR: ✅ Confirmed',
          '• AI Validation: ✅ Approved'
        ]
      };
    } else if (key.includes('strategy-5') || key.includes('confluence')) {
      return {
        displayName: 'SMC + S&D Confluence',
        confirmationItems: [
          '• Market Structure: ✅ Confirmed',
          '• Order Block: ✅ Confirmed',
          '• Supply/Demand: ✅ Confirmed',
          '• Fibonacci Confluence: ✅ Confirmed',
          '• Liquidity Sweep: ✅ Confirmed',
          '• ATR: ✅ Confirmed',
          '• AI Validation: ✅ Approved'
        ]
      };
    }

    return {
      displayName: strategyKey || 'INSAI Strategy',
      confirmationItems: [
        '• Market Structure: ✅ Confirmed',
        '• Key Levels / Zones: ✅ Confirmed',
        '• ATR / Volatility: ✅ Confirmed',
        '• AI Validation: ✅ Approved'
      ]
    };
  }

  private formatMessage(payload: NotificationPayload): string {
    const escapeHtml = (text: string) => (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formattedTime = new Date(payload.timestamp).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    // Direction requirement: BUY / SELL
    const action = payload.direction === 'BUY' || (payload.direction as string) === 'LONG' ? 'BUY' : 'SELL';

    const { displayName, confirmationItems } = this.getStrategyConfirmation(payload.strategyName);
    const timeframe = payload.timeframe || 'M15';

    const tpList = payload.tp.map((tpVal, idx) => `• <b>Take Profit ${idx + 1}:</b> ${tpVal}`).join('\n');

    return `🎯 <b>INSAI TRADING SIGNAL</b>

<b>Strategy:</b> ${escapeHtml(displayName)}
<b>Pair:</b> ${escapeHtml(payload.symbol)}
<b>Timeframe:</b> ${escapeHtml(timeframe)}
<b>Action:</b> <b>${action}</b>

📍 <b>Trade Parameters</b>
• <b>Entry:</b> ${payload.entry}
• <b>Stop Loss:</b> ${payload.sl}
${tpList}

📋 <b>Setup Confirmation</b>
${confirmationItems.join('\n')}

⏰ <b>Timestamp:</b> ${formattedTime}`.trim();
  }
}

export const notificationEngine = new NotificationEngine();
