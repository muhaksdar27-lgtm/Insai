import { NextResponse } from 'next/server';
import { logBuffer } from '@/lib/utils/logger';
import { getDatabaseClient } from '@/lib/db/client';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  
  // Security Check: Guard endpoint in production ONLY if internal secret is explicitly configured
  const secretToken = process.env.INTERNAL_API_TOKEN || process.env.ADMIN_TOKEN;
  if (secretToken && process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.get('x-internal-token') || req.headers.get('x-api-key');
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
        message: `[Audit] ${item.action || 'system_event'} - ${item.actor || 'system'}`,
        ...item.payload_json
      }));
    }
  } catch {
    // Ignore DB fallback error
  }

  const combinedLogs = [...logBuffer, ...dbLogs];

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


