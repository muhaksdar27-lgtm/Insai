import { SetupStepRecord } from './types';

export interface StrategyStepBlueprint {
  step_id: string;
  step_order: number;
  rule_id: string;
  name: string;
  description: string;
  invalidation: string;
  defaultExpiryMinutes: number;
}

export const STRATEGY_BLUEPRINTS: Record<string, StrategyStepBlueprint[]> = {
  'strategy-1-smc': [
    {
      step_id: 'LONDON_FILTER',
      step_order: 1,
      rule_id: 'rule_session_restriction',
      name: 'Filter Sesi London',
      description: 'Memastikan waktu trading berada dalam jendela operasional Sesi London (07:00 - 16:00 UTC/GMT)',
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

  'strategy-2-snd': [
    {
      step_id: 'MA_TREND',
      step_order: 1,
      rule_id: 'rule_ma_trend',
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

  'strategy-3-scalping': [
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

  'strategy-4-news': [
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

  'strategy-5-smc-sd-confluence': [
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
  ]
};

export function instantiateStrategySteps(strategyId: string, timestamp: string = new Date().toISOString()): SetupStepRecord[] {
  const blueprints = STRATEGY_BLUEPRINTS[strategyId] || STRATEGY_BLUEPRINTS['strategy-1-smc'];
  return blueprints.map((bp) => ({
    step_id: bp.step_id,
    step_order: bp.step_order,
    strategy_id: strategyId,
    rule_id: bp.rule_id,
    name: bp.name,
    description: bp.description,
    state: bp.step_order === 1 ? 'AWAITING' : 'AWAITING',
    timestamp,
    evidence: {},
    reason: 'Initial setup step registered, awaiting condition evaluation',
    invalidation: bp.invalidation,
    expiry: new Date(new Date(timestamp).getTime() + bp.defaultExpiryMinutes * 60 * 1000).toISOString(),
    last_evaluated_timestamp: timestamp
  }));
}
