import { StateName } from '@/types';
import { StrategyRuleDefinition } from './types';

export type CanonicalStrategyId = 
  | 'strategy-1-smc'
  | 'strategy-2-snd'
  | 'strategy-3-scalping'
  | 'strategy-4-news'
  | 'strategy-5-smc-sd-confluence';

export interface CanonicalStepDefinition {
  step_id: string;
  step_order: number;
  rule_id: string;
  name: string;
  description: string;
  invalidation: string;
  defaultExpiryMinutes: number;
  status?: 'awaiting' | 'active' | 'terminal';
  next?: StateName | null;
  rollback?: StateName | null;
  timeout?: number;
}

export interface CanonicalStrategyDefinition {
  id: CanonicalStrategyId;
  name: string;
  shortName: string;
  version: string;
  status: 'ACTIVE' | 'UNDEFINED / SAME RULESET AS PRD';
  description: string;
  pair: string;
  pairRestriction: string[];
  sessionRequirement: {
    allowedSessions: string[];
    utcWindow?: string;
    description: string;
  };
  sessionRestriction: string[];
  timeframes: {
    bias: string;
    context?: string;
    entry: string;
    execution: string;
    intermediate?: string;
  };
  steps: CanonicalStepDefinition[];
  validationRules: string[];
  setupFields: string[];
  outputFields: string[];
  uiLabels: Record<string, string>;
  priority: number;
  rule_definition: StrategyRuleDefinition[];
  entry_rule: {
    type: 'LIMIT' | 'MARKET' | 'STOP';
    trigger: string;
    description: string;
  };
  sl_rule: {
    bufferFormula: string;
    anchor: string;
    description: string;
  };
  tp_rule: {
    tp1: string;
    tp2: string;
    tp3?: string;
    minRR: number;
    description: string;
  };
  filter: {
    spreadMaxPips: number;
    newsRestriction: string;
    sessionFilter: boolean;
    cooldownCandles?: number;
  };
  invalidation_rule: {
    conditions: string[];
    action: string;
  };
  expiry_rule: {
    maxDurationMinutes: number;
    condition: string;
  };
  evidence_model: {
    requiredFields: string[];
    description: string;
  };
}

export const CANONICAL_STRATEGY_DEFINITIONS: Record<CanonicalStrategyId, CanonicalStrategyDefinition> = {
  'strategy-1-smc': {
    id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    shortName: 'SMC + London + M15',
    version: '3.0.0',
    status: 'ACTIVE',
    description: 'Smart Money Concept strategy strictly for London session on M15 timeframe. Exploits Asian session liquidity sweeps during London open with M15 CHoCH and unmitigated OB/FVG retracements.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'London/NY Overlap'],
      utcWindow: '07:00-16:00 UTC',
      description: 'London liquidity window (07:00 - 16:00 UTC / GMT)'
    },
    sessionRestriction: ['London', 'London/NY Overlap'],
    timeframes: {
      bias: 'H1',
      context: 'M15',
      entry: 'M15',
      execution: 'M15'
    },
    steps: [
      {
        step_id: 'LONDON_FILTER',
        step_order: 1,
        rule_id: 'rule_session_restriction',
        name: 'Filter Sesi London',
        description: 'Memastikan waktu trading berada dalam jendela operasional Sesi London (07:00 - 16:00 UTC)',
        invalidation: 'Sesi London berakhir atau waktu di luar jam likuiditas utama',
        defaultExpiryMinutes: 300,
        status: 'awaiting',
        next: 'H1_TREND' as StateName,
        rollback: null,
        timeout: 0
      },
      {
        step_id: 'H1_TREND',
        step_order: 2,
        rule_id: 'rule_h1_trend',
        name: 'Analisis Trend H1',
        description: 'Menyesuaikan bias arah struktur pasar H1 (Bullish / Bearish)',
        invalidation: 'Trend H1 membalik arah berlawanan atau tidak terdefinisi',
        defaultExpiryMinutes: 240,
        status: 'awaiting',
        next: 'ASIA_SWEEP' as StateName,
        rollback: 'LONDON_FILTER' as StateName,
        timeout: 0
      },
      {
        step_id: 'ASIA_SWEEP',
        step_order: 3,
        rule_id: 'rule_liquidity_sweep',
        name: 'Sweep Likuiditas Asia',
        description: 'Mendeteksi sweep likuiditas pada High atau Low Sesi Asia',
        invalidation: 'Harga menembus jauh tanpa penolakan (breakout) atau sesi London usai',
        defaultExpiryMinutes: 180,
        status: 'awaiting',
        next: 'M15_CHOCH' as StateName,
        rollback: 'LONDON_FILTER' as StateName,
        timeout: 0
      },
      {
        step_id: 'M15_CHOCH',
        step_order: 4,
        rule_id: 'rule_choch_confirmation',
        name: 'Konfirmasi CHoCH M15',
        description: 'Mencari struktur pembalikan Change of Character pada timeframe M15',
        invalidation: 'Harga membuat new extreme menembus sweep wick',
        defaultExpiryMinutes: 120,
        status: 'awaiting',
        next: 'OB_FVG' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'OB_FVG',
        step_order: 5,
        rule_id: 'rule_ob_fvg_entry',
        name: 'OB & FVG Alignment',
        description: 'Validasi posisi entry pada zona Order Block atau Fair Value Gap yang belum termitigasi',
        invalidation: 'Zona OB/FVG tertembus total (> 100% mitigation / invalidation)',
        defaultExpiryMinutes: 90,
        status: 'awaiting',
        next: 'RISK_PARAMS' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'RISK_PARAMS',
        step_order: 6,
        rule_id: 'rule_risk_params',
        name: 'Parameter Risiko & SL/TP',
        description: 'Kalkulasi jarak SL (0.5x ATR buffer) dan TP rasio minimum 1:2.0',
        invalidation: 'Rasio R:R < 1:2.0 atau spread melebihi toleransi',
        defaultExpiryMinutes: 60,
        status: 'awaiting',
        next: 'AI_GATE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi konfirmasi model AI Gemini & Konsistensi Quality Gate',
        invalidation: 'AI menolak setup karena konflik makro atau volatilitas ekstrem',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'SIGNAL_ACTIVE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      }
    ],
    validationRules: [
      'rule_pair_restriction',
      'rule_session_restriction',
      'rule_h1_trend',
      'rule_liquidity_sweep',
      'rule_choch_confirmation',
      'rule_ob_fvg_entry',
      'rule_spread_check',
      'rule_atr_sl_buffer',
      'rule_risk_reward'
    ],
    setupFields: ['h1Trend', 'asiaLiquiditySweep', 'm15Choch', 'obFvgAlignment', 'londonSessionFilter', 'atr14Buffer'],
    outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
    uiLabels: {
      h1Trend: 'H1 Trend',
      asiaLiquiditySweep: 'Asia Liquidity Sweep',
      m15Choch: 'M15 CHoCH',
      obFvgAlignment: 'OB/FVG Alignment',
      londonSessionFilter: 'London Session',
      atr14Buffer: 'ATR SL Buffer'
    },
    priority: 5,
    rule_definition: [
      {
        rule_id: 'rule_h1_trend',
        name: 'H1 Higher Timeframe Trend Bias',
        mandatory: true,
        timeframe: 'H1',
        description: 'Trend struktur pasar H1 wajib sejalan dengan arah order flow (Bullish/Bearish)',
        evaluation_logic: 'H1 EMA20 > EMA50 with positive slope for Bullish; EMA20 < EMA50 with negative slope for Bearish',
        invalidation_condition: 'H1 trend direction neutral or opposite to setup bias'
      },
      {
        rule_id: 'rule_session_restriction',
        name: 'London Active Liquidity Session',
        mandatory: true,
        timeframe: 'M15',
        description: 'Waktu eksekusi dibatasi pada jendela Sesi London (07:00-16:00 UTC)',
        evaluation_logic: 'London UTC hour >= 7 && hour < 16',
        invalidation_condition: 'Outside London session window'
      },
      {
        rule_id: 'rule_liquidity_sweep',
        name: 'Asia High/Low Liquidity Sweep',
        mandatory: true,
        timeframe: 'M15',
        description: 'Pengambilan likuiditas Asia Low (Buy) atau Asia High (Sell)',
        evaluation_logic: 'Price wicks below Asian Low (Buy) or above Asian High (Sell)',
        invalidation_condition: 'Clean breakout without rejection'
      },
      {
        rule_id: 'rule_choch_confirmation',
        name: 'M15 Change of Character (MSS)',
        mandatory: true,
        timeframe: 'M15',
        description: 'Pembalikan struktur pasar internal M15 dengan candle displacement yang jelas',
        evaluation_logic: 'Close beyond last internal swing high (Buy) or swing low (Sell)',
        invalidation_condition: 'Price fails to break structural pivot or makes new extreme'
      },
      {
        rule_id: 'rule_ob_fvg_entry',
        name: 'Order Block / Fair Value Gap Alignment',
        mandatory: true,
        timeframe: 'M15',
        description: 'Retracement ke zona unmitigated OB atau FVG di area Discount (Buy) / Premium (Sell)',
        evaluation_logic: 'Price touches fresh OB/FVG within Discount (<50%) for Buy or Premium (>50%) for Sell',
        invalidation_condition: 'Zone completely breached (>100% mitigation)'
      },
      {
        rule_id: 'rule_risk_params',
        name: 'Institutional SL & R:R Verification',
        mandatory: true,
        timeframe: 'M15',
        description: 'SL ditempatkan di luar OB/Sweep dengan buffer 0.5x ATR, TP minimum 1:2.0',
        evaluation_logic: 'Calculated TP1 >= 2.0 * SL distance',
        invalidation_condition: 'Risk/Reward ratio < 1:2.0 or spread > 2.5 pips'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'Gemini AI Confluence Verification',
        mandatory: true,
        timeframe: 'M15',
        description: 'Verifikasi model AI Gemini untuk konsistensi institusional',
        evaluation_logic: 'AI Decision == "APPROVED" && AI Confidence >= 80%',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'LIMIT',
      trigger: 'Touch / mitigation of unmitigated M15 Order Block or Fair Value Gap after confirmed CHoCH',
      description: 'Buy Limit at Discount OB/FVG for Bullish; Sell Limit at Premium OB/FVG for Bearish'
    },
    sl_rule: {
      bufferFormula: '0.5 * ATR(14)',
      anchor: 'Swing Low / Asian Low sweep wick for BUY; Swing High / Asian High sweep wick for SELL',
      description: 'SL placed 0.5x ATR beyond the extreme sweep/OB wick'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Equilibrium / Intermediate Swing)',
      tp2: '1:3.5 Risk-Reward (Opposite Liquidity Pool / HTF Target)',
      minRR: 2.0,
      description: 'Minimum institutional 1:2.0 R:R with runner to 1:3.5'
    },
    filter: {
      spreadMaxPips: 2.5,
      newsRestriction: 'No high impact news within 15 minutes before/after',
      sessionFilter: true
    },
    invalidation_rule: {
      conditions: [
        'H1 HTF Trend breaks opposite direction',
        'Price breaks sweep extreme before CHoCH',
        'OB/FVG zone breached beyond 100%',
        'London session closes without fill'
      ],
      action: 'Set state to INVALIDATED and release setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 240,
      condition: 'Setup expires if entry is not triggered within 4 hours'
    },
    evidence_model: {
      requiredFields: ['h1Bias', 'session', 'level', 'sweepType', 'chochPrice', 'zoneType', 'atr14', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'Structured evidence containing H1 bias, Asian sweep level, M15 CHoCH price, OB coordinates, ATR buffer, and calculated SL/TP'
    }
  },

  'strategy-2-snd': {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    shortName: 'Supply & Demand + Engulfing',
    version: '3.0.0',
    status: 'ACTIVE',
    description: 'Supply and Demand zone trading paired with moving average confluence and engulfing candlestick trigger for high-probability reversals and continuations.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap', 'Asian'],
      description: 'Operates across standard liquid trading sessions'
    },
    sessionRestriction: ['Any'],
    timeframes: {
      bias: 'H1',
      context: 'H1',
      entry: 'M15',
      execution: 'M15'
    },
    steps: [
      {
        step_id: 'MA_TREND',
        step_order: 1,
        rule_id: 'rule_h1_trend',
        name: 'MA Trend Alignment',
        description: 'Konfirmasi arah trend utama menggunakan Moving Average (EMA 20/50/200)',
        invalidation: 'Harga menyilang MA berlawanan arah dengan candle close',
        defaultExpiryMinutes: 240,
        status: 'awaiting',
        next: 'SD_ZONE' as StateName,
        rollback: null,
        timeout: 0
      },
      {
        step_id: 'SD_ZONE',
        step_order: 2,
        rule_id: 'rule_sd_zone',
        name: 'Identifikasi Zona S&D',
        description: 'Mendeteksi area Supply atau Demand segar (Fresh DBR/RBD/RBR/DBD)',
        invalidation: 'Zona S&D tertembus atau sudah sepenuhnya termitigasi sebelumnya',
        defaultExpiryMinutes: 180,
        status: 'awaiting',
        next: 'ENGULFING_TRIGGER' as StateName,
        rollback: 'MA_TREND' as StateName,
        timeout: 0
      },
      {
        step_id: 'ENGULFING_TRIGGER',
        step_order: 3,
        rule_id: 'rule_engulfing_trigger',
        name: 'Engulfing Trigger Candle',
        description: 'Mencari konfirmasi candlestick Engulfing atau momentum rejection di dalam area S&D',
        invalidation: 'Candle close di luar batas zona S&D sebelum engulfing terjadi',
        defaultExpiryMinutes: 90,
        status: 'awaiting',
        next: 'RISK_PARAMS' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'RISK_PARAMS',
        step_order: 4,
        rule_id: 'rule_risk_params',
        name: 'Cek Spread & Parameter Risiko',
        description: 'Pengecekan spread normal & kalkulasi rasio Risk:Reward minimum 1:2.0',
        invalidation: 'Risk:Reward < 1:2.0 atau SL terlalu lebar',
        defaultExpiryMinutes: 60,
        status: 'awaiting',
        next: 'AI_GATE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'AI_GATE',
        step_order: 5,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi model AI Gemini untuk keselarasan zona S&D dan sentimen',
        invalidation: 'AI Quality Gate menolak setup',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'SIGNAL_ACTIVE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      }
    ],
    validationRules: [
      'rule_pair_restriction',
      'rule_session_restriction',
      'rule_h1_trend',
      'rule_sd_zone',
      'rule_engulfing_trigger',
      'rule_spread_check',
      'rule_atr_sl_buffer',
      'rule_risk_reward'
    ],
    setupFields: ['movingAverageTrend', 'supplyDemandZone', 'candlestickEngulfing', 'spreadCheck', 'atrBuffer'],
    outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
    uiLabels: {
      movingAverageTrend: 'MA Trend Alignment',
      supplyDemandZone: 'Supply & Demand Zone',
      candlestickEngulfing: 'Engulfing Candlestick Trigger',
      spreadCheck: 'Spread Gate',
      atrBuffer: 'ATR SL Buffer'
    },
    priority: 4,
    rule_definition: [
      {
        rule_id: 'rule_htf_ma_trend',
        name: 'MA50 / MA200 Trend Alignment',
        mandatory: true,
        timeframe: 'H1',
        description: 'Harga di atas MA50 & MA200 untuk Bullish; di bawah MA50 & MA200 untuk Bearish',
        evaluation_logic: 'Price > MA50 && MA50 > MA200 (Bullish) or Price < MA50 && MA50 < MA200 (Bearish)',
        invalidation_condition: 'Trend crosses opposite side of MA50/200'
      },
      {
        rule_id: 'rule_sd_zone',
        name: 'Fresh Supply/Demand Zone with Imbalance',
        mandatory: true,
        timeframe: 'M15',
        description: 'Zona DBR/RBR (Demand) atau RBD/DBD (Supply) yang belum pernah dites dengan FVG/Imbalance',
        evaluation_logic: 'Zone freshness == "FRESH" && Imbalance size >= 1.5x ATR',
        invalidation_condition: 'Zone previously mitigated or penetrated'
      },
      {
        rule_id: 'rule_engulfing_trigger',
        name: 'Lower Timeframe Engulfing Candlestick',
        mandatory: true,
        timeframe: 'M15',
        description: 'Candle penolakan Engulfing (Bullish Engulfing pada Demand, Bearish Engulfing pada Supply)',
        evaluation_logic: 'Engulfing body covers 100% of previous candle body',
        invalidation_condition: 'Opposite candle closes outside zone'
      },
      {
        rule_id: 'rule_risk_params',
        name: 'S&D Stop Loss & Risk Reward',
        mandatory: true,
        timeframe: 'M15',
        description: 'SL di luar batas ekstrim zona S&D + buffer 0.5x ATR, TP minimum 1:2.0',
        evaluation_logic: 'Calculated TP >= 2.0 * SL distance',
        invalidation_condition: 'Risk/Reward < 1:2.0'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'Gemini AI Confluence Verification',
        mandatory: true,
        timeframe: 'M15',
        description: 'AI Quality Gate validation',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'MARKET',
      trigger: 'Close of confirmed Bullish/Bearish Engulfing candlestick at Supply/Demand zone boundary',
      description: 'Market entry at engulfing close or limit entry at upper/lower zone margin'
    },
    sl_rule: {
      bufferFormula: '0.5 * ATR(14)',
      anchor: 'Lower boundary of Demand Zone (BUY) / Upper boundary of Supply Zone (SELL)',
      description: 'SL placed 0.5x ATR outside the S&D zone perimeter'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Nearest Opposite S&D Zone)',
      tp2: '1:3.0 Risk-Reward (HTF Liquidity Pool)',
      minRR: 2.0,
      description: 'Target opposite major S&D zone with minimum 1:2.0 R:R'
    },
    filter: {
      spreadMaxPips: 2.5,
      newsRestriction: 'No trade during high impact news releases',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Candle closes beyond S&D zone invalidation level',
        'MA50 crosses MA200 in opposite direction',
        'S&D zone is fully mitigated prior to entry'
      ],
      action: 'Transition setup to INVALIDATED and release lock'
    },
    expiry_rule: {
      maxDurationMinutes: 240,
      condition: 'Setup expires if zone is not touched or triggered within 4 hours'
    },
    evidence_model: {
      requiredFields: ['trend', 'fastEma', 'slowEma', 'zoneUpper', 'zoneLower', 'zoneType', 'zoneFreshness', 'engulfingType', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'S&D evidence capturing MA trend, zone coordinates, freshness state, engulfing candle metrics, and R:R parameters'
    }
  },

  'strategy-3-scalping': {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    shortName: 'Scalping SMC + M1 Sweep',
    version: '3.0.0',
    status: 'ACTIVE',
    description: 'Aggressive M1/M5 scalping aligned with H1 structural trend, requiring micro liquidity sweeps before double top or bottom structural formations.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'Active session liquidity window with tight spreads'
    },
    sessionRestriction: ['Any'],
    timeframes: {
      bias: 'H1',
      context: 'M15',
      entry: 'M1',
      execution: 'M1',
      intermediate: 'M5'
    },
    steps: [
      {
        step_id: 'H1_TREND',
        step_order: 1,
        rule_id: 'rule_h1_trend',
        name: 'Analisis Trend H1',
        description: 'Memastikan arah trend H1 selaras untuk eksekusi scalping aman',
        invalidation: 'Trend H1 sideways tanpa bias jelas',
        defaultExpiryMinutes: 180,
        status: 'awaiting',
        next: 'M15_RETRACEMENT' as StateName,
        rollback: null,
        timeout: 0
      },
      {
        step_id: 'M15_RETRACEMENT',
        step_order: 2,
        rule_id: 'rule_m15_retracement',
        name: 'Retracement M15',
        description: 'Mendeteksi gelombang koreksi harga masuk ke area Discount / Premium',
        invalidation: 'Koreksi menembus level invalidation swing structure',
        defaultExpiryMinutes: 120,
        status: 'awaiting',
        next: 'M1_M5_SWEEP' as StateName,
        rollback: 'H1_TREND' as StateName,
        timeout: 0
      },
      {
        step_id: 'M1_M5_SWEEP',
        step_order: 3,
        rule_id: 'rule_m1_m5_sweep',
        name: 'Sweep Likuiditas Scalp',
        description: 'Deteksi sweep likuiditas mikro pada timeframe M1 atau M5',
        invalidation: 'Harga tidak melakukan sweep dan langsung rally/dump tanpa likuiditas',
        defaultExpiryMinutes: 60,
        status: 'awaiting',
        next: 'DOUBLE_TOP_BOTTOM' as StateName,
        rollback: 'H1_TREND' as StateName,
        timeout: 0
      },
      {
        step_id: 'DOUBLE_TOP_BOTTOM',
        step_order: 4,
        rule_id: 'rule_double_top_bottom',
        name: 'Pola Double Top/Bottom',
        description: 'Konfirmasi formasi struktur Double Top / Double Bottom pada M1 WAJIB pasca-sweep',
        invalidation: 'Pola terbentuk sebelum sweep, atau puncak/lembah kedua menembus melebihi batas toleransi divergence',
        defaultExpiryMinutes: 45,
        status: 'awaiting',
        next: 'NECKLINE_BREAK' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'NECKLINE_BREAK',
        step_order: 5,
        rule_id: 'rule_neckline_break',
        name: 'Breakout Neckline',
        description: 'Konfirmasi penetrasi garis Neckline dengan momentum displacement',
        invalidation: 'Harga memantul kembali dari neckline tanpa breakout',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'RISK_NEWS_FILTER' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'RISK_NEWS_FILTER',
        step_order: 6,
        rule_id: 'rule_risk_news_filter',
        name: 'News Filter & Parameter Risiko',
        description: 'Pengecekan tidak adanya rilis berita besar dalam 15 menit & kalkulasi SL/TP',
        invalidation: 'Terdapat berita High-Impact rilis dalam rentang waktu terdekat',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'AI_GATE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi AI cepat untuk validasi momentum scalping',
        invalidation: 'AI menolak setup scalping',
        defaultExpiryMinutes: 15,
        status: 'awaiting',
        next: 'SIGNAL_ACTIVE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      }
    ],
    validationRules: [
      'rule_pair_restriction',
      'rule_session_restriction',
      'rule_h1_trend',
      'rule_m15_retracement',
      'rule_scalp_pattern',
      'rule_spread_check',
      'rule_atr_sl_buffer',
      'rule_risk_reward'
    ],
    setupFields: ['h1Trend', 'm15Retracement', 'scalpLiquiditySweep', 'm1DoubleTopBottom', 'necklineBreakout', 'newsFilter'],
    outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
    uiLabels: {
      h1Trend: 'H1 Trend Direction',
      m15Retracement: 'M15 Retracement Wave',
      scalpLiquiditySweep: 'M1/M5 Sweep',
      m1DoubleTopBottom: 'Double Top/Bottom',
      necklineBreakout: 'Neckline Breakout',
      newsFilter: '15m Pre/Post News Filter'
    },
    priority: 3,
    rule_definition: [
      {
        rule_id: 'rule_h1_trend',
        name: 'H1 Macro Trend Alignment',
        mandatory: true,
        timeframe: 'H1',
        description: 'H1 Bullish untuk Buy setup, H1 Bearish untuk Sell setup',
        evaluation_logic: 'H1 market structure bias is strictly aligned',
        invalidation_condition: 'H1 trend is neutral or opposite'
      },
      {
        rule_id: 'rule_m15_retracement',
        name: 'M15 Retracement Wave',
        mandatory: true,
        timeframe: 'M15',
        description: 'Harga mengalami koreksi sehat ke zona Discount/Premium',
        evaluation_logic: 'Pullback reaches at least 38.2% of prior M15 impulse',
        invalidation_condition: 'Pullback breaks structural origin'
      },
      {
        rule_id: 'rule_m1_m5_sweep',
        name: 'M1/M5 Micro Liquidity Sweep',
        mandatory: true,
        timeframe: 'M1',
        description: 'Pengambilan likuiditas micro swing low (Buy) atau micro swing high (Sell)',
        evaluation_logic: 'Wick breaks micro swing extreme and returns quickly',
        invalidation_condition: 'No sweep occurs before reversal pattern'
      },
      {
        rule_id: 'rule_double_top_bottom',
        name: 'Post-Sweep Double Top / Bottom Formation',
        mandatory: true,
        timeframe: 'M1',
        description: 'Pola Double Bottom / Top WAJIB terjadi SETELAH sweep. Pola yang terbentuk sebelum sweep langsung DITOLAK.',
        evaluation_logic: 'patternTimestamp > sweepTimestamp && Math.abs(peak1 - peak2) / atr < 0.2',
        invalidation_condition: 'Pattern occurred prior to sweep or asymmetry > 20%'
      },
      {
        rule_id: 'rule_neckline_break',
        name: 'M1 Neckline Displacement Break',
        mandatory: true,
        timeframe: 'M1',
        description: 'Candle close M1 menembus garis leher (Neckline) pola pembalikan',
        evaluation_logic: 'Close > Neckline (Buy) or Close < Neckline (Sell)',
        invalidation_condition: 'Rejection at neckline without break'
      },
      {
        rule_id: 'rule_risk_news_filter',
        name: 'Scalp Risk Parameters & R:R',
        mandatory: true,
        timeframe: 'M1',
        description: 'SL di luar extreme pola + 0.3x ATR buffer, TP rasio minimum 1:1.5',
        evaluation_logic: 'TP >= 1.5 * SL distance',
        invalidation_condition: 'R:R < 1:1.5 or spread > 2.0 pips'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'AI Fast Scalping Verification',
        mandatory: true,
        timeframe: 'M1',
        description: 'Gemini AI fast momentum validation',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'MARKET',
      trigger: 'Close of M1 candle breaking the Double Bottom / Double Top Neckline with displacement',
      description: 'Market Buy on Bullish Neckline break; Market Sell on Bearish Neckline break'
    },
    sl_rule: {
      bufferFormula: '0.3 * ATR(14)',
      anchor: 'Lowest trough of Double Bottom (BUY) / Highest peak of Double Top (SELL)',
      description: 'Tight scalp SL placed 0.3x ATR behind the double top/bottom structural extremes'
    },
    tp_rule: {
      tp1: '1:1.5 Risk-Reward (M15 High/Low Range)',
      tp2: '1:2.0 Risk-Reward (Next M15 Liquidity Pool)',
      minRR: 1.5,
      description: 'Quick scalp TP at 1:1.5 - 1:2.0 R:R'
    },
    filter: {
      spreadMaxPips: 2.0,
      newsRestriction: 'Strictly prohibited 15 minutes before and after high-impact news',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Double bottom / top formed BEFORE liquidity sweep (Strict Rejection)',
        'Neckline fails to break within 15 candles of pattern completion',
        'Price breaks below second trough / above second peak',
        'High impact news scheduled within 15 minutes'
      ],
      action: 'Reject pattern, mark INVALIDATED, and clear setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 60,
      condition: 'Scalp setup expires after 60 minutes if neckline is not broken'
    },
    evidence_model: {
      requiredFields: ['h1Bias', 'sweepPrice', 'sweepTimestamp', 'peak1Price', 'peak2Price', 'patternTimestamp', 'necklinePrice', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'Scalping evidence verifying sweep-before-pattern temporal ordering, neckline level, and tight scalp risk boundaries'
    }
  },

  'strategy-4-news': {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    shortName: 'News Sweep Reversal',
    version: '3.0.0',
    status: 'ACTIVE',
    description: 'Specialized news strategy trading the post-news liquidity sweep. Strictly avoids the initial spike candle, waiting for wick rejection and structural reversal on M1.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'News Window'],
      description: 'High-Impact News Release Windows (CPI, NFP, FOMC, PPI)'
    },
    sessionRestriction: ['News Window'],
    timeframes: {
      bias: 'M15',
      context: 'M5',
      entry: 'M1',
      execution: 'M1'
    },
    steps: [
      {
        step_id: 'NEWS_WINDOW',
        step_order: 1,
        rule_id: 'rule_news_window',
        name: 'Jendela High-Impact News',
        description: 'Deteksi periode rilis berita berdampak tinggi (CPI, NFP, FOMC, PPI)',
        invalidation: 'Tidak ada agenda berita High Impact dalam rentang waktu yang sesuai',
        defaultExpiryMinutes: 180,
        status: 'awaiting',
        next: 'SPREAD_NORMAL' as StateName,
        rollback: null,
        timeout: 0
      },
      {
        step_id: 'SPREAD_NORMAL',
        step_order: 2,
        rule_id: 'rule_spread_normal',
        name: 'Normalisasi Spread',
        description: 'Memastikan spread broker telah kembali normal pasca lonjakan awal berita',
        invalidation: 'Spread tetap melebar abnormal melebihi ambang batas toleransi',
        defaultExpiryMinutes: 60,
        status: 'awaiting',
        next: 'POST_NEWS_SWEEP' as StateName,
        rollback: 'NEWS_WINDOW' as StateName,
        timeout: 0
      },
      {
        step_id: 'POST_NEWS_SWEEP',
        step_order: 3,
        rule_id: 'rule_post_news_sweep',
        name: 'Post-News Spike Sweep',
        description: 'Mendeteksi spike sweep likuiditas di mana harga mengambil level ekstrim High/Low',
        invalidation: 'Tidak terjadi sweep melainkan pergerakan terusan satu arah',
        defaultExpiryMinutes: 60,
        status: 'awaiting',
        next: 'WICK_REJECTION' as StateName,
        rollback: 'NEWS_WINDOW' as StateName,
        timeout: 0
      },
      {
        step_id: 'WICK_REJECTION',
        step_order: 4,
        rule_id: 'rule_wick_rejection',
        name: 'Candle Wick Rejection',
        description: 'Konfirmasi penolakan harga berupa ekor panjang (Wick Rejection minimal 50% candle)',
        invalidation: 'Candle ditutup full body tanpa ekor penolakan yang cukup',
        defaultExpiryMinutes: 45,
        status: 'awaiting',
        next: 'M1_BOS_REVERSAL' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'M1_BOS_REVERSAL',
        step_order: 5,
        rule_id: 'rule_m1_bos_reversal',
        name: 'M1 Reversal BOS',
        description: 'Konfirmasi pembalikan arah dengan Break of Structure pada timeframe M1',
        invalidation: 'Harga kembali menembus ujung wick penolakan',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'RISK_PARAMS' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'RISK_PARAMS',
        step_order: 6,
        rule_id: 'rule_risk_params',
        name: 'Parameter Risiko SL/TP',
        description: 'Kalkulasi Stop Loss di luar ekor spike & Take Profit rasio minimum 1:2',
        invalidation: 'Risk:Reward < 1:2.0',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'AI_GATE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi model AI Gemini khusus skenario volatilitas berita',
        invalidation: 'AI menolak setup pembalikan berita',
        defaultExpiryMinutes: 15,
        status: 'awaiting',
        next: 'SIGNAL_ACTIVE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      }
    ],
    validationRules: [
      'rule_pair_restriction',
      'rule_session_restriction',
      'rule_news_reversal',
      'rule_spread_check',
      'rule_atr_sl_buffer',
      'rule_risk_reward'
    ],
    setupFields: ['highImpactNewsEvent', 'firstCandleFilter', 'newsLiquiditySweep', 'longWickRejection', 'm1BOSReversal', 'spreadNormalization'],
    outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
    uiLabels: {
      highImpactNewsEvent: 'High Impact Event',
      firstCandleFilter: 'Initial Candle Filter',
      newsLiquiditySweep: 'Post-News Sweep',
      longWickRejection: 'Wick Rejection Candle',
      m1BOSReversal: 'M1 BOS Reversal',
      spreadNormalization: 'Spread Normalization'
    },
    priority: 2,
    rule_definition: [
      {
        rule_id: 'rule_high_impact_news',
        name: 'High-Impact News Release Identification',
        mandatory: true,
        timeframe: 'M15',
        description: 'Agenda berita High-Impact resmi tercatat dalam kalender',
        evaluation_logic: 'News event impact == "HIGH" && minutesFromEvent <= 60',
        invalidation_condition: 'No active high impact news'
      },
      {
        rule_id: 'rule_spread_normal',
        name: 'First Candle No-Trade & Spread Normalization',
        mandatory: true,
        timeframe: 'M5',
        description: 'DILARANG entry pada candle berita pertama. Spread broker harus telah kembali normal (< 3.0 pips).',
        evaluation_logic: 'candleIndexPostNews > 0 && spreadPips <= 3.0',
        invalidation_condition: 'Entry attempted on first news candle or spread > 3.0 pips'
      },
      {
        rule_id: 'rule_post_news_sweep',
        name: 'Post-News M5 Liquidity Sweep',
        mandatory: true,
        timeframe: 'M5',
        description: 'Spike menembus level likuiditas dan segera berbalik arah',
        evaluation_logic: 'M5 spike high > preNewsHigh (Sell) or M5 spike low < preNewsLow (Buy)',
        invalidation_condition: 'Price trends through level without reversal'
      },
      {
        rule_id: 'rule_wick_rejection',
        name: 'Long Wick Candle Rejection (>= 50%)',
        mandatory: true,
        timeframe: 'M5',
        description: 'Candle spike membentuk ekor penolakan minimal 50% dari total range candle',
        evaluation_logic: 'wickSize / totalCandleRange >= 0.50',
        invalidation_condition: 'Full body close through level'
      },
      {
        rule_id: 'rule_m1_bos_reversal',
        name: 'M1 Reversal Break of Structure',
        mandatory: true,
        timeframe: 'M1',
        description: 'Struktur M1 mengonfirmasi pergeseran momentum pembalikan',
        evaluation_logic: 'M1 candle closes beyond recent micro structural pivot',
        invalidation_condition: 'Price makes new high above spike extreme'
      },
      {
        rule_id: 'rule_risk_params',
        name: 'News Reversal Risk Parameters & R:R',
        mandatory: true,
        timeframe: 'M1',
        description: 'SL di luar ujung ekor spike + 0.6x ATR buffer, TP rasio minimum 1:2.0',
        evaluation_logic: 'Calculated TP >= 2.0 * SL distance',
        invalidation_condition: 'Risk/Reward < 1:2.0'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'AI Volatility Reversal Gate',
        mandatory: true,
        timeframe: 'M1',
        description: 'AI model verification for macro volatility behavior',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'MARKET',
      trigger: 'Close of M1 BOS candle following post-news spike sweep and long-wick rejection',
      description: 'Market entry once spread normalizes and M1 structure confirms reversal'
    },
    sl_rule: {
      bufferFormula: '0.6 * ATR(14)',
      anchor: 'Extreme high of news spike wick (SELL) / Extreme low of news spike wick (BUY)',
      description: 'SL placed 0.6x ATR outside the extreme point of the news spike'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Pre-News Consolidation Origin)',
      tp2: '1:3.0 Risk-Reward (Opposite Pre-News Swing Range)',
      minRR: 2.0,
      description: 'Target pre-news equilibrium and opposite range with minimum 1:2.0 R:R'
    },
    filter: {
      spreadMaxPips: 3.0,
      newsRestriction: 'Strictly dedicated to high-impact post-news volatility (no initial candle trade)',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Attempting entry on the first news candle (Strict Prohibition)',
        'Price breaks beyond extreme news spike wick',
        'Spread remains elevated (> 3.0 pips) after 30 minutes',
        'No M1 BOS confirmed within 45 minutes of release'
      ],
      action: 'Mark INVALIDATED and clear setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 120,
      condition: 'Setup expires 2 hours after news release'
    },
    evidence_model: {
      requiredFields: ['newsTitle', 'newsImpact', 'spreadPips', 'preNewsLevel', 'spikeExtremePrice', 'rejectionRatio', 'bosPrice', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'News evidence capturing event impact, spread width, spike coordinates, rejection wick ratio, and M1 BOS confirmation'
    }
  },

  'strategy-5-smc-sd-confluence': {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    shortName: 'SMC-SD Confluence',
    version: '3.0.0',
    status: 'UNDEFINED / SAME RULESET AS PRD',
    description: 'UNDEFINED / SAME RULESET AS PRD: High-probability multi-variable confluence engine requiring overlaps between HTF market structure, Supply/Demand zones, Fibonacci OTE, and liquidity sweeps.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'High-volume trading sessions'
    },
    sessionRestriction: ['Any'],
    timeframes: {
      bias: 'H1',
      context: 'M15',
      entry: 'M5',
      execution: 'M5'
    },
    steps: [
      {
        step_id: 'H1_M15_STRUCTURE',
        step_order: 1,
        rule_id: 'rule_h1_m15_structure',
        name: 'Struktur H1 & M15',
        description: 'Alignment hirarki struktur pasar antara timeframe H1 dan M15',
        invalidation: 'Struktur pasar H1 dan M15 saling bertolak belakang tanpa bias',
        defaultExpiryMinutes: 240,
        status: 'awaiting',
        next: 'SD_FIB_OVERLAP' as StateName,
        rollback: null,
        timeout: 0
      },
      {
        step_id: 'SD_FIB_OVERLAP',
        step_order: 2,
        rule_id: 'rule_sd_fib_overlap',
        name: 'Overlap Zona S&D & Fib',
        description: 'Validasi minimal 2 dari 3 overlap (Zona Supply/Demand, FVG, Fibonacci OTE 0.618-0.786)',
        invalidation: 'Harga tidak berada di zona tumpang tindih konfluen',
        defaultExpiryMinutes: 180,
        status: 'awaiting',
        next: 'CONFLUENCE_SWEEP' as StateName,
        rollback: 'H1_M15_STRUCTURE' as StateName,
        timeout: 0
      },
      {
        step_id: 'CONFLUENCE_SWEEP',
        step_order: 3,
        rule_id: 'rule_confluence_sweep',
        name: 'Confluence Level Sweep',
        description: 'Sweep likuiditas yang terjadi tepat pada level konfluen tinggi',
        invalidation: 'Level tertembus keras tanpa reaksi sweep likuiditas',
        defaultExpiryMinutes: 120,
        status: 'awaiting',
        next: 'REJECTION_TRIGGER' as StateName,
        rollback: 'H1_M15_STRUCTURE' as StateName,
        timeout: 0
      },
      {
        step_id: 'REJECTION_TRIGGER',
        step_order: 4,
        rule_id: 'rule_rejection_trigger',
        name: 'Trigger Rejection Candle',
        description: 'Konfirmasi candlestick Rejection atau CHoCH pembalikan pada LTF',
        invalidation: 'Tidak ada candle penolakan dalam batas toleransi',
        defaultExpiryMinutes: 60,
        status: 'awaiting',
        next: 'MIN_RR_CALC' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'MIN_RR_CALC',
        step_order: 5,
        rule_id: 'rule_min_rr_calc',
        name: 'Kalkulasi Risiko (Min 1:2+ R:R)',
        description: 'Pemeriksaan rasio Risk:Reward minimal 1:2 dengan buffer ATR yang ketat',
        invalidation: 'Target profit tidak memungkinkan rasio 1:2',
        defaultExpiryMinutes: 45,
        status: 'awaiting',
        next: 'AI_GATE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      },
      {
        step_id: 'AI_GATE',
        step_order: 6,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi konfluen AI Gemini & Quality Gate multivariat',
        invalidation: 'AI menolak setup karena skor konfluen tidak mencapai ambang batas',
        defaultExpiryMinutes: 30,
        status: 'awaiting',
        next: 'SIGNAL_ACTIVE' as StateName,
        rollback: 'REJECTED' as StateName,
        timeout: 0
      }
    ],
    validationRules: [
      'rule_pair_restriction',
      'rule_session_restriction',
      'rule_h1_trend',
      'rule_sd_zone',
      'rule_confluence_overlap',
      'rule_spread_check',
      'rule_atr_sl_buffer',
      'rule_risk_reward'
    ],
    setupFields: ['structureAlignment', 'sdFibOverlap', 'confluenceSweep', 'rejectionCandle', 'minRRCalculation'],
    outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
    uiLabels: {
      structureAlignment: 'H1/M15 Structure Alignment',
      sdFibOverlap: 'S&D + Fib 61.8/78.6 Overlap',
      confluenceSweep: 'Confluence Sweep',
      rejectionCandle: 'LTF Rejection Trigger',
      minRRCalculation: 'Min 1:2 R:R Ratio'
    },
    priority: 1,
    rule_definition: [
      {
        rule_id: 'rule_h1_m15_structure',
        name: 'Multi-Timeframe Structure Harmony',
        mandatory: true,
        timeframe: 'H1/M15',
        description: 'Struktur H1 dan M15 berada dalam bias tren yang harmonis',
        evaluation_logic: 'H1 trend direction == M15 structure bias',
        invalidation_condition: 'Conflicting timeframes'
      },
      {
        rule_id: 'rule_sd_fib_overlap',
        name: '2-of-3 Confluence Overlap Zone',
        mandatory: true,
        timeframe: 'M15',
        description: 'Minimal 2 overlap dari: (1) S&D Zone, (2) OB/FVG, (3) Fibonacci OTE 0.618-0.786',
        evaluation_logic: 'overlapCount >= 2',
        invalidation_condition: 'Less than 2 confluence factors present'
      },
      {
        rule_id: 'rule_confluence_sweep',
        name: 'Confluence Level Liquidity Sweep',
        mandatory: true,
        timeframe: 'M15',
        description: 'Pengambilan likuiditas pada batas zona konfluen',
        evaluation_logic: 'Liquidity sweep confirmed at overlap zone boundary',
        invalidation_condition: 'Zone completely invalidated'
      },
      {
        rule_id: 'rule_rejection_trigger',
        name: 'M15 Momentum Rejection Trigger',
        mandatory: true,
        timeframe: 'M15',
        description: 'Candle konfirmasi penolakan momentum',
        evaluation_logic: 'Rejection wick or displacement candle in confluence zone',
        invalidation_condition: 'No rejection trigger'
      },
      {
        rule_id: 'rule_min_rr_calc',
        name: 'Institutional R:R Gate (Min 1:2.0)',
        mandatory: true,
        timeframe: 'M15',
        description: 'Kalkulasi SL di luar zona konfluen + 0.5x ATR, TP minimum 1:2.0',
        evaluation_logic: 'Calculated TP >= 2.0 * SL distance',
        invalidation_condition: 'R:R < 1:2.0'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'Gemini AI Confluence Review',
        mandatory: true,
        timeframe: 'M15',
        description: 'AI Gate multivariat verification',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'LIMIT',
      trigger: 'Touch of the overlapping confluence node (S&D + Fib 0.618-0.786 + FVG)',
      description: 'Limit order at the confluence epicenter'
    },
    sl_rule: {
      bufferFormula: '0.5 * ATR(14)',
      anchor: 'Confluence zone structural boundary',
      description: 'SL placed 0.5x ATR beyond the outer confluence margin'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Equilibrium Target)',
      tp2: '1:3.0 Risk-Reward (Major Confluence Extreme)',
      minRR: 2.0,
      description: 'Target 1:2.0 to 1:3.0 R:R'
    },
    filter: {
      spreadMaxPips: 2.5,
      newsRestriction: 'No news within 15 minutes',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Confluence overlap invalidated by full candle penetration',
        'H1 structure fails to hold',
        'Fewer than 2 confluence elements valid'
      ],
      action: 'Mark INVALIDATED and clear setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 240,
      condition: 'Expires after 4 hours without execution'
    },
    evidence_model: {
      requiredFields: ['trend', 'zoneUpper', 'zoneLower', 'fibLevel', 'overlapCount', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'Multi-confluence evidence documenting overlapping factor counts, Fibonacci levels, and calculated risk ratios'
    }
  }
};

export const CANONICAL_STRATEGY_IDS: CanonicalStrategyId[] = [
  'strategy-1-smc',
  'strategy-2-snd',
  'strategy-3-scalping',
  'strategy-4-news',
  'strategy-5-smc-sd-confluence'
];

/**
 * Returns canonical definition for a strategy ID.
 * Throws an explicit error if the strategy ID is not recognized (no silent fallback).
 */
export function getCanonicalStrategy(id: string): CanonicalStrategyDefinition {
  const strat = CANONICAL_STRATEGY_DEFINITIONS[id as CanonicalStrategyId];
  if (!strat) {
    throw new Error(`[CANONICAL_ERROR] Unknown strategy ID: "${id}". Fallback to Strategy 1 is forbidden.`);
  }
  return strat;
}

export function tryGetCanonicalStrategy(id: string): CanonicalStrategyDefinition | undefined {
  return CANONICAL_STRATEGY_DEFINITIONS[id as CanonicalStrategyId];
}

export function getAllCanonicalStrategies(): CanonicalStrategyDefinition[] {
  return CANONICAL_STRATEGY_IDS.map(id => CANONICAL_STRATEGY_DEFINITIONS[id]);
}

export function getCanonicalSteps(strategyId: string): CanonicalStepDefinition[] {
  const strat = getCanonicalStrategy(strategyId);
  return strat.steps;
}

