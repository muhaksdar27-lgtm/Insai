import { NextResponse } from 'next/server';
import { errorTracker } from '@/lib/observability/error-tracker';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    const rawErrors = errorTracker.getRecentErrors();
    const isProd = process.env.NODE_ENV === 'production';
    
    // Sanitize error stack traces and internal paths in production
    const recentErrors = rawErrors.map((err: any) => ({
      ...err,
      stack: isProd ? undefined : err.stack,
      message: err.message ? err.message.replace(/\/[\w.-]+\/[\w.-]+/g, '[REDACTED_PATH]') : err.message
    }));

    const count24h = errorTracker.getErrorCountInLast24h();
    const response: ApiResponse<any> = {
      success: true,
      data: {
        recentErrors,
        count24h
      },
      error: null,
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response);
  } catch (error) {
    const isProd = process.env.NODE_ENV === 'production';
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { 
        code: 'ERRORS_API_ERROR', 
        message: isProd ? 'Internal System Error Monitoring' : (error instanceof Error ? error.message : 'Unknown error') 
      },
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
