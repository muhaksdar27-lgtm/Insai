import { getDatabaseClient } from '@/lib/db/client';
import { getAllStrategies } from '@/lib/trading-engine/strategy-registry';
import { normalizeStrategyFromDB } from '@/lib/trading-engine/strategy-normalize';
import { getMarketScanner } from '@/lib/trading-engine/scanner';

export async function getStrategiesData() {
    const allStrats = getAllStrategies();
    const configStrategies = allStrats.map(s => ({
      id: s.id,
      name: s.name,
      status: 'active',
    }));
    const dbStrategies = await getDatabaseClient().getStrategies().catch(() => null);
    let baseStrategies = configStrategies;
    if (dbStrategies && Array.isArray(dbStrategies)) {
      baseStrategies = [...configStrategies];
      for (const dbStrat of dbStrategies) {
        const index = baseStrategies.findIndex(s => s.id === dbStrat.id);
        if (index >= 0) {
          baseStrategies[index] = { ...baseStrategies[index], status: dbStrat.status || 'active' };
        }
      }
    }
    let statePromises = baseStrategies.map(strategy =>
      getDatabaseClient().getStrategyState(strategy.id).catch(() => null)
    );
    let states = await Promise.all(statePromises);
    
    // If no states exist yet in DB or all are null, trigger an instant scan and reload
    const hasAnyState = states.some(s => s && typeof s === 'object' && s.state_name);
    if (!hasAnyState) {
      try {
        await getMarketScanner().scan(true);
        statePromises = baseStrategies.map(strategy =>
          getDatabaseClient().getStrategyState(strategy.id).catch(() => null)
        );
        states = await Promise.all(statePromises);
      } catch (e) {
        // Fallback gracefully
      }
    }
    
    let normalizedList = [];
    for (let i = 0; i < baseStrategies.length; i++) {
      try {
        const st = states[i];
        if (st && typeof st === 'object' && ('status' in st) && (st.status === 'not_configured' || st.status === 'error')) {
          const normalized = normalizeStrategyFromDB(baseStrategies[i], null);
          normalizedList.push({
            ...normalized,
            status: 'error',
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
    return normalizedList;
}
