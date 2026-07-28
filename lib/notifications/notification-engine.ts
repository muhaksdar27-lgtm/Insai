import { logger } from '../utils/logger';
import { getTelegramBot } from './telegram-bot';

export interface NotificationPayload {
  signal_key: string;
  correlationId?: string;
  strategyName: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number[];
  checklist?: any[];
  reason: string;
  timestamp: string;
  status: 'sent' | 'queued' | 'deduped' | 'suppressed' | 'failed' | 'retrying';
  qualityGatePassed?: boolean;
  aiDecision?: string;
  chartData?: number[]; // Array of last N close prices
}

export class NotificationEngine {
  private notifiedSignals: Set<string> = new Set();
  private maxHistorySize = 1000;

  public async notifyNewSignal(payload: NotificationPayload): Promise<void> {
    // 1. Strict Final Quality Gate & AI Decision Guard
    if (payload.status === 'suppressed' || payload.status === 'failed' || payload.qualityGatePassed === false || (payload.aiDecision && payload.aiDecision !== 'APPROVED')) {
      logger.info(`Telegram notification suppressed for non-approved setup ${payload.signal_key} (Status: ${payload.status}, AI Decision: ${payload.aiDecision})`);
      return;
    }

    if (this.notifiedSignals.has(payload.signal_key)) {
      payload.status = 'deduped';
      logger.info(`Telegram notification deduped in memory for signal key: ${payload.signal_key}`);
      return;
    }
    
    const message = this.formatMessage(payload);
    let chartUrl = undefined;
    
    // Generate Chart Screenshot URL if valid chartData is available (need >= 10 points for meaningful chart)
    if (payload.chartData && payload.chartData.length >= 10) {
        chartUrl = this.generateChartUrl(payload);
    }
    
    try {
      let success = false;
      if (chartUrl) {
          success = await getTelegramBot().sendPhoto(chartUrl, message);
      } else {
          success = await getTelegramBot().sendNotification(message);
      }
      
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
      logger.error('Error sending notification', { 
         signal_key: payload.signal_key,
         reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private generateChartUrl(payload: NotificationPayload): string {
      // Create a simplified line chart using QuickChart.io
      const data = payload.chartData!;
      const labels = data.map((_, i) => i.toString());
      
      const entryLine = data.map(() => payload.entry);
      const slLine = data.map(() => payload.sl);
      const tpLine = data.map(() => payload.tp[0] || payload.entry);

      const chartConfig = {
          type: 'line',
          data: {
              labels: labels,
              datasets: [
                  { label: 'Price', data: data, borderColor: 'blue', fill: false, borderWidth: 2, pointRadius: 0 },
                  { label: 'Entry', data: entryLine, borderColor: 'black', fill: false, borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
                  { label: 'SL', data: slLine, borderColor: 'red', fill: false, borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
                  { label: 'TP', data: tpLine, borderColor: 'green', fill: false, borderWidth: 1, borderDash: [5, 5], pointRadius: 0 }
              ]
          },
          options: {
              title: { display: true, text: `${payload.symbol} - ${payload.direction} Signal` },
              legend: { display: true, position: 'bottom' }
          }
      };
      
      const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
      return `https://quickchart.io/chart?c=${encodedConfig}&w=800&h=400&bkg=white`;
  }

  private formatMessage(payload: NotificationPayload): string {
    const passedChecks = payload.checklist ? payload.checklist.filter((i: any) => i.status === 'PASS').length : 0;
    const totalChecks = payload.checklist ? payload.checklist.length : 0;
    const checklistStr = payload.checklist && totalChecks > 0 ? `\n<b>AI Checklist:</b> ${passedChecks}/${totalChecks} Passed` : '';
    
    const escapeHtml = (text: string) => (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const formattedTime = new Date(payload.timestamp).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    return `🚨 <b>INSAI SIGNAL ALERT</b> 🚨

<b>Strategy:</b> ${escapeHtml(payload.strategyName)}
<b>Pair:</b> ${escapeHtml(payload.symbol)}
<b>Direction:</b> ${escapeHtml(payload.direction)}
<b>Entry:</b> ${payload.entry}
<b>SL:</b> ${payload.sl}
<b>TP:</b> ${payload.tp.join(', ')}${checklistStr}
<b>Reason:</b> ${escapeHtml(payload.reason)}
<b>Time:</b> ${formattedTime}`.trim();
  }
}

export const notificationEngine = new NotificationEngine();
