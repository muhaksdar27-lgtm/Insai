import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getEnv } from '@/lib/utils/env';
import { getMcpManager } from '@/lib/mcp/mcp-manager';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { healthCheckEngine } from '@/lib/observability/health-check';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  await getMcpManager().revalidate();
  const health = await healthCheckEngine.runHealthChecks();
  const mcpStatus = getMcpRegistry().getAllStatus();

  const getMcpServiceStatus = (envKey: string, mcpName: string) => {
    if (!getEnv(envKey)) return 'not configured';
    const mcp = mcpStatus.find(m => m.name === mcpName);
    if (!mcp) return 'error';
    if (mcp.status === 'ONLINE') return 'configured';
    if (mcp.status === 'QUOTA_EXCEEDED') return 'quota_exceeded';
    if (mcp.status === 'RATE LIMITED') return 'rate_limited';
    if (mcp.status === 'NOT CONFIGURED') return 'not configured';
    if (mcp.status === 'INVALID_KEY') return 'error';
    return 'error';
  };
  
  const getHealthServiceStatus = (envKey: string, healthName: string) => {
    if (!getEnv(envKey)) return 'not configured';
    const srv = health.services.find((s: any) => s.serviceName === healthName);
    if (!srv) return 'error';
    if (srv.status === 'ONLINE') return 'configured';
    if (srv.status === 'QUOTA_EXCEEDED') return 'quota_exceeded';
    if (srv.status === 'RATE LIMITED') return 'rate_limited';
    if (srv.status === 'NOT CONFIGURED') return 'not configured';
    return 'error';
  };

  const hasDbConfig = !!(getEnv('DATABASE_URL'));
  const dbHealth = health.services.find((s: any) => s.serviceName === 'Database')?.status;

  const response: ApiResponse<any> = {
    success: true,
    data: {
      env: {
        gemini_api_key: getHealthServiceStatus('GEMINI_API_KEY', 'GeminiAI'),
        twelvedata_api_key: getMcpServiceStatus('TWELVEDATA_API_KEY', 'TwelveData'),
        polygon_api_key: getMcpServiceStatus('POLYGON_API_KEY', 'Polygon.io'),
        news_api_key: getMcpServiceStatus('NEWS_API_KEY', 'NewsAPI'),
        twitter_bearer_token: getMcpServiceStatus('TWITTER_BEARER_TOKEN', 'Twitter Bearer'),
        telegram_bot_token: getHealthServiceStatus('TELEGRAM_BOT_TOKEN', 'TelegramBot'),
        telegram_chat_id: getEnv('TELEGRAM_CHAT_ID') ? 'configured' : 'not configured',
        database_url: !hasDbConfig ? 'not configured' : (dbHealth === 'ONLINE' ? 'configured' : 'error'),
        app_url: getEnv('APP_URL') ? 'configured' : 'not configured',
        redis_url: (() => {
          if (!getEnv('REDIS_URL')) return 'not configured';
          const rStatus = health.services.find((s: any) => s.serviceName === 'Redis')?.status;
          if (rStatus === 'ONLINE') return 'configured';
          if (rStatus === 'DEGRADED') return 'degraded';
          return 'error';
        })(),
        python_engine_url: (() => {
          const pyStatus = health.services.find((s: any) => s.serviceName === 'PythonEngine')?.status;
          if (pyStatus === 'ONLINE') return 'configured';
          if (pyStatus === 'DISABLED' || !getEnv('PYTHON_ENGINE_URL')) return 'not configured';
          return 'error';
        })(),
      },
      values: {
        TELEGRAM_CHAT_ID: getEnv('TELEGRAM_CHAT_ID') || '',
        PYTHON_ENGINE_URL: getEnv('PYTHON_ENGINE_URL') || '',
        REDIS_URL: getEnv('REDIS_URL') || '',
        STANDARD_PIP_BUFFER: getEnv('STANDARD_PIP_BUFFER') || '15',
        MIN_ENGULFING_BODY_RATIO: getEnv('MIN_ENGULFING_BODY_RATIO') || '0.6',
        DOUBLE_PATTERN_TOLERANCE: getEnv('DOUBLE_PATTERN_TOLERANCE') || '20',
        NEWS_NO_TRADE_WINDOW: getEnv('NEWS_NO_TRADE_WINDOW') || '15',
      },
      lastChecked: new Date().toISOString()
    },
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
    error: null
  };

  return NextResponse.json(response);
}
