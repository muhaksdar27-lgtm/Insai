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
    if (mcp && mcp.status === 'ONLINE') return 'configured';
    if (mcp && (mcp.status === 'UNAVAILABLE' || mcp.status === 'OFFLINE' || mcp.status === 'RATE LIMITED')) return 'error';
    if (mcp && mcp.status === 'NOT CONFIGURED') return 'not configured';
    return 'configured';
  };
  
  const getHealthServiceStatus = (envKey: string, healthName: string) => {
    if (!getEnv(envKey)) return 'not configured';
    const srv = health.services.find((s: any) => s.serviceName === healthName);
    if (srv && srv.status === 'ONLINE') return 'configured';
    if (srv && (srv.status === 'UNAVAILABLE' || srv.status === 'OFFLINE' || srv.status === 'RATE LIMITED')) return 'error';
    return 'configured';
  };

  const hasDbConfig = !!(getEnv('DATABASE_URL') || getEnv('POSTGRES_URL') || getEnv('SUPABASE_DB_URL'));

  const response: ApiResponse<any> = {
    success: true,
    data: {
      env: {
        gemini_api_key: getHealthServiceStatus('GEMINI_API_KEY', 'GeminiAI'),
        twelvedata_api_key: getMcpServiceStatus('TWELVEDATA_API_KEY', 'TwelveData'),
        polygon_api_key: getEnv('POLYGON_API_KEY') ? 'configured' : 'not configured',
        news_api_key: getMcpServiceStatus('NEWS_API_KEY', 'NewsAPI'),
        twitter_bearer_token: getMcpServiceStatus('TWITTER_BEARER_TOKEN', 'Twitter Bearer'),
        telegram_bot_token: getHealthServiceStatus('TELEGRAM_BOT_TOKEN', 'TelegramBot'),
        telegram_chat_id: getEnv('TELEGRAM_CHAT_ID') ? 'configured' : 'not configured',
        database_url: hasDbConfig ? 'configured' : 'not configured',
        app_url: getEnv('APP_URL') ? 'configured' : 'not configured',
        redis_url: getEnv('REDIS_URL') ? 'configured' : 'not configured',
        python_engine_url: (() => {
            const pyStatus = health.services.find((s: any) => s.serviceName === 'PythonEngine')?.status;
            if (pyStatus === 'ONLINE') return 'configured';
            if (pyStatus === 'DISABLED') return 'not configured';
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
        TWELVEDATA_API_KEY: getEnv('TWELVEDATA_API_KEY') ? '••••••••' : '',
        NEWS_API_KEY: getEnv('NEWS_API_KEY') ? '••••••••' : '',
        TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN') ? '••••••••' : '',
        GEMINI_API_KEY: getEnv('GEMINI_API_KEY') ? '••••••••' : '',
        DATABASE_URL: hasDbConfig ? '••••••••' : '',
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
