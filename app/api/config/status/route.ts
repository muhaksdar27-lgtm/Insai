import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getEnv, isRailwayProduction } from '@/lib/utils/env';
import { getMcpManager } from '@/lib/mcp/mcp-manager';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { healthCheckEngine } from '@/lib/observability/health-check';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  await getMcpManager().revalidate();
  const health = await healthCheckEngine.runHealthChecks();
  const mcpStatus = getMcpRegistry().getAllStatus();

  // Map health service status with explicit handling of all states
  const mapHealthStatus = (serviceName: string): string => {
    const srv = health.services.find((s: any) => s.serviceName === serviceName);
    if (!srv) return 'unknown';
    
    // Map actual health status to UI representation
    switch (srv.status) {
      case 'ONLINE':
        return 'ok';
      case 'DEGRADED':
        return 'degraded';
      case 'NOT_CONFIGURED':
        return 'not_configured';
      case 'RATE_LIMITED':
        return 'rate_limited';
      case 'QUOTA_EXCEEDED':
        return 'quota_exceeded';
      case 'INVALID_KEY':
        return 'invalid_key';
      case 'OFFLINE':
        return 'offline';
      case 'UNAVAILABLE':
        return 'unavailable';
      default:
        return 'unknown';
    }
  };

  // Get detailed reason for each service
  const getServiceDetails = (serviceName: string): { status: string, message?: string, issue?: string } => {
    const srv = health.services.find((s: any) => s.serviceName === serviceName);
    if (!srv) return { status: 'unknown' };
    
    return {
      status: mapHealthStatus(serviceName),
      message: srv.message,
      issue: srv.status !== 'ONLINE' ? srv.status : undefined
    };
  };

  const response: ApiResponse<any> = {
    success: true,
    data: {
      system_health: {
        overall_status: health.status,
        timestamp: health.timestamp,
        services: health.services.map((s: any) => ({
          name: s.serviceName,
          status: mapHealthStatus(s.serviceName),
          message: s.message,
          latency_ms: s.latencyMs,
          last_checked: s.lastChecked
        }))
      },
      env: {
        environment: isRailwayProduction() ? 'railway_production' : 'local_staging',
        gemini_api_key: getHealthStatus('GEMINI_API_KEY', 'GeminiAI'),
        twelvedata_api_key: getHealthStatus('TWELVEDATA_API_KEY', 'MarketData'),
        polygon_api_key: getHealthStatus('POLYGON_API_KEY', 'MarketData'),
        news_api_key: getHealthStatus('NEWS_API_KEY', 'MarketData'),
        twitter_bearer_token: getHealthStatus('TWITTER_BEARER_TOKEN', 'MarketData'),
        telegram_bot_token: getHealthStatus('TELEGRAM_BOT_TOKEN', 'TelegramBot'),
        telegram_chat_id: getEnv('TELEGRAM_CHAT_ID') ? 'configured' : 'not_configured',
        supabase_url: getHealthStatus('NEXT_PUBLIC_SUPABASE_URL', 'Supabase'),
        supabase_key: getHealthStatus('SUPABASE_SERVICE_ROLE_KEY', 'Supabase'),
        redis_url: getHealthStatus('REDIS_URL', 'Redis'),
        python_engine_url: getHealthStatus('PYTHON_ENGINE_URL', 'PythonEngine')
      },
      detailed_status: {
        gemini: getServiceDetails('GeminiAI'),
        market_data: getServiceDetails('MarketData'),
        supabase: getServiceDetails('Supabase'),
        redis: getServiceDetails('Redis'),
        python_engine: getServiceDetails('PythonEngine'),
        telegram: getServiceDetails('TelegramBot')
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

/**
 * Map environment variable + health status to a simple config state
 */
function getHealthStatus(envKey: string, healthServiceName: string): string {
  const srv = healthCheckEngine.getServiceHealthByName?.(healthServiceName) || { status: 'UNKNOWN' };
  const envExists = getEnv(envKey);

  // If env not set, definitely not configured
  if (!envExists) {
    return 'not_configured';
  }

  // If env is set, check actual service health
  if (!srv || !srv.status) {
    return envExists ? 'configured' : 'not_configured';
  }

  switch (srv.status) {
    case 'ONLINE':
      return 'ok';
    case 'OFFLINE':
      return 'offline';
    case 'UNAVAILABLE':
      return 'unavailable';
    case 'RATE_LIMITED':
      return 'rate_limited';
    case 'QUOTA_EXCEEDED':
      return 'quota_exceeded';
    case 'INVALID_KEY':
      return 'invalid_key';
    case 'DEGRADED':
      return 'degraded';
    case 'NOT_CONFIGURED':
      return 'not_configured';
    default:
      return 'configured';
  }
}

