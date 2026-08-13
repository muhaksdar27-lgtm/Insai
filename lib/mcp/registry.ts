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

    // 3) Smart Money Concept
    this.registerMCP('Liquidity Map Engine', 'Smart Money Concept', 'memetakan high/low, liquidity pool', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Equal High Low Engine', 'Smart Money Concept', 'deteksi equal high/low', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Breaker Block Engine', 'Smart Money Concept', 'deteksi breaker block', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Mitigation Block Engine', 'Smart Money Concept', 'deteksi mitigation block', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Rejection Block Engine', 'Smart Money Concept', 'deteksi rejection block', 'Internal', 'ONLINE', '', ['Liquidity Map Engine']);
    this.registerMCP('Imbalance Engine', 'Smart Money Concept', 'deteksi imbalance / FVG', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('MSS Engine', 'Smart Money Concept', 'market structure shift', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Internal Structure Engine', 'Smart Money Concept', 'struktur internal pada timeframe kecil', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('External Structure Engine', 'Smart Money Concept', 'struktur eksternal pada HTF', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Range Engine', 'Smart Money Concept', 'mengenali ranging vs trending', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('Killzone Engine', 'Smart Money Concept', 'membaca session kill zone', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Session Bias Engine', 'Smart Money Concept', 'bias berdasarkan session', 'Internal', 'ONLINE', '', ['Killzone Engine', 'External Structure Engine']);
    this.registerMCP('Supply and Demand Engine', 'Smart Money Concept', 'zone supply/demand', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('RSI Engine', 'Smart Money Concept', 'filter momentum tambahan', 'Internal', 'ONLINE', '', ['TwelveData']);
    this.registerMCP('MA Engine', 'Smart Money Concept', 'trend filter tambahan', 'Internal', 'ONLINE', '', ['TwelveData']);

    // 4) AI
    this.registerMCP('GeminiAI', 'AI', 'Google Gemini AI models', 'LLM API', 'NOT CONFIGURED', 'Requires GEMINI_API_KEY', []);
    this.registerMCP('AI Validator', 'AI', 'approve/reject/pending setup', 'LLM API', 'NOT CONFIGURED', 'Requires GEMINI_API_KEY or Python Engine', ['TwelveData', 'NewsAPI']);

    // 5) Signal Quality
    this.registerMCP('Signal Score Engine', 'Signal Quality', 'memberi skor kualitas setup', 'Internal', 'NOT CONFIGURED', '', []);
    this.registerMCP('Probability Engine', 'Signal Quality', 'estimasi probabilitas berbasis evidence', 'Internal', 'NOT CONFIGURED', '', ['Signal Score Engine']);
    this.registerMCP('Confluence Engine', 'Signal Quality', 'menghitung confluence antar rule', 'Internal', 'NOT CONFIGURED', '', []);
    this.registerMCP('Consistency Engine', 'Signal Quality', 'evaluasi kontradiksi rule dan logika', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Entry Quality Engine', 'Signal Quality', 'menilai kualitas entry', 'Internal', 'NOT CONFIGURED', '', ['Liquidity Map Engine', 'Imbalance Engine']);
    this.registerMCP('Exit Quality Engine', 'Signal Quality', 'menilai kualitas exit', 'Internal', 'NOT CONFIGURED', '', ['Liquidity Map Engine']);
    this.registerMCP('RR Optimizer', 'Signal Quality', 'mengecek rasio risiko-imbalan', 'Internal', 'NOT CONFIGURED', '', ['Entry Quality Engine', 'Exit Quality Engine']);
    this.registerMCP('Trade Ranking Engine', 'Signal Quality', 'memberi peringkat setup', 'Internal', 'NOT CONFIGURED', '', ['Signal Score Engine', 'Probability Engine']);
    this.registerMCP('Signal Suppression Engine', 'Signal Quality', 'menahan signal yang lemah', 'Internal', 'NOT CONFIGURED', '', ['Signal Score Engine', 'News Impact Suppression Layer']);
    this.registerMCP('Anti Overtrade Engine', 'Signal Quality', 'membatasi frekuensi trade', 'Internal', 'NOT CONFIGURED', '', ['PostgreSQL DB']);
    this.registerMCP('Profit Consistency Filter', 'Signal Quality', 'memfilter setup yang tidak konsisten', 'Internal', 'NOT CONFIGURED', '', ['Historical Replay Engine']);
    this.registerMCP('Signal Quality Score Engine', 'Signal Quality', 'menilai kualitas signal', 'Internal', 'NOT CONFIGURED', '', ['PostgreSQL DB']);
    this.registerMCP('Quality Gate', 'Signal Quality', 'pemeriksaan akhir sebelum live signal', 'Internal', 'ONLINE', '', ['Consistency Engine']);

    // 6) Risk
    this.registerMCP('Position Sizing Engine', 'Risk', 'ukuran posisi', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Daily Risk Engine', 'Risk', 'batas risiko harian', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Consecutive Loss Protection', 'Risk', 'proteksi loss beruntun', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Capital Preservation Engine', 'Risk', 'menjaga modal', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);
    this.registerMCP('Drawdown Guard', 'Risk', 'proteksi drawdown', 'Internal', 'ONLINE', '', ['PostgreSQL DB']);

    // 7) Database / Memory / Cache
    this.registerMCP('PostgreSQL DB', 'Database / Memory / Cache', 'penyimpanan state, history, config, audit', 'Database API', 'ONLINE', 'Requires DATABASE_URL', []);

    // 8) Observability
    this.registerMCP('Logger', 'Observability', 'log event sistem', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Metrics Engine', 'Observability', 'metrik operasional', 'Internal', 'ONLINE', '', ['Logger']);
    this.registerMCP('Performance Monitor', 'Observability', 'monitor performa', 'Internal', 'ONLINE', '', ['Logger']);
    this.registerMCP('Resource Monitor', 'Observability', 'CPU, memory, storage', 'Internal', 'ONLINE', '', ['Logger']);
    this.registerMCP('Health Check Engine', 'Observability', 'cek kesehatan komponen', 'Internal', 'ONLINE', '', []);
    this.registerMCP('Alert Engine', 'Observability', 'alert operasional', 'Internal', 'ONLINE', '', ['Health Check Engine', 'Telegram Bot']);
    this.registerMCP('Crash Recovery Engine', 'Observability', 'recovery setelah crash', 'Internal', 'NOT CONFIGURED', '', ['Logger']);
    this.registerMCP('AI Monitor', 'Observability', 'status AI service', 'Internal', 'ONLINE', '', ['AI Validator']);
    this.registerMCP('Signal Monitor', 'Observability', 'status signal pipeline', 'Internal', 'ONLINE', '', []);
    this.registerMCP('System Monitor', 'Observability', 'ringkasan sistem', 'Internal', 'ONLINE', '', ['Health Check Engine', 'Metrics Engine']);
    this.registerMCP('Dashboard Engine', 'Observability', 'menyajikan status terintegrasi', 'Internal', 'NOT CONFIGURED', '', ['System Monitor']);
    this.registerMCP('Error Monitor', 'Observability', 'error tracking', 'Internal', 'ONLINE', '', ['Logger']);

    // 9) Deployment
    this.registerMCP('Python Engine Manager', 'Deployment', 'build dan runtime python engine', 'Infrastructure', 'NOT CONFIGURED', '', []);

    // 10) Backtesting & Research
    // (Removed unused modules)

    // 11) Telegram
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
      });
    }
    logger.info('Synced MCP registry to database.');
  }

  public getStatus(name: string): MCPStatus | undefined {
    return this.mcps.get(name);
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
    const mcp = this.mcps.get(name);
    if (mcp) {
      const statusChanged = mcp.status !== 'ONLINE' || mcp.lastError !== null;
      mcp.status = 'ONLINE';
      mcp.lastCheck = new Date().toISOString();
      mcp.lastError = null;
      logger.info(`MCP ${name} is connected (ONLINE).`);
      
      if (statusChanged && getDatabaseClient().isConnected()) {
         await getDatabaseClient().upsertMCPService({
           name: mcp.name,
           status: mcp.status,
           last_checked_at: mcp.lastCheck,
           last_error: mcp.lastError
         }).catch(() => {});
      }
    } else {
      logger.warn(`Trying to report connection for unknown MCP: ${name}`);
    }
  }

  public async reportNotConfigured(name: string, reason: string) {
    const mcp = this.mcps.get(name);
    if (mcp) {
      const statusChanged = mcp.status !== 'NOT CONFIGURED' || mcp.lastError !== reason;
      mcp.status = 'NOT CONFIGURED';
      mcp.lastCheck = new Date().toISOString();
      mcp.lastError = reason;
      logger.warn(`MCP ${name} is NOT CONFIGURED: ${reason}`);
      
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

  public async reportOffline(name: string, reason: string) {
    const mcp = this.mcps.get(name);
    if (mcp) {
      const statusChanged = mcp.status !== 'OFFLINE' || mcp.lastError !== reason;
      mcp.status = 'OFFLINE';
      mcp.lastCheck = new Date().toISOString();
      mcp.lastError = reason;
      logger.warn(`MCP ${name} is OFFLINE: ${reason}`);
      
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

  public async reportError(name: string, error: string) {
    const mcp = this.mcps.get(name);
    if (mcp) {
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
        logger.warn(`MCP ${name} status: ${newStatus} (${error})`);
      } else {
        logger.error(`MCP ${name} encountered an error: ${error}`);
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
}

let _mcpRegistry: MCPRegistry | null = null;
export function getMcpRegistry(): MCPRegistry {
  if (!_mcpRegistry) _mcpRegistry = new MCPRegistry();
  return _mcpRegistry;
}
