export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getDatabaseClient } from '@/lib/db/client';
import crypto from 'crypto';

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
    const outcome = body.outcome || 'WIN';
    const pipsResult = typeof body.pips === 'number' ? body.pips : (outcome === 'WIN' ? 35 : (outcome === 'LOSS' ? -15 : 0));
    const finalState = body.status || 'FINISHED';

    const historyRecord = await getDatabaseClient().archiveToHistory(
      signal_key,
      finalState,
      pipsResult,
      outcome
    );

    success = !!historyRecord;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
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
