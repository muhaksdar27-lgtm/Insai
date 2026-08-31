export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getDatabaseClient } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

const ALLOWED_OUTCOMES = new Set(['WIN', 'LOSS', 'BE', 'BREAK_EVEN', 'CANCELLED']);
const ALLOWED_STATUSES = new Set(['FINISHED', 'CLOSED', 'TAKE_PROFIT', 'STOP_LOSS', 'CANCELLED', 'EXPIRED']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ signal_key: string }> }
) {
  const { signal_key } = await params;
  const reqId = request.headers.get('x-request-id') || crypto.randomUUID();

  // 1. Authorization check for signal state manipulation
  const adminToken = process.env.ADMIN_TOKEN || process.env.INTERNAL_API_TOKEN;
  const authHeader = request.headers.get('x-admin-token') || 
                     request.headers.get('x-internal-token') || 
                     request.headers.get('authorization')?.replace('Bearer ', '') || 
                     request.headers.get('x-api-key');

  if (process.env.NODE_ENV === 'production' && adminToken) {
    if (authHeader !== adminToken) {
      logger.warn(`Signal Close: Unauthorized attempt to close signal ${signal_key} (reqId: ${reqId})`);
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authorization required to close or archive signals.' },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 401 });
    }
  }

  if (!signal_key || typeof signal_key !== 'string' || signal_key.length < 3) {
    return NextResponse.json({
      success: false,
      data: null,
      error: { code: 'INVALID_SIGNAL_KEY', message: 'Valid signal_key identifier is required.' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    
    // Outcome validation
    const rawOutcome = String(body.outcome || 'WIN').toUpperCase();
    const outcome = ALLOWED_OUTCOMES.has(rawOutcome) ? rawOutcome : 'WIN';

    // Status validation
    const rawStatus = String(body.status || 'FINISHED').toUpperCase();
    const finalState = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : 'FINISHED';

    // Pips validation & bounded range check (-500 to +2000)
    let pipsResult = 0;
    if (typeof body.pips === 'number' && !isNaN(body.pips)) {
      pipsResult = Math.max(-500, Math.min(2000, Number(body.pips.toFixed(1))));
    } else {
      pipsResult = outcome === 'WIN' ? 35 : (outcome === 'LOSS' ? -15 : 0);
    }

    const historyRecord = await getDatabaseClient().archiveToHistory(
      signal_key,
      finalState,
      pipsResult,
      outcome,
      reqId
    );

    if (!historyRecord) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: 'SIGNAL_NOT_FOUND', message: `Signal '${signal_key}' not found or could not be archived.` },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: {
        signal_key,
        status: finalState,
        outcome,
        pips: pipsResult,
        archived_at: new Date().toISOString()
      },
      error: null,
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    logger.error(`Signal Close Handler Error: ${err.message}`, { signal_key, reqId });
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'SIGNAL_CLOSE_FAILED', message: 'Internal server error while archiving signal.' },
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
