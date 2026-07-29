import { NextResponse } from 'next/server';
import { ApiResponse, StrategyResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { normalizeStrategyFromDB } from '@/lib/trading-engine/strategy-normalize';
import { getAllStrategies } from '@/lib/trading-engine/strategy-registry';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  let strategies: StrategyResponse[] = [];
  let success = false;
  let error = null;

  try {
    const allStrats = getAllStrategies();
    const configStrategies = allStrats.map(s => ({
      id: s.id,
      name: s.name,
      status: 'active',
    }));

    const strategiesRes = await getSupabaseClient().getStrategies().catch(() => null);
    let baseStrategies = configStrategies;
    if (strategiesRes && Array.isArray(strategiesRes)) {
       baseStrategies = [...configStrategies];
       for (const dbStrat of strategiesRes) {
         const index = baseStrategies.findIndex(s => s.id === dbStrat.id);
         if (index >= 0) {
           baseStrategies[index] = { ...baseStrategies[index], status: dbStrat.status || 'active' };
         }
       }
    }

    // Attach their latest states from the state machine DB table
    const statePromises = baseStrategies.map(strategy =>
        getSupabaseClient().getStrategyState(strategy.id).catch(() => null)
    );
    const states = await Promise.all(statePromises);

    for (let i = 0; i < baseStrategies.length; i++) {
        try {
            const normalized = normalizeStrategyFromDB(baseStrategies[i], states[i]);
            strategies.push(normalized);
        } catch (e: any) {
            strategies.push({
                id: baseStrategies[i].id,
                name: baseStrategies[i].name,
                status: baseStrategies[i].status,
                progress: 0,
                currentStep: 'Error',
                steps: [],
                setupSnapshot: {},
                ruleResults: {},
                signal: null,
                freshness: 'stale',
                updatedAt: new Date().toISOString(),
                errors: [e.message]
            });
        }
    }
    
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
  }

  const response: ApiResponse<StrategyResponse[]> = {
    success: true,
    data: strategies,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: 200 });
}

