import { NextResponse } from 'next/server';
import { logBuffer } from '@/lib/utils/logger';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  
  // Security Check: Guard endpoint in production unless internal secret matches
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.get('x-internal-token') || req.headers.get('x-api-key');
    const secretToken = process.env.INTERNAL_API_TOKEN || process.env.ADMIN_TOKEN;
    if (!secretToken || authHeader !== secretToken) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Access denied: Internal system log endpoint is restricted in production.' },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 403 });
    }
  }

  const response: ApiResponse<any> = {
    success: true,
    data: logBuffer,
    error: null,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };
  return NextResponse.json(response);
}
