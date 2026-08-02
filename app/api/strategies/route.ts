import { NextResponse } from 'next/server';
import { ApiResponse, StrategyResponse } from '@/types';
import { getDatabaseClient } from '@/lib/db/client';
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

    const strategiesRes = await getDatabaseClient().getStrategies().catch(() => null);
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
        getDatabaseClient().getStrategyState(strategy.id).catch(() => null)
    );
    const states = await Promise.all(statePromises);

    for (let i = 0; i < baseStrategies.length; i++) {
        try {
            const st = states[i];
            if (st && typeof st === 'object' && ('status' in st) && (st.status === 'not_configured' || st.status === 'error')) {
              const normalized = normalizeStrategyFromDB(baseStrategies[i], null);
              strategies.push({
                ...normalized,
                status: 'error',
                freshness: 'stale',
                errors: [st.reason || 'Database state unavailable']
              });
            } else {
              const normalized = normalizeStrategyFromDB(baseStrategies[i], st);
              strategies.push(normalized);
            }
        } catch (e: any) {
            strategies.push({
                id: baseStrategies[i].id,
                name: baseStrategies[i].name,
                status: 'error',
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
    error = { code: 'DB_ERROR', message: err.message || 'Failed to fetch strategies' };
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
