import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { getMcpRegistry } from './registry';
import { getDatabaseClient } from '../db/client';
import { PythonEngineManager } from './engines/deployment';

export class MCPManager {
  private isInitialized = false;

  public async revalidate() {
    logger.info('Revalidating MCP Manager...');
    await this.initMarketData();
    await this.initAIOrchestrator();
    await this.initDatabase();
    await this.initTelegram();
    await this.initTwitter();
    await this.initDeployment();
    await this.evaluateInternalEngines();
    await getMcpRegistry().syncToDatabase();
  }

  public async initialize() {
    if (this.isInitialized) return;
    logger.info('Initializing MCP Manager...');

    // 1) Market Data MCPs
    await this.initMarketData();

    // 4) AI Validator
    await this.initAIOrchestrator();

    // 7) Database MCP
    await this.initDatabase();

    // 11) Telegram Bot MCP
    await this.initTelegram();

    // 12) Twitter
    await this.initTwitter();

    // Deployment MCPs
    await this.initDeployment();

    // Evaluate internal engine status based on upstream drivers
    await this.evaluateInternalEngines();

    // Sync to database
    await getMcpRegistry().syncToDatabase();
    
    this.isInitialized = true;
    logger.info('MCP Manager initialized.');
  }

  private async evaluateInternalEngines() {
    const registry = getMcpRegistry();
    const all = registry.getAllStatus();

    const getStatus = (name: string) => all.find(m => m.name === name)?.status || 'NOT CONFIGURED';

    const marketDataOk = getStatus('TwelveData') === 'ONLINE' || getStatus('YahooFinance') === 'ONLINE';
    const geminiOk = getStatus('GeminiAI') === 'ONLINE';
    const geminiStatus = getStatus('GeminiAI');
    const newsOk = getStatus('NewsAPI') === 'ONLINE' || getStatus('ForexFactory') === 'ONLINE';
    const dbOk = getStatus('PostgreSQL DB') === 'ONLINE';

    // SMC Engines
    const smcEngines = [
      'Liquidity Map Engine', 'Imbalance Engine', 'MSS Engine', 
      'SMC Logic Engine', 'Supply & Demand Engine', 'Scalping Trends Engine',
      'Multi-TF Confluence Engine', 'Signal Quality Gate'
    ];
    smcEngines.forEach(eng => {
      if (marketDataOk) {
        registry.reportConnected(eng);
      } else {
        registry.reportNotConfigured(eng, 'Market data source unavailable');
      }
    });

    // AI Validator
    if (geminiOk) {
      registry.reportConnected('AI Validator');
    } else if (geminiStatus === 'NOT CONFIGURED') {
      registry.reportNotConfigured('AI Validator', 'GEMINI_API_KEY is not configured');
    } else {
      registry.reportError('AI Validator', `Upstream GeminiAI status: ${geminiStatus}`);
    }

    // News Engines
    if (newsOk) {
      registry.reportConnected('Financial News Engine');
      registry.reportConnected('Volatility News Engine');
    } else {
      registry.reportNotConfigured('Financial News Engine', 'News providers unavailable');
      registry.reportNotConfigured('Volatility News Engine', 'News providers unavailable');
    }

    // Risk Engines
    const riskEngines = [
      'Daily Risk Engine', 'Consecutive Loss Protection', 
      'Max Drawdown Guardian', 'Anti-Overtrade Shield'
    ];
    riskEngines.forEach(eng => {
      if (dbOk) {
        registry.reportConnected(eng);
      } else {
        registry.reportNotConfigured(eng, 'Running in memory fallback mode (no persistent DB)');
      }
    });

    // Observability & Audit
    registry.reportConnected('Metrics Collector');
    registry.reportConnected('Error Tracker');
    if (dbOk) {
      registry.reportConnected('Audit Log Pipeline');
    } else {
      registry.reportNotConfigured('Audit Log Pipeline', 'DB connection required for persistent logs');
    }
  }

  private async initDeployment() {
    try {
        const result = await PythonEngineManager.evaluate();
        if (result.status === 'active') {
            getMcpRegistry().reportConnected('Python Engine Manager');
        } else if (result.status === 'DISABLED_BY_DESIGN' || result.status === 'NOT CONFIGURED') {
            getMcpRegistry().reportNotConfigured('Python Engine Manager', result.message);
        } else {
            getMcpRegistry().reportOffline('Python Engine Manager', result.message);
        }
    } catch (e: any) {
        getMcpRegistry().reportOffline('Python Engine Manager', e.message);
    }
  }

  private async initMarketData() {
    const fetchWithTimeout = async (url: string, ms: number = 5000, options: any = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    // Check TwelveData
    const twelveKey = getEnv("TWELVEDATA_API_KEY");
    if (twelveKey) {
        try {
            const res = await fetchWithTimeout(`https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=1&apikey=${twelveKey}`);
            const data = await res.json();
            if (data.code && data.status === 'error') {
               getMcpRegistry().reportError('TwelveData', data.message);
            } else {
               getMcpRegistry().reportConnected('TwelveData');
            }
        } catch (e: any) {
            getMcpRegistry().reportError('TwelveData', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('TwelveData', 'Missing API Key');
    }

    // Check Polygon
    const polygonKey = getEnv("POLYGON_API_KEY");
    if (polygonKey) {
        try {
            const res = await fetchWithTimeout(`https://api.polygon.io/v3/reference/tickers?ticker=XAUUSD&apiKey=${polygonKey}`);
            const data = await res.json();
            if (data.status === 'ERROR') {
                getMcpRegistry().reportError('Polygon.io', data.error || 'Provider Error');
            } else {
                getMcpRegistry().reportConnected('Polygon.io');
            }
        } catch (e: any) {
            getMcpRegistry().reportError('Polygon.io', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('Polygon.io', 'Missing API Key');
    }

    // Check NewsAPI
    const newsKey = getEnv("NEWS_API_KEY");
    if (newsKey) {
        try {
            const res = await fetchWithTimeout(`https://newsapi.org/v2/top-headlines?category=business&apiKey=${newsKey}`);
            const data = await res.json();
            if (data.status === 'error') {
                getMcpRegistry().reportError('NewsAPI', data.message);
            } else {
                getMcpRegistry().reportConnected('NewsAPI');
            }
        } catch (e: any) {
            getMcpRegistry().reportError('NewsAPI', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('NewsAPI', 'Missing API Key');
    }

    // ForexFactory
    try {
        const res = await fetchWithTimeout('https://nfs.faireconomy.media/ff_calendar_thisweek.json', 5000, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        if (res.ok) {
            getMcpRegistry().reportConnected('ForexFactory');
        } else {
            getMcpRegistry().reportError('ForexFactory', `HTTP ${res.status}`);
        }
    } catch (e: any) {
        getMcpRegistry().reportError('ForexFactory', e.message);
    }
    
    // YahooFinance
    try {
        const res = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d', 5000, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        if (res.ok) {
            getMcpRegistry().reportConnected('YahooFinance');
        } else {
            getMcpRegistry().reportError('YahooFinance', `HTTP ${res.status}`);
        }
    } catch (e: any) {
        getMcpRegistry().reportError('YahooFinance', e.message);
    }
  }

  private async initDatabase() {
    try {
      const pingResult = await getDatabaseClient().ping();
      if (pingResult.connected) {
        getMcpRegistry().reportConnected('PostgreSQL DB');
      } else {
        getMcpRegistry().reportNotConfigured('PostgreSQL DB', pingResult.error || 'DATABASE_URL not set or connection failed');
      }
    } catch (e: any) {
      getMcpRegistry().reportError('PostgreSQL DB', e.message);
    }
  }

  private async initTelegram() {
    const fetchWithTimeout = async (url: string, ms: number = 5000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    const token = getEnv("TELEGRAM_BOT_TOKEN");
    if (token) {
        try {
            const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`);
            const data = await res.json();
            if (!data.ok) {
                getMcpRegistry().reportError('Telegram Bot', data.description || 'Invalid token');
            } else {
                getMcpRegistry().reportConnected('Telegram Bot');
            }
        } catch(e: any) {
            getMcpRegistry().reportError('Telegram Bot', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('Telegram Bot', 'Missing Telegram Bot Token');
    }
  }

  private async initAIOrchestrator() {
    const fetchWithTimeout = async (url: string, ms: number = 5000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    const geminiKey = getEnv("GEMINI_API_KEY");
    if (geminiKey) {
       try {
           const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
           const data = await res.json();
           if (data.error) {
               getMcpRegistry().reportError('GeminiAI', data.error.message);
           } else {
               getMcpRegistry().reportConnected('GeminiAI');
           }
       } catch (e: any) {
           getMcpRegistry().reportError('GeminiAI', e.message);
       }
    } else {
      getMcpRegistry().reportNotConfigured('GeminiAI', 'Missing GEMINI_API_KEY');
    }
  }

  private async initTwitter() {
    const twitterKey = getEnv("TWITTER_BEARER_TOKEN");
    if (twitterKey) {
       getMcpRegistry().reportConnected('Twitter Bearer');
    } else {
      getMcpRegistry().reportNotConfigured('Twitter Bearer', 'Missing TWITTER_BEARER_TOKEN');
    }
  }
}

let _mcpManager: MCPManager | null = null;
export function getMcpManager(): MCPManager {
  if (!_mcpManager) _mcpManager = new MCPManager();
  return _mcpManager;
}
