export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getDatabaseClient } from '@/lib/db/client';
import crypto from 'crypto';
import { publicApiError } from '@/lib/utils/api-error';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ signal_key: string }> }
) {
  const { signal_key } = await params;
  const reqId = crypto.randomUUID();

  let success = false;
  let error = null;

  try {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, data: null, error: { code: 'INVALID_INPUT', message: 'Invalid close payload' }, meta: { request_id: reqId, timestamp: new Date().toISOString() } }, { status: 400 });
    }
    const outcome = body.outcome || 'WIN';
    const allowedOutcomes = new Set(['WIN', 'LOSS', 'BREAKEVEN']);
    if (!allowedOutcomes.has(outcome)) {
      return NextResponse.json({ success: false, data: null, error: { code: 'INVALID_OUTCOME', message: 'Unsupported signal outcome' }, meta: { request_id: reqId, timestamp: new Date().toISOString() } }, { status: 400 });
    }
    const pipsResult = body.pips === undefined ? (outcome === 'WIN' ? 35 : (outcome === 'LOSS' ? -15 : 0)) : Number(body.pips);
    if (!Number.isFinite(pipsResult) || Math.abs(pipsResult) > 100000) {
      return NextResponse.json({ success: false, data: null, error: { code: 'INVALID_PIPS', message: 'Pips must be a finite number within the supported range' }, meta: { request_id: reqId, timestamp: new Date().toISOString() } }, { status: 400 });
    }
    const finalState = body.status || 'FINISHED';
    if (!['FINISHED', 'CLOSED'].includes(finalState)) {
      return NextResponse.json({ success: false, data: null, error: { code: 'INVALID_STATUS', message: 'Unsupported final signal status' }, meta: { request_id: reqId, timestamp: new Date().toISOString() } }, { status: 400 });
    }

    const historyRecord = await getDatabaseClient().archiveToHistory(
      signal_key,
      finalState,
      pipsResult,
      outcome
    );

    success = !!historyRecord;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: publicApiError(err, 'Unable to close signal') };
  }

  const response: ApiResponse<any> = {
    success,
    data: success ? {
      signal_key,
      status: 'ARCHIVED_TO_HISTORY',
      timestamp: new Date().toISOString()
    } : null,
    error,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: success ? 200 : 500 });
}
