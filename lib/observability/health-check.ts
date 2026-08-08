import { getQueueManager } from "../redis/queue";
import { getProviderRegistry } from "../market-data/provider-registry";
import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { getDatabaseClient } from '../db/client';

export type ServiceHealthStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'NOT CONFIGURED' | 'RATE LIMITED' | 'UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'DISABLED' | 'DISABLED_BY_DESIGN' | 'UNREACHABLE' | 'RUNTIME_ERROR' | 'SCAN_IN_PROGRESS';

export interface ServiceHealth {
  serviceName: string;
  status: ServiceHealthStatus;
  lastChecked: string;
  latencyMs?: number;
  message?: string;
}

export interface SystemHealth {
  status: ServiceHealthStatus;
  services: ServiceHealth[];
  timestamp: string;
}

class HealthCheckEngine {
  private services: Record<string, ServiceHealth> = {};

  constructor() {
    this.registerService('Database', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('MarketData', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('EconomicCalendar', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('GeminiAI', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('TelegramBot', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('MarketScanner', 'ONLINE');
    this.registerService('PythonEngine', 'NOT CONFIGURED', 'Checking Python Engine...');
    this.registerService('Redis', 'NOT CONFIGURED', 'Pending validation');
  }

  private registerService(serviceName: string, initialStatus: ServiceHealthStatus, message?: string) {
    this.services[serviceName] = {
      serviceName,
      status: initialStatus,
      lastChecked: new Date().toISOString(),
      message
    };
  }

  public updateServiceHealth(serviceName: string, status: ServiceHealthStatus, latencyMs?: number, message?: string) {
    if (this.services[serviceName]) {
      this.services[serviceName] = {
        ...this.services[serviceName],
        status,
        lastChecked: new Date().toISOString(),
        latencyMs,
        message
      };

      if (status === 'UNAVAILABLE' || status === 'OFFLINE' || status === 'DEGRADED' || status === 'RATE LIMITED') {
         logger.warn(`Service ${serviceName} is ${status}`, {
            service_name: 'HealthCheckEngine',
            target_service: serviceName,
            status,
            reason: message
         });
      }
    }
  }

  public async runHealthChecks(): Promise<SystemHealth> {
    // Perform active checks where possible
    
    // Check Database (PostgreSQL)
    try {
        const pingResult = await getDatabaseClient().ping();
        if (pingResult.connected) {
            this.updateServiceHealth('Database', 'ONLINE', pingResult.latencyMs);
        } else if (pingResult.error === 'Database connection not configured') {
            this.updateServiceHealth('Database', 'NOT CONFIGURED', 0, 'Missing DATABASE_URL');
        } else {
            this.updateServiceHealth('Database', 'UNAVAILABLE', pingResult.latencyMs >= 0 ? pingResult.latencyMs : 0, pingResult.error || 'Connection failed');
        }
    } catch (e: any) {
        this.updateServiceHealth('Database', 'UNAVAILABLE', 0, e.message);
    }
    
    // Check Market Data
    try {
        const start = Date.now();
        const providers = getProviderRegistry().getAllHealth();
        let onlineCount = 0;
        let rateLimited = false;
        let lastError = null;
        let configuredCount = 0;

        providers.filter(p => p.category === 'price').forEach(p => {
            if (p.providerName !== 'yahoo-finance') {
                 configuredCount++;
                 if (p.healthStatus === 'ONLINE') onlineCount++;
                 else if (p.healthStatus === 'RATE LIMITED') rateLimited = true;
                 else if (p.lastError || undefined) lastError = p.lastError;
            }
        });

        if (configuredCount === 0) {
            this.updateServiceHealth('MarketData', 'ONLINE', Date.now() - start, 'Using YahooFinance fallback');
        } else if (onlineCount > 0) {
            this.updateServiceHealth('MarketData', 'ONLINE', Date.now() - start, onlineCount > 1 ? 'Hybrid Active' : 'Online');
        } else if (rateLimited) {
            this.updateServiceHealth('MarketData', 'RATE LIMITED', Date.now() - start, lastError || undefined);
        } else {
            this.updateServiceHealth('MarketData', 'UNAVAILABLE', Date.now() - start, lastError || 'All configured providers failed');
        }
    } catch (e: any) {
        this.updateServiceHealth('MarketData', 'UNAVAILABLE', 0, e.message);
    }

    // Check Economic Calendar
    try {
        const start = Date.now();
        const registryStatus = await import('../mcp/registry').then(m => m.getMcpRegistry().getAllStatus());
        const ffStatus = registryStatus.find(m => m.name === 'ForexFactory');
        if (ffStatus) {
           if (ffStatus.status === 'ONLINE') {
               this.updateServiceHealth('EconomicCalendar', 'ONLINE', Date.now() - start);
           } else if (ffStatus.status === 'RATE LIMITED') {
               this.updateServiceHealth('EconomicCalendar', 'RATE LIMITED', Date.now() - start, ffStatus.lastError || undefined);
           } else {
               this.updateServiceHealth('EconomicCalendar', 'UNAVAILABLE', Date.now() - start, ffStatus.lastError || 'ForexFactory is unavailable');
           }
        } else {
           this.updateServiceHealth('EconomicCalendar', 'NOT CONFIGURED', Date.now() - start, 'ForexFactory not found in registry');
        }
    } catch (e: any) {
        this.updateServiceHealth('EconomicCalendar', 'UNAVAILABLE', 0, e.message);
    }

    // Check Gemini AI
    try {
        const start = Date.now();
        const registryStatus = await import('../mcp/registry').then(m => m.getMcpRegistry().getAllStatus());
        const geminiStatus = registryStatus.find(m => m.name === 'GeminiAI');
        if (geminiStatus) {
            if (geminiStatus.status === 'ONLINE') {
                this.updateServiceHealth('GeminiAI', 'ONLINE', Date.now() - start);
            } else if (geminiStatus.status === 'QUOTA_EXCEEDED') {
                this.updateServiceHealth('GeminiAI', 'QUOTA_EXCEEDED', Date.now() - start, geminiStatus.lastError || 'Quota exceeded');
            } else if (geminiStatus.status === 'RATE LIMITED') {
                this.updateServiceHealth('GeminiAI', 'RATE LIMITED', Date.now() - start, geminiStatus.lastError || 'Rate limited');
            } else if (geminiStatus.status === 'NOT CONFIGURED') {
                this.updateServiceHealth('GeminiAI', 'NOT CONFIGURED', Date.now() - start, geminiStatus.lastError || 'Missing GEMINI_API_KEY');
            } else {
                this.updateServiceHealth('GeminiAI', 'UNAVAILABLE', Date.now() - start, geminiStatus.lastError || 'Gemini AI is unavailable');
            }
        } else {
            this.updateServiceHealth('GeminiAI', 'NOT CONFIGURED', Date.now() - start, 'Gemini AI not found in registry');
        }
    } catch (e: any) {
        this.updateServiceHealth('GeminiAI', 'UNAVAILABLE', 0, e.message);
    }
    
    // Check Telegram
    try {
        const start = Date.now();
        const token = getEnv("TELEGRAM_BOT_TOKEN");
        if (token) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            try {
                const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: controller.signal });
                const data = await res.json();
                if (!data.ok) {
                    if (data.error_code === 429) {
                        this.updateServiceHealth('TelegramBot', 'RATE LIMITED', Date.now() - start, data.description || 'Rate limited');
                    } else {
                        this.updateServiceHealth('TelegramBot', 'UNAVAILABLE', Date.now() - start, data.description || 'Invalid token');
                    }
                } else {
                    this.updateServiceHealth('TelegramBot', 'ONLINE', Date.now() - start);
                }
            } finally {
                clearTimeout(timeout);
            }
        } else {
            this.updateServiceHealth('TelegramBot', 'NOT CONFIGURED', 0, 'Missing Telegram Bot Token');
        }
    } catch (e: any) {
        this.updateServiceHealth('TelegramBot', 'UNAVAILABLE', 0, e.message);
    }

    // Check Python Engine
    try {
        const start = Date.now();
        const externalUrl = getEnv("PYTHON_ENGINE_URL");
        {
            const defaultPyPort = process.env.PYTHON_PORT || '8181';
            const pyUrl = externalUrl || `http://127.0.0.1:${defaultPyPort}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            try {
                const res = await fetch(`${pyUrl}/health`, { signal: controller.signal });
                if (res.ok) {
                    this.updateServiceHealth('PythonEngine', 'ONLINE', Date.now() - start);
                } else {
                    this.updateServiceHealth('PythonEngine', 'OFFLINE', Date.now() - start, `HTTP ${res.status}`);
                }
            } finally {
                clearTimeout(timeout);
            }
        }
    } catch (e: any) {
        this.updateServiceHealth('PythonEngine', 'OFFLINE', 0, e.message.includes('missing') ? 'PYTHON_ENGINE_URL is missing' : 'Python service unreachable');
    }

    // Check Redis
    try {
        const start = Date.now();
        const redisUrl = getEnv("REDIS_URL");
        if (redisUrl) {
            
           const qm = getQueueManager();
           if (qm.isConnected()) {
              await qm.setCache('health_ping', 'ok', 10);
              const val = await qm.getCache('health_ping');
              if (val === 'ok') {
                  this.updateServiceHealth('Redis', 'ONLINE', Date.now() - start);
              } else {
                  this.updateServiceHealth('Redis', 'DEGRADED', Date.now() - start, 'Ping failed');
              }
           } else {
              this.updateServiceHealth('Redis', 'UNAVAILABLE', Date.now() - start, 'Not connected');
           }
        } else {
           this.updateServiceHealth('Redis', 'NOT CONFIGURED', 0, 'REDIS_URL not set');
        }
    } catch (e: any) {
        this.updateServiceHealth('Redis', 'UNAVAILABLE', 0, e.message);
    }

    const servicesList = Object.values(this.services);
    
    // Determine overall status
    let overallStatus: ServiceHealthStatus = 'ONLINE';
    
    const criticalServices = ['Redis', 'Database'];
    const criticalFailures = servicesList.filter(s => criticalServices.includes(s.serviceName) && (s.status === 'OFFLINE' || s.status === 'UNAVAILABLE'));
    
    if (criticalFailures.length > 0) {
        overallStatus = 'UNAVAILABLE';
    } else if (servicesList.some(s => s.status === 'QUOTA_EXCEEDED')) {
        overallStatus = 'QUOTA_EXCEEDED';
    } else if (servicesList.some(s => s.status === 'RATE LIMITED')) {
        overallStatus = 'RATE LIMITED';
    } else if (servicesList.some(s => s.status === 'OFFLINE' || s.status === 'UNAVAILABLE')) {
        overallStatus = 'DEGRADED';
    } else if (servicesList.some(s => s.status === 'DEGRADED')) {
        overallStatus = 'DEGRADED';
    } else if (servicesList.some(s => s.status === 'NOT CONFIGURED')) {
        overallStatus = 'NOT CONFIGURED';
    }

    return {
      status: overallStatus,
      services: servicesList,
      timestamp: new Date().toISOString()
    };
  }
}

export const healthCheckEngine = new HealthCheckEngine();
