export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import crypto from 'crypto';
import { getStrategyDefinition } from '@/lib/trading-engine/strategy-registry';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let success = false;
  let error = null;
  let data = null;

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

    const stateData = await getSupabaseClient().getStrategyState(id);
    
    const { normalizeStrategyFromDB } = require('@/lib/trading-engine/strategy-normalize');
    
    // Check if data is an error object
    if (stateData && 'status' in stateData && stateData.status === 'not_configured') {
       data = normalizeStrategyFromDB(baseStrat, null);
    } else {
       data = normalizeStrategyFromDB(baseStrat, stateData);
    }
    
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
  }
  
  const response: ApiResponse<any> = {
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
