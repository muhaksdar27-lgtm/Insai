export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse, StrategyResponse } from '@/types';
import { getDatabaseClient } from '@/lib/db/client';
import crypto from 'crypto';
import { getStrategyDefinition } from '@/lib/trading-engine/strategy-registry';
import { normalizeStrategyFromDB } from '@/lib/trading-engine/strategy-normalize';
import { logger } from '@/lib/utils/logger';
import { publicApiError } from '@/lib/utils/api-error';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let success = false;
  let error = null;
  let data: StrategyResponse | null = null;

  try {
    const stratDef = getStrategyDefinition(id);
    if (!stratDef) {
       return NextResponse.json({
         success: false,
         error: { code: 'NOT_FOUND', message: 'Strategy not found' }
       }, { status: 404 });
    }

    const baseStrat = {
       id: stratDef.id,
       name: stratDef.name,
       status: 'active'
    };

    let stateData = null;
    try {
      stateData = await getDatabaseClient().getStrategyState(id);
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      logger.warn(`Database fetch failed for ${id}, using fallback: ${msg}`);
    }
    
    // Check if data is an error or not configured
    if (stateData && typeof stateData === 'object' && ('status' in stateData) && (stateData.status === 'not_configured' || stateData.status === 'error')) {
       const normalized = normalizeStrategyFromDB(baseStrat, null);
       data = {
         ...normalized,
         status: 'error',
         freshness: 'stale',
         errors: [(stateData as any).reason || 'Database state unavailable']
       };
    } else {
       data = normalizeStrategyFromDB(baseStrat, stateData);
    }
    
    success = true;
  } catch (err: unknown) {
    error = { code: 'DB_ERROR', message: publicApiError(err, 'Unable to load strategy state') };
  }
  
  const response: ApiResponse<StrategyResponse> = {
    success,
    data,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: success ? 200 : 500 });
}
