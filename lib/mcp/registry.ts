import { logger } from '../utils/logger';
import { getDatabaseClient } from '../db/client';

export type MCPStatusType = 'ONLINE' | 'NOT CONFIGURED' | 'DISABLED' | 'UNAVAILABLE' | 'OFFLINE' | 'RATE LIMITED' | 'DEGRADED' | 'QUOTA_EXCEEDED' | 'LOCKED' | 'PROVIDER_ERROR' | 'CACHE_TIMEOUT' | 'INVALID_KEY';

export interface MCPStatus {
  name: string;
  category: string;
  purpose: string;
  sourceType: string;
  status: MCPStatusType;
  lastCheck: string | null;
  lastError: string | null;
  notes: string;
  dependencies: string[];
}

export class MCPRegistry {
  private mcps: Map<string, MCPStatus> = new Map();

  private static readonly ALIAS_MAP: Record<string, string> = {
    'Supply and Demand Engine': 'Supply & Demand Engine',
    'Supply & Demand Engine': 'Supply & Demand Engine',
    'Drawdown Guard': 'Max Drawdown Guardian',
    'Max Drawdown Guardian': 'Max Drawdown Guardian',
    'Anti Overtrade Engine': 'Anti-Overtrade Shield',
    'Anti-Overtrade Shield': 'Anti-Overtrade Shield',
    'Quality Gate': 'Signal Quality Gate',
    'Signal Quality Gate': 'Signal Quality Gate',
    'Metrics Engine': 'Metrics Collector',
    'Metrics Collector': 'Metrics Collector',
    'Error Monitor': 'Error Tracker',
    'Error Tracker': 'Error Tracker',
    'Logger': 'Audit Log Pipeline',
    'Audit Log Pipeline': 'Audit Log Pipeline',
    'Confluence Engine': 'Multi-TF Confluence Engine',
    'Multi-TF Confluence Engine': 'Multi-TF Confluence Engine'
  };

  constructor() {
    this.seedRegistry();
  }

  private seedRegistry() {
    // 1) Market Data
    this.registerMCP('Binance', 'Market Data', 'harga dan candle support', 'API', 'ONLINE', 'Public API', []);
    this.registerMCP('Polygon.io', 'Market Data', 'harga dan candle XAUUSD', 'API', 'NOT CONFIGURED', 'Requires POLYGON_API_KEY', []);
    this.registerMCP('TwelveData', 'Market Data', 'harga dan candle XAUUSD', 'API', 'NOT CONFIGURED', 'Requires TWELVEDATA_API_KEY', []);
    this.registerMCP('YahooFinance', 'Market Data', 'referensi market tambahan', 'API', 'ONLINE', 'Public API', []);
    this.registerMCP('NewsAPI', 'Market Data', 'berita finansial', 'API', 'NOT CONFIGURED', 'Requires NEWS_API_KEY', []);
    this.registerMCP('ForexFactory', 'Market Data', 'kalender ekonomi dan impact event', 'API / Scrape', 'NOT CONFIGURED', 'Fetches public JSON', []);
    this.registerMCP('Twitter Bearer', 'Market Data', 'sentimen sosial / berita cepat', 'API', 'NOT CONFIGURED', 'Requires Twitter API key', []);

    // 2) News & Fundamental
    this.registerMCP('Financial News Engine', 'News & Fundamental', 'agregasi news relevan', 'Internal', 'ONLINE', '', ['NewsAPI', 'Twitter Bearer']);
    this.registerMCP('News Sentiment Engine', 'News & Fundamental', 'memberi sentimen news', 'Internal', 'NOT CONFIGURED', '', ['Financial News Engine']);
    this.registerMCP('Macro Event Engine', 'News & Fundamental', 'membaca event makro', 'Internal', 'ONLINE', '', ['ForexFactory']);
    this.registerMCP('Central Bank Engine', 'News & Fundamental', 'membaca risiko keputusan bank sentral', 'Internal', 'ONLINE', '', ['Macro Event Engine']);
    this.registerMCP('Geopolitical Risk Engine', 'News & Fundamental', 'mengidentifikasi risiko geopolitik', 'Internal', 'ONLINE', '', ['Financial News Engine']);
    this.registerMCP('Volatility News Engine', 'News & Fundamental', 'menilai apakah news memicu volatilitas tinggi', 'Internal', 'ONLINE', '', ['ForexFactory', 'Financial News Engine']);
    this.registerMCP('News Impact Suppression Layer', 'News & Fundamental', 'menahan signal saat news terlalu berisiko', 'Internal', 'ONLINE', '', ['Volatility News Engine', 'Macro Event Engine']);

    // 3) Smart Money Concept & Strategy Engines
    this.registerMCP('Liquidity Map Engine', 'Smart Money Concept', 'memetakan high/low, liquidity pool', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Equal High Low Engine', 'Smart Money Concept', 'deteksi equal high/low', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Breaker Block Engine', 'Smart Money Concept', 'deteksi breaker block', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Mitigation Block Engine', 'Smart Money Concept', 'deteksi mitigation block', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Rejection Block Engine', 'Smart Money Concept', 'deteksi rejection block', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Imbalance Engine', 'Smart Money Concept', 'deteksi imbalance / FVG', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('MSS Engine', 'Smart Money Concept', 'market structure shift', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('SMC Logic Engine', 'Smart Money Concept', 'validasi algoritma Smart Money Concept Strategy 1', 'Internal', 'ONLINE', '', ['MSS Engine', 'Imbalance Engine', 'Liquidity Map Engine']);
    this.registerMCP('Supply & Demand Engine', 'Smart Money Concept', 'zone supply/demand dan candlestick trigger Strategy 2', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Scalping Trends Engine', 'Smart Money Concept', 'deteksi pullback dan micro CHoCH Strategy 3', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Multi-TF Confluence Engine', 'Smart Money Concept', 'korelasi multi-timeframe H1-M15 Strategy 5', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Internal Structure Engine', 'Smart Money Concept', 'struktur internal pada timeframe kecil', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('External Structure Engine', 'Smart Money Concept', 'struktur eksternal pada HTF', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Range Engine', 'Smart Money Concept', 'mengenali ranging vs trending', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Killzone Engine', 'Smart Money Concept', 'membaca session kill zone', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Session Bias Engine', 'Smart Money Concept', 'bias berdasarkan session', 'Internal', 'ONLINE', '', ['Killzone Engine', 'External Structure Engine']);
    this.registerMCP('RSI Engine', 'Smart Money Concept', 'filter momentum tambahan', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('MA Engine', 'Smart Money Concept', 'trend filter tambahan', 'Internal', 'ONLINE', '', ['TwelveData']);

    // 4) AI
    this.registerMCP('GeminiAI', 'AI', 'Google Gemini AI models', 'LLM API', 'NOT CONFIGURED', 'Requires GEMINI_API_KEY', []);
    this.registerMCP('AI Validator', 'AI', 'approve/reject/pending setup', 'LLM API', 'NOT CONFIGURED', 'Requires GEMINI_API_KEY or Python Engine', ['TwelveData', 'NewsAPI']);

    // 5) Signal Quality
    this.registerMCP('Signal Score Engine', 'Signal Quality', 'memberi skor kualitas setup', 'Internal', 'NOT CONFIGURED', '', []);
    this.registerMCP('Probability Engine', 'Signal Quality', 'estimasi probabilitas berbasis evidence', 'Internal', 'NOT CONFIGURED', '', ['Signal Score Engine']);
    this.registerMCP('Consistency Engine', 'Signal Quality', 'evaluasi kontradiksi rule dan logika', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Entry Quality Engine', 'Signal Quality', 'menilai kualitas entry', 'Internal', 'NOT CONFIGURED', '', ['Liquidity Map Engine', 'Imbalance Engine']);
    this.registerMCP('Exit Quality Engine', 'Signal Quality', 'menilai kualitas exit', 'Internal', 'NOT CONFIGURED', '', ['Liquidity Map Engine']);
    this.registerMCP('RR Optimizer', 'Signal Quality', 'mengecek rasio risiko-imbalan', 'Internal', 'NOT CONFIGURED', '', ['Entry Quality Engine', 'Exit Quality Engine']);
    this.registerMCP('Trade Ranking Engine', 'Signal Quality', 'memberi peringkat setup', 'Internal', 'NOT CONFIGURED', '', ['Signal Score Engine', 'Probability Engine']);
    this.registerMCP('Signal Suppression Engine', 'Signal Quality', 'menahan signal yang lemah', 'Internal', 'NOT CONFIGURED', '', ['Signal Score Engine', 'News Impact Suppression Layer']);
    this.registerMCP('Anti-Overtrade Shield', 'Signal Quality', 'membatasi frekuensi trade berlebih', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Profit Consistency Filter', 'Signal Quality', 'memfilter setup yang tidak konsisten', 'Internal', 'NOT CONFIGURED', '', ['Historical Replay Engine']);
    this.registerMCP('Signal Quality Score Engine', 'Signal Quality', 'menilai kualitas signal', 'Internal', 'NOT CONFIGURED', '', ['PostgreSQL DB']);
    this.registerMCP('Signal Quality Gate', 'Signal Quality', 'pemeriksaan akhir sebelum live signal', 'Internal', 'ONLINE', '', ['Consistency Engine']);

    // 6) Risk
    this.registerMCP('Position Sizing Engine', 'Risk', 'ukuran posisi', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Daily Risk Engine', 'Risk', 'batas risiko harian', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Consecutive Loss Protection', 'Risk', 'proteksi loss beruntun', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Capital Preservation Engine', 'Risk', 'menjaga modal', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Max Drawdown Guardian', 'Risk', 'proteksi drawdown maksimum', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);

    // 7) Database / Memory / Cache
    this.registerMCP('PostgreSQL DB', 'Database / Memory / Cache', 'penyimpanan state, history, config, audit', 'Database API', 'ONLINE', 'Requires DATABASE_URL', []);

    // 8) Observability
    this.registerMCP('Audit Log Pipeline', 'Observability', 'audit trail terstruktur', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Metrics Collector', 'Observability', 'koleksi latensi & error rate operasional', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Performance Monitor', 'Observability', 'monitor performa', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Resource Monitor', 'Observability', 'CPU, memory, storage', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Health Check Engine', 'Observability', 'cek kesehatan komponen', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Alert Engine', 'Observability', 'alert operasional', 'Internal', 'ONLINE', '', ['Health Check Engine', 'Telegram Bot']);
    this.registerMCP('Crash Recovery Engine', 'Observability', 'recovery setelah crash', 'Internal', 'NOT CONFIGURED', '', []);
    this.registerMCP('AI Monitor', 'Observability', 'status AI service', 'Internal', 'ONLINE', '', ['AI Validator']);
    this.registerMCP('Signal Monitor', 'Observability', 'status signal pipeline', 'Internal', 'ONLINE', '', []);
    this.registerMCP('System Monitor', 'Observability', 'ringkasan sistem', 'Internal', 'ONLINE', '', ['Health Check Engine', 'Metrics Collector']);
    this.registerMCP('Dashboard Engine', 'Observability', 'menyajikan status terintegrasi', 'Internal', 'NOT CONFIGURED', '', ['System Monitor']);
    this.registerMCP('Error Tracker', 'Observability', 'tracking exception & circuit breaker', 'Internal', 'ONLINE', '', []);

    // 9) Deployment
    this.registerMCP('Python Engine Manager', 'Deployment', 'build dan runtime python engine', 'Infrastructure', 'NOT CONFIGURED', '', []);

    // 10) Telegram
    this.registerMCP('Telegram Bot', 'Telegram', 'notifikasi signal dan status', 'API', 'NOT CONFIGURED', '', []);
  }

  private registerMCP(name: string, category: string, purpose: string, sourceType: string, status: MCPStatusType, notes: string, dependencies: string[]) {
    this.mcps.set(name, {
      name,
      category,
      purpose,
      sourceType,
      status,
      lastCheck: new Date().toISOString(),
      lastError: null,
      notes,
      dependencies
    });
  }

  private getOrRegisterMCP(name: string): MCPStatus {
    const canonicalName = MCPRegistry.ALIAS_MAP[name] || name;
    let mcp = this.mcps.get(canonicalName);
    if (!mcp) {
      // Infer category from name
      let category = 'Observability';
      if (canonicalName.includes('Risk') || canonicalName.includes('Loss') || canonicalName.includes('Drawdown') || canonicalName.includes('Capital')) {
        category = 'Risk';
      } else if (canonicalName.includes('SMC') || canonicalName.includes('Supply') || canonicalName.includes('Demand') || canonicalName.includes('Scalping') || canonicalName.includes('Structure') || canonicalName.includes('Liquidity') || canonicalName.includes('Imbalance') || canonicalName.includes('MSS')) {
        category = 'Smart Money Concept';
      } else if (canonicalName.includes('Signal') || canonicalName.includes('Quality') || canonicalName.includes('Confluence') || canonicalName.includes('Gate') || canonicalName.includes('Overtrade')) {
        category = 'Signal Quality';
      } else if (canonicalName.includes('News') || canonicalName.includes('Macro') || canonicalName.includes('Bank') || canonicalName.includes('Geopolitical')) {
        category = 'News & Fundamental';
      }

      this.registerMCP(canonicalName, category, `${canonicalName} service module`, 'Internal', 'ONLINE', '', []);
      mcp = this.mcps.get(canonicalName)!;
    }
    return mcp;
  }

  public async syncToDatabase() {
    if (!getDatabaseClient().isConnected()) return;
    
    const all = Array.from(this.mcps.values());
    for (const mcp of all) {
      await getDatabaseClient().upsertMCPService({
        name: mcp.name,
        category: mcp.category,
        purpose: mcp.purpose,
        source_type: mcp.sourceType,
        status: mcp.status,
        dependency: mcp.dependencies.join(','),
        last_checked_at: mcp.lastCheck,
        last_error: mcp.lastError,
        notes: mcp.notes
      }).catch(() => {});
    }
    logger.info('Synced MCP registry to database.');
  }

  public getStatus(name: string): MCPStatus | undefined {
    const canonicalName = MCPRegistry.ALIAS_MAP[name] || name;
    return this.mcps.get(canonicalName);
  }

  public async getAllStatusAsync(): Promise<any[]> {
    if (getDatabaseClient().isConnected()) {
       const dbList = await getDatabaseClient().getMCPServices();
       if (dbList && Array.isArray(dbList) && dbList.length > 0) {
         return dbList.map((row: any) => ({
           name: row.name,
           category: row.category,
           purpose: row.purpose,
           sourceType: row.source_type,
           status: row.status,
           lastCheck: row.last_checked_at,
           lastError: row.last_error,
           notes: row.notes,
           dependencies: row.dependency ? row.dependency.split(',') : []
         }));
       }
    }
    return Array.from(this.mcps.values());
  }

  public getAllStatus(): MCPStatus[] {
    return Array.from(this.mcps.values());
  }

  public async reportConnected(name: string) {
    const mcp = this.getOrRegisterMCP(name);
    const statusChanged = mcp.status !== 'ONLINE' || mcp.lastError !== null;
    mcp.status = 'ONLINE';
    mcp.lastCheck = new Date().toISOString();
    mcp.lastError = null;
    logger.info(`MCP ${mcp.name} is connected (ONLINE).`);
    
    if (statusChanged && getDatabaseClient().isConnected()) {
       await getDatabaseClient().upsertMCPService({
         name: mcp.name,
         status: mcp.status,
         last_checked_at: mcp.lastCheck,
         last_error: mcp.lastError
       }).catch(() => {});
    }
  }

  public async reportNotConfigured(name: string, reason: string) {
    const mcp = this.getOrRegisterMCP(name);
    const statusChanged = mcp.status !== 'NOT CONFIGURED' || mcp.lastError !== reason;
    mcp.status = 'NOT CONFIGURED';
    mcp.lastCheck = new Date().toISOString();
    mcp.lastError = reason;
    logger.warn(`MCP ${mcp.name} is NOT CONFIGURED: ${reason}`);
    
    if (statusChanged && getDatabaseClient().isConnected()) {
       await getDatabaseClient().upsertMCPService({
         name: mcp.name,
         status: mcp.status,
         last_checked_at: mcp.lastCheck,
         last_error: mcp.lastError
       }).catch(() => {});
    }
  }

  public async reportOffline(name: string, reason: string) {
    const mcp = this.getOrRegisterMCP(name);
    const statusChanged = mcp.status !== 'OFFLINE' || mcp.lastError !== reason;
    mcp.status = 'OFFLINE';
    mcp.lastCheck = new Date().toISOString();
    mcp.lastError = reason;
    logger.warn(`MCP ${mcp.name} is OFFLINE: ${reason}`);
    
    if (statusChanged && getDatabaseClient().isConnected()) {
       await getDatabaseClient().upsertMCPService({
         name: mcp.name,
         status: mcp.status,
         last_checked_at: mcp.lastCheck,
         last_error: mcp.lastError
       }).catch(() => {});
    }
  }

  public async reportError(name: string, error: string) {
    const mcp = this.getOrRegisterMCP(name);
    const errLower = String(error || '').toLowerCase();
    let newStatus: MCPStatusType = 'UNAVAILABLE';

    if (errLower.includes('not configured') || errLower.includes('not specified') || errLower.includes('apikey parameter')) {
       newStatus = 'NOT CONFIGURED';
    } else if (errLower.includes('credits depleted') || errLower.includes('quota') || errLower.includes('exhausted')) {
       newStatus = 'QUOTA_EXCEEDED';
    } else if (errLower.includes('429') || errLower.includes('rate limit') || errLower.includes('too many requests')) {
       newStatus = 'RATE LIMITED';
    } else if (errLower.includes('401') || errLower.includes('403') || errLower.includes('invalid key') || errLower.includes('unauthorized')) {
       newStatus = 'INVALID_KEY';
    } else {
       newStatus = 'PROVIDER_ERROR';
    }

    const statusChanged = mcp.status !== newStatus || mcp.lastError !== error;
    mcp.status = newStatus;
    mcp.lastCheck = new Date().toISOString();
    mcp.lastError = error;

    if (newStatus === 'NOT CONFIGURED' || newStatus === 'QUOTA_EXCEEDED') {
      logger.warn(`MCP ${mcp.name} status: ${newStatus} (${error})`);
    } else {
      logger.error(`MCP ${mcp.name} encountered an error: ${error}`);
    }
    
    if (statusChanged && getDatabaseClient().isConnected()) {
       await getDatabaseClient().upsertMCPService({
         name: mcp.name,
         status: mcp.status,
         last_checked_at: mcp.lastCheck,
         last_error: mcp.lastError
       }).catch(() => {});
    }
  }
}

let _mcpRegistry: MCPRegistry | null = null;
export function getMcpRegistry(): MCPRegistry {
  if (!_mcpRegistry) _mcpRegistry = new MCPRegistry();
  return _mcpRegistry;
}
