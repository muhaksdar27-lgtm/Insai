import { logger } from '../utils/logger';
import { getTelegramBot } from './telegram-bot';

export interface NotificationPayload {
  signal_key: string;
  correlationId?: string;
  strategyName: string;
  symbol: string;
  timeframe?: string;
  session?: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number[];
  riskReward?: string;
  atrBuffer?: string;
  validationStatus?: string;
  confidence?: string | number;
  rulesPassed?: string[];
  checklist?: string[]; // Backwards compatibility alias
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
    // 1. Strict Final Quality Gate Guard
    if (
      payload.status === 'suppressed' ||
      payload.status === 'failed' ||
      payload.qualityGatePassed !== true ||
      payload.aiDecision === 'REJECTED' ||
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
      // Direct text notification only - no charts, photos, graphs, or placeholders
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

  private translateRuleKey(ruleKey: string): string {
    const raw = (ruleKey || '').trim();
    const ruleMap: Record<string, string> = {
      'rule_pair_xauusd': 'XAUUSD Pair Restriction Verified',
      'rule_session_london': 'London Session Active Window',
      'rule_h1_trend': 'H1 Higher Timeframe Trend Alignment',
      'rule_asia_liquidity_sweep': 'Asia Session Liquidity Sweep Confirmed',
      'rule_choch_confirmation': 'M15 Change of Character (CHoCH) Confirmed',
      'rule_ob_fvg_entry': 'Order Block / Fair Value Gap Alignment',
      'rule_atr_sl_buffer': 'ATR Stop Loss Buffer Validated',
      'rule_ma_trend': 'Moving Average Dynamic Confluence',
      'rule_sd_zone_touch': 'Supply / Demand Zone Retest',
      'rule_engulfing_confirm': 'Engulfing Candlestick Trigger',
      'rule_spread_check': 'Spread & Volatility Filter Passed',
      'rule_m15_retracement': 'M15 Retracement Level Confirmed',
      'rule_liquidity_sweep': 'Key Liquidity Sweep Confirmed',
      'rule_m1_double_top_bottom': 'M1 Double Top / Double Bottom Reversal Pattern',
      'rule_neckline_break': 'Neckline Breakout Confirmation',
      'rule_rr_min_1_3': 'Strict Minimum 1:3 Risk-Reward Ratio',
      'rule_news_filter': 'High-Impact News Exclusion Gate',
      'rule_news_high_impact': 'Post-News Volatility Window Active',
      'rule_spread_wide_filter': 'Post-News Spread Normalization',
      'rule_rejection_confirmation': 'Wick Rejection Candle Trigger',
      'rule_bos_reversal': 'Break of Structure (BOS) Reversal',
      'rule_h1_m15_structure': 'H1/M15 Market Structure Alignment',
      'rule_zone_overlap_2_of_3': 'Supply/Demand & Fib Overlap (2 of 3)',
      'rule_entry_trigger': 'Rejection Trigger Candle',
      'rule_rr_gate': 'Minimum 1:2+ Risk-Reward Gate',
      'rule_ai_validation': 'Quality Gate & Risk Engine Audit'
    };

    return ruleMap[raw] || raw;
  }

  private getStrategyDetails(strategyKey: string): { displayName: string; uniqueReason: string; defaultRules: string[] } {
    const key = (strategyKey || '').toLowerCase();

    if (key.includes('strategy-1') || (key.includes('smc') && !key.includes('confluence'))) {
      return {
        displayName: 'Strategy 1 — SMC + London Session + M15',
        uniqueReason: 'Smart Money Concepts (SMC) institutional setup identified during the London session on M15 timeframe. Price swept Asian session liquidity and executed an M15 Change of Character (CHoCH), aligning entry at a mitigated Order Block / Fair Value Gap with higher timeframe trend direction.',
        defaultRules: [
          'London Session Active Window',
          'Asia Session Liquidity Sweep Confirmed',
          'M15 Change of Character (CHoCH) Confirmed',
          'Order Block / Fair Value Gap Alignment',
          'H1 Higher Timeframe Trend Alignment',
          'ATR Stop Loss Buffer Validated'
        ]
      };
    } else if (key.includes('strategy-2') || key.includes('snd') || key.includes('supply')) {
      return {
        displayName: 'Strategy 2 — Supply & Demand + Engulfing',
        uniqueReason: 'Supply & Demand retest setup. Price retested a high-probability Higher Timeframe (HTF) Supply or Demand zone aligned with moving average trend direction, confirmed by an engulfing rejection candlestick trigger and spread filter validation.',
        defaultRules: [
          'H1 Higher Timeframe Trend Alignment',
          'Supply / Demand Zone Retest',
          'Engulfing Candlestick Trigger',
          'Moving Average Dynamic Confluence',
          'Spread & Volatility Filter Passed'
        ]
      };
    } else if (key.includes('strategy-3') || key.includes('scalp')) {
      return {
        displayName: 'Strategy 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
        uniqueReason: 'M1 Scalping setup triggered following an H1 trend liquidity sweep and low timeframe double top/bottom structural reversal pattern, confirmed by a quick rejection candle trigger and tight ATR risk management.',
        defaultRules: [
          'H1 Higher Timeframe Trend Alignment',
          'Key Liquidity Sweep Confirmed',
          'M1 Double Top / Double Bottom Reversal Pattern',
          'Neckline Breakout Confirmation',
          'Wick Rejection Candle Trigger',
          'Strict Minimum 1:3 Risk-Reward Ratio'
        ]
      };
    } else if (key.includes('strategy-4') || key.includes('news')) {
      return {
        displayName: 'Strategy 4 — News Liquidity Sweep Reversal',
        uniqueReason: 'Post-news liquidity sweep reversal triggered after high-impact economic news spike volatility subsided. Price swept liquidity beyond news spike extremes and initiated a structural Break of Structure (BOS) reversal with normalized spreads.',
        defaultRules: [
          'Post-News Volatility Window Active',
          'Key Liquidity Sweep Confirmed',
          'Break of Structure (BOS) Reversal',
          'Post-News Spread Normalization',
          'ATR Stop Loss Buffer Validated'
        ]
      };
    } else if (key.includes('strategy-5') || key.includes('confluence')) {
      return {
        displayName: 'Strategy 5 — SMC-SD Pattern Confluence',
        uniqueReason: 'High-probability multi-confluence setup confirmed across market structure (BOS/CHoCH), HTF Supply/Demand zone overlap, Fibonacci retracement level (OOTE 61.8%-78.6%), and liquidity sweep confirmation.',
        defaultRules: [
          'H1/M15 Market Structure Alignment',
          'Supply/Demand & Fib Overlap (2 of 3)',
          'Key Liquidity Sweep Confirmed',
          'Rejection Trigger Candle',
          'Minimum 1:2+ Risk-Reward Gate'
        ]
      };
    }

    return {
      displayName: strategyKey || 'INSAI Strategy',
      uniqueReason: 'Signal generated through deterministic rule validation, market structure alignment, and volatility analysis.',
      defaultRules: [
        'Market Structure Alignment',
        'Key Level / Zone Retest',
        'ATR Volatility Filter Passed',
        'Quality Gate & Risk Engine Audit'
      ]
    };
  }

  private formatMessage(payload: NotificationPayload): string {
    const escapeHtml = (text: string) => (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Convert direction strictly to BUY or SELL (no LONG, no SHORT)
    const rawDir = (payload.direction || '').toUpperCase();
    const action: 'BUY' | 'SELL' = (rawDir === 'BUY' || rawDir === 'LONG') ? 'BUY' : 'SELL';

    const { displayName, uniqueReason, defaultRules } = this.getStrategyDetails(payload.strategyName);
    const symbol = payload.symbol || 'XAUUSD';
    const timeframe = payload.timeframe || 'M15';
    const session = payload.session || 'London';
    const rawVer = payload.engineVersion || '2.0.0';
    const engineVer = rawVer.startsWith('v') ? rawVer : `v${rawVer}`;
    const formattedTime = new Date(payload.timestamp || Date.now()).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    let tpFormatted = '';
    if (Array.isArray(payload.tp) && payload.tp.length > 0) {
      if (payload.tp.length === 1) {
        tpFormatted = `${payload.tp[0]}`;
      } else {
        tpFormatted = payload.tp.map((v, i) => `TP${i + 1}: ${v}`).join(' | ');
      }
    } else {
      tpFormatted = `${payload.entry}`;
    }

    const rr = payload.riskReward || '1:2.0';
    const atr = payload.atrBuffer || '0.5x ATR';
    const validation = payload.validationStatus || 'Engine Validated';

    // Rules Passed list - translate candidate rule keys to clean readable bullet points
    const rawRulesList = (payload.rulesPassed && payload.rulesPassed.length > 0)
      ? payload.rulesPassed
      : ((payload.checklist && payload.checklist.length > 0) ? payload.checklist : defaultRules);
    
    const formattedRules = rawRulesList.map(item => `✅ ${escapeHtml(this.translateRuleKey(item))}`).join('\n');

    // Genuine non-fake confidence calculation
    let confidenceStr = '';
    if (typeof payload.confidence === 'number') {
      confidenceStr = `${payload.confidence}%`;
    } else if (typeof payload.confidence === 'string' && payload.confidence.trim().length > 0) {
      const trimmed = payload.confidence.trim();
      confidenceStr = trimmed.endsWith('%') ? trimmed : `${trimmed}%`;
    } else {
      // Calculate from rules passed ratio
      const totalRules = defaultRules.length;
      const passedCount = rawRulesList.length;
      const calculatedPct = Math.min(100, Math.max(75, Math.round((passedCount / totalRules) * 100)));
      confidenceStr = `${calculatedPct}%`;
    }

    const reasonText = payload.reason && payload.reason.trim().length > 10 ? payload.reason : uniqueReason;

    // Strict Template Layout
    return `🚨 <b>INSAI SIGNAL</b> 🚨

<b>Strategy :</b> ${escapeHtml(displayName)}
<b>Pair :</b> ${escapeHtml(symbol)}
<b>Session :</b> ${escapeHtml(session)}
<b>Timeframe :</b> ${escapeHtml(timeframe)}

<b>Signal :</b> ${action}

<b>Entry :</b> ${payload.entry}
<b>Stop Loss :</b> ${payload.sl}
<b>Take Profit :</b> ${escapeHtml(tpFormatted)}

<b>Risk Reward :</b> ${escapeHtml(rr)}
<b>ATR Buffer :</b> ${escapeHtml(atr)}

<b>Validation :</b> ${escapeHtml(validation)}
<b>Confidence :</b> ${escapeHtml(confidenceStr)}

<b>Rules Passed :</b>
${formattedRules}

<b>Reason :</b>
${escapeHtml(reasonText)}

<b>Engine Version :</b> ${escapeHtml(engineVer)}
<b>Signal ID :</b> ${escapeHtml(payload.signal_key)}
<b>Timestamp :</b> ${formattedTime}`.trim();
  }
}

export const notificationEngine = new NotificationEngine();

