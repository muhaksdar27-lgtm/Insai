import { logger } from '../utils/logger';
import { getTelegramBot } from './telegram-bot';

export interface NotificationPayload {
  signal_key: string;
  correlationId?: string;
  strategyName: string;
  symbol: string;
  timeframe?: string;
  session?: string;
  direction: 'BUY' | 'SELL' | 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number[];
  riskReward?: string;
  atrBuffer?: string;
  validationStatus?: string;
  confidence?: string | number;
  checklist?: string[];
  reason?: string;
  aiProvider?: 'Deterministic' | 'Gemini' | string;
  timestamp: string;
  status: 'sent' | 'queued' | 'deduped' | 'suppressed' | 'failed' | 'retrying';
  qualityGatePassed?: boolean;
  aiDecision?: string;
  engineVersion?: string;
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

  private getStrategyDetails(strategyKey: string): { displayName: string; defaultReason: string; defaultChecklist: string[] } {
    const key = (strategyKey || '').toLowerCase();

    if (key.includes('strategy-1') || (key.includes('smc') && !key.includes('confluence'))) {
      return {
        displayName: 'STRATEGI 1 — SMC + Sesi London + M15',
        defaultReason: 'SMC market structure formed during London session on M15 timeframe following an Asian session liquidity sweep and M15 CHoCH structural trigger.',
        defaultChecklist: [
          'London Session Active',
          'Asia Session Liquidity Sweep',
          'M15 Change of Character (CHoCH)',
          'Mitigated Order Block / FVG Entry',
          'H1 Trend & Volatility Filter'
        ]
      };
    } else if (key.includes('strategy-2') || key.includes('snd') || key.includes('supply')) {
      return {
        displayName: 'STRATEGI 2 — Supply & Demand + Engulfing',
        defaultReason: 'Price retested high-probability Supply/Demand zone aligned with HTF trend, confirmed by an engulfing rejection candlestick.',
        defaultChecklist: [
          'HTF Trend Alignment',
          'Supply / Demand Zone Retest',
          'Engulfing Candlestick Trigger',
          'Moving Average Dynamic Support/Resistance',
          'ATR Volatility Filter'
        ]
      };
    } else if (key.includes('strategy-3') || key.includes('scalp')) {
      return {
        displayName: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
        defaultReason: 'Fast M1 scalping opportunity detected following H1 trend sweep and double top/bottom structural reversal pattern.',
        defaultChecklist: [
          'H1 Trend Alignment',
          'Key Liquidity Sweep',
          'Double Top / Double Bottom Pattern',
          'M1 Rejection Candle Trigger',
          'Tight ATR Stop Loss Buffer'
        ]
      };
    } else if (key.includes('strategy-4') || key.includes('news')) {
      return {
        displayName: 'STRATEGI 4 — News Liquidity Sweep Reversal',
        defaultReason: 'Post-news liquidity sweep reversal triggered after high-impact news volatility spike subsided, confirmed by structural Break of Structure (BOS).',
        defaultChecklist: [
          'Post-News Liquidity Window Active',
          'Liquidity Sweep Beyond Spike High/Low',
          'Break of Structure (BOS) Reversal',
          'Spread Normalization Verified',
          'Risk-Reward Ratio Validation'
        ]
      };
    } else if (key.includes('strategy-5') || key.includes('confluence')) {
      return {
        displayName: 'STRATEGI 5 — SMC-SD Pattern Confluence',
        defaultReason: 'High-probability multi-confluence setup confirmed across market structure, Supply/Demand zone, and Fibonacci retracement level.',
        defaultChecklist: [
          'Market Structure Alignment',
          'Supply / Demand Zone Confluence',
          'Fibonacci Retracement Level',
          'Liquidity Sweep Confirmation',
          'AI Confluence Verification'
        ]
      };
    }

    return {
      displayName: strategyKey || 'INSAI Strategy',
      defaultReason: 'Signal validated by deterministic trading rules and AI risk engine.',
      defaultChecklist: [
        'Market Structure Alignment',
        'Key Level / Zone Retest',
        'ATR Volatility Filter',
        'AI Risk Confluence'
      ]
    };
  }

  private formatMessage(payload: NotificationPayload): string {
    const escapeHtml = (text: string) => (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formattedTime = new Date(payload.timestamp).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    const rawDir = (payload.direction || '').toUpperCase();
    const action: 'BUY' | 'SELL' = (rawDir === 'BUY' || rawDir === 'LONG') ? 'BUY' : 'SELL';

    const { displayName, defaultReason, defaultChecklist } = this.getStrategyDetails(payload.strategyName);
    const timeframe = payload.timeframe || 'M15';
    const session = payload.session || 'London';
    const engineVer = payload.engineVersion || '2.0.0';

    let tpFormatted = '';
    if (payload.tp.length === 1) {
      tpFormatted = `${payload.tp[0]}`;
    } else if (payload.tp.length > 1) {
      tpFormatted = payload.tp.map((v, i) => `TP${i + 1}: ${v}`).join(' | ');
    } else {
      tpFormatted = `${payload.entry}`;
    }

    const rr = payload.riskReward || '1:2.0';
    const atr = payload.atrBuffer || '0.5x ATR';
    const validation = payload.validationStatus || 'Engine Validated';
    const confidence = typeof payload.confidence === 'number' ? `${payload.confidence}%` : (payload.confidence || '100%');

    const rawChecklist = payload.checklist && payload.checklist.length > 0 ? payload.checklist : defaultChecklist;
    const checklistFormatted = rawChecklist.map(item => `✅ ${escapeHtml(item)}`).join('\n');

    const reasonText = payload.reason && payload.reason.length > 5 ? payload.reason : defaultReason;
    const aiText = payload.aiProvider || 'Deterministic';

    return `🚨 <b>INSAI SIGNAL</b> 🚨

<b>Strategy :</b> ${escapeHtml(displayName)}
<b>Pair :</b> ${escapeHtml(payload.symbol)}
<b>Session :</b> ${escapeHtml(session)}
<b>Timeframe :</b> ${escapeHtml(timeframe)}

<b>Signal :</b>
<b>${action}</b>

<b>Entry :</b> ${payload.entry}
<b>Stop Loss :</b> ${payload.sl}
<b>Take Profit :</b> ${escapeHtml(tpFormatted)}

<b>Risk Reward :</b> ${escapeHtml(rr)}
<b>ATR Buffer :</b> ${escapeHtml(atr)}

<b>Validation :</b> ${escapeHtml(validation)}
<b>Confidence :</b> ${escapeHtml(confidence)}

<b>Checklist</b>

${checklistFormatted}

<b>Reason</b>

${escapeHtml(reasonText)}

<b>AI</b>

${escapeHtml(aiText)}

<b>Timestamp :</b> ${formattedTime}
<b>Engine Version :</b> ${escapeHtml(engineVer)}
<b>Signal ID :</b> ${escapeHtml(payload.signal_key)}`.trim();
  }
}

export const notificationEngine = new NotificationEngine();
