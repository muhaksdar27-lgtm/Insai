const fs = require('fs');

const code = `export const dynamic = "force-dynamic";
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
    
    // Import normalizeStrategy from the main route or duplicate the logic?
    // Since we can't easily import normalizeStrategy from an API route (it might cause circular issues or it's not exported), 
    // let's fetch it from the API endpoint locally? No, we can just export it in strategyViewModel.ts!
    
    const { normalizeStrategy } = require('@/lib/strategyViewModel');
    
    // Check if data is an error object
    if (stateData && 'status' in stateData && stateData.status === 'not_configured') {
       data = normalizeStrategy(baseStrat, null);
    } else {
       data = normalizeStrategy(baseStrat, stateData);
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
`;

fs.writeFileSync('/app/applet/app/api/strategies/[id]/state/route.ts', code);
console.log("Updated [id]/state/route.ts");
