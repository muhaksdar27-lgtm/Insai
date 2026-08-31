import { NextResponse } from 'next/server';
import { logBuffer } from '@/lib/utils/logger';
import { getDatabaseClient } from '@/lib/db/client';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

// Redact any sensitive tokens, connection strings, or keys from log messages
function sanitizeLogMessage(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/(?:postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, 'postgres://[REDACTED]:[REDACTED]$1')
    .replace(/(?:Bearer\s+|token=|[A-Za-z0-9_-]{20,})(AIza[0-9A-Za-z-_]{35}|ghp_[0-9A-Za-z]{36}|bot[0-9]+:[a-zA-Z0-9_-]+)/gi, '[REDACTED_SECRET]')
    .replace(/(api[_-]?key[:=]\s*["']?)[^"',\s]+/gi, '$1[REDACTED]');
}

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  
  // Security Check: Fail-Closed Guard
  const secretToken = process.env.INTERNAL_API_TOKEN || process.env.ADMIN_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secretToken) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: 'LOGS_ACCESS_RESTRICTED', message: 'Observability endpoint is restricted. Authentication token must be configured.' },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 403 });
    }

    const authHeader = req.headers.get('x-internal-token') || 
                       req.headers.get('x-admin-token') || 
                       req.headers.get('authorization')?.replace('Bearer ', '') || 
                       req.headers.get('x-api-key');
    if (authHeader !== secretToken) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Access denied: Internal system log endpoint is restricted.' },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 403 });
    }
  }

  let dbLogs: any[] = [];
  try {
    const auditLogs = await getDatabaseClient().getAuditLogs(50);
    if (Array.isArray(auditLogs)) {
      dbLogs = auditLogs.map((item: any) => ({
        timestamp: item.created_at || new Date().toISOString(),
        level: 'info',
        message: sanitizeLogMessage(`[Audit] ${item.action || 'system_event'} - ${item.actor || 'system'}`),
        ...(typeof item.payload_json === 'object' && item.payload_json ? item.payload_json : {})
      }));
    }
  } catch {
    // Ignore DB fallback error
  }

  const sanitizedBufferLogs = logBuffer.map((l: any) => ({
    ...l,
    message: sanitizeLogMessage(l.message || '')
  }));

  const combinedLogs = [...sanitizedBufferLogs, ...dbLogs];

  const response: ApiResponse<any> = {
    success: true,
    data: combinedLogs.length > 0 ? combinedLogs : [
      { timestamp: new Date().toISOString(), level: 'info', message: 'System active. Monitoring pipeline online.' }
    ],
    error: null,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };
  return NextResponse.json(response);
}


