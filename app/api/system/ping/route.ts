import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getEnv } from '@/lib/utils/env';
import { getDatabaseClient } from '@/lib/db/client';
import { getQueueManager } from '@/lib/redis/queue';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export interface EnginePingResult {
  engineId: 'backend' | 'python' | 'ai' | 'database' | 'queue' | 'redis';
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'ERROR';
  latencyMs: number;
  lastChecked: string;
  message: string;
  details?: Record<string, any>;
}

async function pingBackend(): Promise<EnginePingResult> {
  const start = Date.now();
  try {
    const mem = process.memoryUsage();
    const uptime = Math.floor(process.uptime());
    const latency = Date.now() - start;
    return {
      engineId: 'backend',
      name: 'Backend Engine',
      status: 'ONLINE',
      latencyMs: latency,
      lastChecked: new Date().toISOString(),
      message: `Node.js API Operational — Uptime ${uptime}s, RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
      details: {
        uptimeSeconds: uptime,
        rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
        heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
        nodeVersion: process.version
      }
    };
  } catch (e: any) {
    return {
      engineId: 'backend',
      name: 'Backend Engine',
      status: 'ERROR',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      message: e.message || 'Backend execution failed'
    };
  }
}

async function pingPython(): Promise<EnginePingResult> {
  const start = Date.now();
  const externalUrl = getEnv("PYTHON_ENGINE_URL");
  const defaultPyPort = process.env.PYTHON_PORT || '8181';
  const pyUrl = externalUrl || `http://127.0.0.1:${defaultPyPort}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${pyUrl}/health`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        engineId: 'python',
        name: 'Python Engine',
        status: 'ONLINE',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
        message: `HTTP ${res.status} OK — Python TA-Lib Service active at ${pyUrl}`,
        details: { url: pyUrl, statusCode: res.status, ...data }
      };
    } else {
      return {
        engineId: 'python',
        name: 'Python Engine',
        status: 'ERROR',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
        message: `HTTP ${res.status} ${res.statusText} from ${pyUrl}`,
        details: { url: pyUrl, statusCode: res.status }
      };
    }
  } catch (e: any) {
    const isConnRefused = e.message?.includes('ECONNREFUSED') || e.name === 'AbortError' || e.message?.includes('fetch failed');
    return {
      engineId: 'python',
      name: 'Python Engine',
      status: isConnRefused ? 'OFFLINE' : 'ERROR',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      message: isConnRefused
        ? `Python service unreachable at ${pyUrl} (Process offline or port closed)`
        : `Python engine error: ${e.message}`,
      details: { url: pyUrl, error: e.message }
    };
  }
}

async function pingAI(): Promise<EnginePingResult> {
  const start = Date.now();
  const geminiKey = getEnv("GEMINI_API_KEY");

  if (!geminiKey) {
    return {
      engineId: 'ai',
      name: 'AI Engine',
      status: 'OFFLINE',
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      message: 'GEMINI_API_KEY environment variable is missing',
      details: { configured: false }
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    const data = await res.json().catch(() => ({}));

    if (res.ok && !data.error) {
      const modelCount = Array.isArray(data.models) ? data.models.length : 0;
      return {
        engineId: 'ai',
        name: 'AI Engine',
        status: 'ONLINE',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
        message: `Gemini API authenticated — ${modelCount} models available`,
        details: { modelCount, endpoint: 'generativelanguage.googleapis.com' }
      };
    } else {
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      const isQuota = res.status === 429 || errMsg.includes('quota') || data.error?.status === 'RESOURCE_EXHAUSTED';
      return {
        engineId: 'ai',
        name: 'AI Engine',
        status: isQuota ? 'DEGRADED' : 'ERROR',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
        message: isQuota ? `Quota rate limited: ${errMsg}` : `Gemini API error: ${errMsg}`,
        details: { statusCode: res.status, error: data.error }
      };
    }
  } catch (e: any) {
    return {
      engineId: 'ai',
      name: 'AI Engine',
      status: 'OFFLINE',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      message: `Gemini API unreachable: ${e.message}`,
      details: { error: e.message }
    };
  }
}

async function pingDatabase(): Promise<EnginePingResult> {
  const start = Date.now();
  try {
    const dbClient = getDatabaseClient();
    const pingResult = await dbClient.ping();

    if (pingResult.connected) {
      return {
        engineId: 'database',
        name: 'Database Engine',
        status: 'ONLINE',
        latencyMs: pingResult.latencyMs,
        lastChecked: new Date().toISOString(),
        message: 'Native PostgreSQL database connection verified',
        details: { connected: true, provider: 'PostgreSQL' }
      };
    } else {
      const hasConfig = !!(getEnv("DATABASE_URL") || getEnv("POSTGRES_URL") || getEnv("SUPABASE_DB_URL"));
      return {
        engineId: 'database',
        name: 'Database Engine',
        status: hasConfig ? 'ERROR' : 'OFFLINE',
        latencyMs: pingResult.latencyMs >= 0 ? pingResult.latencyMs : Date.now() - start,
        lastChecked: new Date().toISOString(),
        message: hasConfig
          ? `Database configured but pool connection failed (${pingResult.error || 'Connection inactive'})`
          : 'Database not configured (DATABASE_URL missing)',
        details: { configured: hasConfig, connected: false, error: pingResult.error }
      };
    }
  } catch (e: any) {
    return {
      engineId: 'database',
      name: 'Database Engine',
      status: 'ERROR',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      message: `Database connection error: ${e.message}`
    };
  }
}

async function pingQueue(): Promise<EnginePingResult> {
  const start = Date.now();
  try {
    const qm = getQueueManager();
    const isConn = qm.isConnected();
    const latency = Date.now() - start;

    if (isConn) {
      return {
        engineId: 'queue',
        name: 'Queue Engine',
        status: 'ONLINE',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
        message: 'Distributed Redis queue manager operational',
        details: { mode: 'Redis Pub/Sub & Streams', connected: true }
      };
    } else {
      const redisUrl = getEnv("REDIS_URL");
      if (!redisUrl) {
        return {
          engineId: 'queue',
          name: 'Queue Engine',
          status: 'DEGRADED',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
          message: 'Running in local memory event emitter queue mode (REDIS_URL missing)',
          details: { mode: 'Local EventEmitter Fallback', connected: false }
        };
      } else {
        return {
          engineId: 'queue',
          name: 'Queue Engine',
          status: 'ERROR',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
          message: 'REDIS_URL configured but queue connection failed',
          details: { mode: 'Redis', connected: false }
        };
      }
    }
  } catch (e: any) {
    return {
      engineId: 'queue',
      name: 'Queue Engine',
      status: 'ERROR',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      message: `Queue check failed: ${e.message}`
    };
  }
}

async function pingRedis(): Promise<EnginePingResult> {
  const start = Date.now();
  const redisUrl = getEnv("REDIS_URL");

  if (!redisUrl) {
    return {
      engineId: 'redis',
      name: 'Redis Engine',
      status: 'OFFLINE',
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      message: 'REDIS_URL environment variable is missing',
      details: { configured: false }
    };
  }

  try {
    const qm = getQueueManager();
    if (qm.isConnected()) {
      const pingKey = `health_ping_${Date.now()}`;
      await qm.setCache(pingKey, 'pong', 5);
      const val = await qm.getCache(pingKey);
      const latency = Date.now() - start;

      if (val === 'pong') {
        return {
          engineId: 'redis',
          name: 'Redis Engine',
          status: 'ONLINE',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
          message: 'Redis PONG verified — Cache write & read cycle completed',
          details: { configured: true, pingResult: 'pong', latencyMs: latency }
        };
      } else {
        return {
          engineId: 'redis',
          name: 'Redis Engine',
          status: 'DEGRADED',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
          message: 'Redis write succeeded but cache read back returned unexpected value',
          details: { configured: true, pingResult: val }
        };
      }
    } else {
      return {
        engineId: 'redis',
        name: 'Redis Engine',
        status: 'ERROR',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        message: 'REDIS_URL provided but Redis client is disconnected or circuit open',
        details: { configured: true, connected: false }
      };
    }
  } catch (e: any) {
    return {
      engineId: 'redis',
      name: 'Redis Engine',
      status: 'ERROR',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      message: `Redis test failed: ${e.message}`
    };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('target') || 'all';

  let results: EnginePingResult[] = [];

  if (target === 'backend') {
    results = [await pingBackend()];
  } else if (target === 'python') {
    results = [await pingPython()];
  } else if (target === 'ai') {
    results = [await pingAI()];
  } else if (target === 'database') {
    results = [await pingDatabase()];
  } else if (target === 'queue') {
    results = [await pingQueue()];
  } else if (target === 'redis') {
    results = [await pingRedis()];
  } else {
    results = await Promise.all([
      pingBackend(),
      pingPython(),
      pingAI(),
      pingDatabase(),
      pingQueue(),
      pingRedis()
    ]);
  }

  const response: ApiResponse<EnginePingResult[]> = {
    success: true,
    data: results,
    error: null,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
