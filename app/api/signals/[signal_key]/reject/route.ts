export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getDatabaseClient } from '@/lib/db/client';
import crypto from 'crypto';
import { publicApiError } from '@/lib/utils/api-error';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ signal_key: string }> }
) {
  const { signal_key } = await params;
  const reqId = crypto.randomUUID();

  let success = false;
  let error = null;

  try {
    await getDatabaseClient().updateSignalState(signal_key, 'REJECTED');
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: publicApiError(err, 'Unable to reject signal') };
  }

  const response: ApiResponse<any> = {
    success,
    data: success ? {
      schema_version: '1.0',
      correlation_id: crypto.randomUUID(),
      signal_key,
      status: 'REJECTED',
      action: 'reject',
      source_timestamp: new Date().toISOString()
    } : null,
    error,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: success ? 200 : 500 });
}

