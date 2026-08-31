import { NextResponse } from 'next/server';
import { ApiResponse, StrategyResponse } from '@/types';
import crypto from 'crypto';
import { getStrategiesData } from '@/lib/services/api-service';
import { publicApiError } from '@/lib/utils/api-error';

export const dynamic = "force-dynamic";

export async function GET() {
  let strategies: StrategyResponse[] = [];
  let success = false;
  let error = null;

  try {
    strategies = await getStrategiesData();
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: publicApiError(err, 'Failed to fetch strategies') };
    success = false;
  }

  const response: ApiResponse<StrategyResponse[]> = {
    success,
    data: success ? strategies : [],
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: success ? 200 : 500 });
}
