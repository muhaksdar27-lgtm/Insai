import { StateName } from '@/types';

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
}

export interface CanonicalStrategyDefinition {
  id: CanonicalStrategyId;
  name: string;
  shortName: string;
  version: string;
  description: string;
  pair: string;
  pairRestriction: string[];
  sessionRequirement: {
    allowedSessions: string[];
    description: string;
  };
  timeframes: {
    bias: string;
    context?: string;
    entry: string;
    execution: string;
  };
  steps: CanonicalStepDefinition[];
  validationRules: string[];
  setupFields: string[];
  outputFields: string[];
  uiLabels: Record<string, string>;
  priority: number;
}

export const CANONICAL_STRATEGY_DEFINITIONS: Record<CanonicalStrategyId, CanonicalStrategyDefinition> = {
  'strategy-1-smc': {
    id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    shortName: 'SMC + London + M15',
    version: '1.0.0',
    description: 'Smart Money Concept strategy strictly for London session on M15 timeframe. Exploits Asian session liquidity sweeps during London open with M15 CHoCH and unmitigated OB/FVG retracements.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'London/NY Overlap'],
      description: 'London liquidity window (07:00 - 16:00 UTC)'
    },
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
        defaultExpiryMinutes: 300
      },
      {
        step_id: 'H1_TREND',
        step_order: 2,
        rule_id: 'rule_h1_trend',
        name: 'Analisis Trend H1',
        description: 'Menyesuaikan bias arah struktur pasar H1 (Bullish / Bearish)',
        invalidation: 'Trend H1 membalik arah berlawanan atau tidak terdefinisi',
        defaultExpiryMinutes: 240
      },
      {
        step_id: 'ASIA_SWEEP',
        step_order: 3,
        rule_id: 'rule_liquidity_sweep',
        name: 'Sweep Likuiditas Asia',
        description: 'Mendeteksi sweep likuiditas pada High atau Low Sesi Asia',
        invalidation: 'Harga menembus jauh tanpa penolakan (breakout) atau sesi London usai',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'M15_CHOCH',
        step_order: 4,
        rule_id: 'rule_choch_confirmation',
        name: 'Konfirmasi CHoCH M15',
        description: 'Mencari struktur pembalikan Change of Character pada timeframe M15',
        invalidation: 'Harga membuat new extreme menembus sweep wick',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'OB_FVG',
        step_order: 5,
        rule_id: 'rule_ob_fvg_entry',
        name: 'OB & FVG Alignment',
        description: 'Validasi posisi entry pada zona Order Block atau Fair Value Gap yang belum termitigasi',
        invalidation: 'Zona OB/FVG tertembus total (> 100% mitigation / invalidation)',
        defaultExpiryMinutes: 90
      },
      {
        step_id: 'RISK_PARAMS',
        step_order: 6,
        rule_id: 'rule_risk_params',
        name: 'Parameter Risiko & SL/TP',
        description: 'Kalkulasi jarak SL (0.5x ATR buffer) dan TP rasio minimum 1:2.0',
        invalidation: 'Rasio R:R < 1:2.0 atau spread melebihi toleransi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi konfirmasi model AI Gemini & Konsistensi Quality Gate',
        invalidation: 'AI menolak setup karena konflik makro atau volatilitas ekstrem',
        defaultExpiryMinutes: 30
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
    priority: 5
  },

  'strategy-2-snd': {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    shortName: 'Supply & Demand + Engulfing',
    version: '1.0.0',
    description: 'Supply and Demand zone trading paired with moving average confluence and engulfing candlestick trigger for high-probability reversals and continuations.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap', 'Asian'],
      description: 'Operates across standard liquid trading sessions'
    },
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
        defaultExpiryMinutes: 240
      },
      {
        step_id: 'SD_ZONE',
        step_order: 2,
        rule_id: 'rule_sd_zone',
        name: 'Identifikasi Zona S&D',
        description: 'Mendeteksi area Supply atau Demand segar (Fresh DBR/RBD/RBR/DBD)',
        invalidation: 'Zona S&D tertembus atau sudah sepenuhnya termitigasi sebelumnya',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'ENGULFING_TRIGGER',
        step_order: 3,
        rule_id: 'rule_engulfing_trigger',
        name: 'Engulfing Trigger Candle',
        description: 'Mencari konfirmasi candlestick Engulfing atau momentum rejection di dalam area S&D',
        invalidation: 'Candle close di luar batas zona S&D sebelum engulfing terjadi',
        defaultExpiryMinutes: 90
      },
      {
        step_id: 'RISK_PARAMS',
        step_order: 4,
        rule_id: 'rule_risk_params',
        name: 'Cek Spread & Parameter Risiko',
        description: 'Pengecekan spread normal & kalkulasi rasio Risk:Reward minimum 1:2.0',
        invalidation: 'Risk:Reward < 1:2.0 atau SL terlalu lebar',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'AI_GATE',
        step_order: 5,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi model AI Gemini untuk keselarasan zona S&D dan sentimen',
        invalidation: 'AI Quality Gate menolak setup',
        defaultExpiryMinutes: 30
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
    priority: 4
  },

  'strategy-3-scalping': {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    shortName: 'Scalping SMC + M1 Sweep',
    version: '1.0.0',
    description: 'Aggressive M1/M5 scalping aligned with H1 structural trend, requiring micro liquidity sweeps before double top or bottom structural formations.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'Active session liquidity window with tight spreads'
    },
    timeframes: {
      bias: 'H1',
      context: 'M15',
      entry: 'M1',
      execution: 'M1'
    },
    steps: [
      {
        step_id: 'H1_TREND',
        step_order: 1,
        rule_id: 'rule_h1_trend',
        name: 'Analisis Trend H1',
        description: 'Memastikan arah trend H1 selaras untuk eksekusi scalping aman',
        invalidation: 'Trend H1 sideways tanpa bias jelas',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'M15_RETRACEMENT',
        step_order: 2,
        rule_id: 'rule_m15_retracement',
        name: 'Retracement M15',
        description: 'Mendeteksi gelombang koreksi harga masuk ke area Discount / Premium',
        invalidation: 'Koreksi menembus level invalidation swing structure',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'M1_M5_SWEEP',
        step_order: 3,
        rule_id: 'rule_m1_m5_sweep',
        name: 'Sweep Likuiditas Scalp',
        description: 'Deteksi sweep likuiditas mikro pada timeframe M1 atau M5',
        invalidation: 'Harga tidak melakukan sweep dan langsung rally/dump tanpa likuiditas',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'DOUBLE_TOP_BOTTOM',
        step_order: 4,
        rule_id: 'rule_double_top_bottom',
        name: 'Pola Double Top/Bottom',
        description: 'Konfirmasi formasi struktur Double Top / Double Bottom pada M1',
        invalidation: 'Puncak/lembah kedua menembus melebihi batas toleransi divergence',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'NECKLINE_BREAK',
        step_order: 5,
        rule_id: 'rule_neckline_break',
        name: 'Breakout Neckline',
        description: 'Konfirmasi penetrasi garis Neckline dengan momentum displacement',
        invalidation: 'Harga memantul kembali dari neckline tanpa breakout',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'RISK_NEWS_FILTER',
        step_order: 6,
        rule_id: 'rule_risk_news_filter',
        name: 'News Filter & Parameter Risiko',
        description: 'Pengecekan tidak adanya rilis berita besar dalam 15 menit & kalkulasi SL/TP',
        invalidation: 'Terdapat berita High-Impact rilis dalam rentang waktu terdekat',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi AI cepat untuk validasi momentum scalping',
        invalidation: 'AI menolak setup scalping',
        defaultExpiryMinutes: 15
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
    priority: 3
  },

  'strategy-4-news': {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    shortName: 'News Sweep Reversal',
    version: '1.0.0',
    description: 'Specialized news strategy trading the post-news liquidity sweep. Strictly avoids the initial spike candle, waiting for wick rejection and structural reversal on M1.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'News Window'],
      description: 'High-Impact News Release Windows (CPI, NFP, FOMC, PPI)'
    },
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
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'SPREAD_NORMAL',
        step_order: 2,
        rule_id: 'rule_spread_normal',
        name: 'Normalisasi Spread',
        description: 'Memastikan spread broker telah kembali normal pasca lonjakan awal berita',
        invalidation: 'Spread tetap melebar abnormal melebihi ambang batas toleransi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'POST_NEWS_SWEEP',
        step_order: 3,
        rule_id: 'rule_post_news_sweep',
        name: 'Post-News Spike Sweep',
        description: 'Mendeteksi spike sweep likuiditas di mana harga mengambil level ekstrim High/Low',
        invalidation: 'Tidak terjadi sweep melainkan pergerakan terusan satu arah',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'WICK_REJECTION',
        step_order: 4,
        rule_id: 'rule_wick_rejection',
        name: 'Candle Wick Rejection',
        description: 'Konfirmasi penolakan harga berupa ekor panjang (Wick Rejection minimal 50% candle)',
        invalidation: 'Candle ditutup full body tanpa ekor penolakan yang cukup',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'M1_BOS_REVERSAL',
        step_order: 5,
        rule_id: 'rule_m1_bos_reversal',
        name: 'M1 Reversal BOS',
        description: 'Konfirmasi pembalikan arah dengan Break of Structure pada timeframe M1',
        invalidation: 'Harga kembali menembus ujung wick penolakan',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'RISK_PARAMS',
        step_order: 6,
        rule_id: 'rule_risk_params',
        name: 'Parameter Risiko SL/TP',
        description: 'Kalkulasi Stop Loss di luar ekor spike & Take Profit rasio minimum 1:2',
        invalidation: 'Risk:Reward < 1:2.0',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi model AI Gemini khusus skenario volatilitas berita',
        invalidation: 'AI menolak setup pembalikan berita',
        defaultExpiryMinutes: 15
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
    priority: 2
  },

  'strategy-5-smc-sd-confluence': {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    shortName: 'SMC-SD Confluence',
    version: '1.0.0',
    description: 'High-probability multi-variable confluence engine requiring overlaps between HTF market structure, Supply/Demand zones, Fibonacci OTE, and liquidity sweeps.',
    pair: 'XAUUSD',
    pairRestriction: ['XAUUSD'],
    sessionRequirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'High-volume trading sessions'
    },
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
        defaultExpiryMinutes: 240
      },
      {
        step_id: 'SD_FIB_OVERLAP',
        step_order: 2,
        rule_id: 'rule_sd_fib_overlap',
        name: 'Overlap Zona S&D & Fib',
        description: 'Validasi minimal 2 dari 3 overlap (Zona Supply/Demand, FVG, Fibonacci OTE 0.618-0.786)',
        invalidation: 'Harga tidak berada di zona tumpang tindih konfluen',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'CONFLUENCE_SWEEP',
        step_order: 3,
        rule_id: 'rule_confluence_sweep',
        name: 'Confluence Level Sweep',
        description: 'Sweep likuiditas yang terjadi tepat pada level konfluen tinggi',
        invalidation: 'Level tertembus keras tanpa reaksi sweep likuiditas',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'REJECTION_TRIGGER',
        step_order: 4,
        rule_id: 'rule_rejection_trigger',
        name: 'Trigger Rejection Candle',
        description: 'Konfirmasi candlestick Rejection atau CHoCH pembalikan pada LTF',
        invalidation: 'Tidak ada candle penolakan dalam batas toleransi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'MIN_RR_CALC',
        step_order: 5,
        rule_id: 'rule_min_rr_calc',
        name: 'Kalkulasi Risiko (Min 1:2+ R:R)',
        description: 'Pemeriksaan rasio Risk:Reward minimal 1:2 dengan buffer ATR yang ketat',
        invalidation: 'Target profit tidak memungkinkan rasio 1:2',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'AI_GATE',
        step_order: 6,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi konfluen AI Gemini & Quality Gate multivariat',
        invalidation: 'AI menolak setup karena skor konfluen tidak mencapai ambang batas',
        defaultExpiryMinutes: 30
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
    priority: 5
  }
};

export const CANONICAL_STRATEGY_IDS: CanonicalStrategyId[] = [
  'strategy-1-smc',
  'strategy-2-snd',
  'strategy-3-scalping',
  'strategy-4-news',
  'strategy-5-smc-sd-confluence'
];

export function getCanonicalStrategy(id: string): CanonicalStrategyDefinition | undefined {
  return CANONICAL_STRATEGY_DEFINITIONS[id as CanonicalStrategyId];
}

export function getAllCanonicalStrategies(): CanonicalStrategyDefinition[] {
  return CANONICAL_STRATEGY_IDS.map(id => CANONICAL_STRATEGY_DEFINITIONS[id]);
}

export function getCanonicalSteps(strategyId: string): CanonicalStepDefinition[] {
  const strat = getCanonicalStrategy(strategyId);
  return strat ? strat.steps : [];
}
