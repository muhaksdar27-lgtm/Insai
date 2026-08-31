import { getDatabaseClient } from '@/lib/db/client';
import { getAllStrategies } from '@/lib/trading-engine/strategy-registry';
import { normalizeStrategyFromDB } from '@/lib/trading-engine/strategy-normalize';

export async function getStrategiesData() {
    const allStrats = getAllStrategies();
    const configStrategies = allStrats.map(s => ({
      id: s.id,
      name: s.name,
      status: 'UNKNOWN',
    }));

    const isConnected = getDatabaseClient().isConnected();
    if (!isConnected) {
      return configStrategies.map(s => normalizeStrategyFromDB(
        { ...s, status: 'DATABASE_UNAVAILABLE' },
        null
      ));
    }

    const dbStrategies = await getDatabaseClient().getStrategies().catch(() => null);
    let baseStrategies = configStrategies;
    if (dbStrategies && Array.isArray(dbStrategies)) {
      baseStrategies = [...configStrategies];
      for (const dbStrat of dbStrategies) {
        const index = baseStrategies.findIndex(s => s.id === dbStrat.id);
        if (index >= 0) {
          baseStrategies[index] = { ...baseStrategies[index], status: dbStrat.status || 'UNKNOWN' };
        }
      }
    }
    const statePromises = baseStrategies.map(strategy =>
      getDatabaseClient().getStrategyState(strategy.id).catch(() => null)
    );
    const states = await Promise.all(statePromises);
    
    // Scanner is background worker responsibility. GET request must never trigger scanner.
    
    const normalizedList = [];
    for (let i = 0; i < baseStrategies.length; i++) {
      try {
        const st = states[i];
        if (st && typeof st === 'object' && ('status' in st) && (st.status === 'not_configured' || st.status === 'error')) {
          const normalized = normalizeStrategyFromDB({ ...baseStrategies[i], status: 'DATABASE_UNAVAILABLE' }, null);
          normalizedList.push({
            ...normalized,
            status: 'DATABASE_UNAVAILABLE',
            freshness: 'stale',
            errors: [st.reason || 'Database state unavailable']
          });
        } else {
          const normalized = normalizeStrategyFromDB(baseStrategies[i], st);
          normalizedList.push(normalized);
        }
      } catch (e: any) {
        normalizedList.push({
          id: baseStrategies[i].id,
          name: baseStrategies[i].name,
          status: 'ERROR',
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
    return normalizedList;
}
