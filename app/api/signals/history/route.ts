export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getDatabaseClient } from '@/lib/db/client';
import { getStrategyDefinition } from '@/lib/trading-engine/strategy-registry';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export async function GET() {
  const reqId = crypto.randomUUID();
  try {
    const data: any = await getDatabaseClient().getHistoricalSignals();
    
    if (!Array.isArray(data)) {
      if (data && (data.status === 'not_configured' || data.status === 'error')) {
        const errorResponse: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: data.status === 'not_configured' ? 'DATABASE_NOT_CONFIGURED' : 'HISTORY_FETCH_ERROR',
            message: data.reason || 'Database is not configured or returning an error state.'
          },
          meta: {
            request_id: reqId,
            timestamp: new Date().toISOString()
          }
        };
        return NextResponse.json(errorResponse, { status: 503 });
      }
      throw new Error(data?.reason || 'Failed to fetch trade history');
    }

    // Map DB schema to UI expected format with canonical strategy names and stable IDs
    const formattedData = data.map((item: any, idx: number) => {
      const signalData = item.signals || {};
      const closedAt = new Date(item.closed_at || item.created_at || Date.now());
      
      const rawStrategyId = item.strategy_id || signalData.strategy_id || item.strategyName;
      const stratDef = getStrategyDefinition(rawStrategyId);
      const canonicalStrategyName = stratDef ? stratDef.name : (item.strategy_name || rawStrategyId || 'Strategy');

      return {
        id: item.id || item.signal_key || `hist-${closedAt.getTime()}-${idx}`,
        signalKey: item.signal_key || `key-${idx}`,
        pair: item.symbol || 'XAUUSD',
        direction: (signalData.direction === 'LONG' || signalData.direction === 'buy' || item.direction === 'BUY' || item.direction === 'LONG') ? 'BUY' : 'SELL',
        outcome: item.outcome || 'UNKNOWN', // WIN, LOSS, BREAK_EVEN
        pips: item.pips_result !== undefined ? item.pips_result : (item.pips || 0),
        closedAtTimestamp: closedAt.getTime(),
        closedAt: closedAt.toLocaleString(),
        entry: signalData.entry_price || item.entry || 0,
        sl: signalData.sl_price || item.sl || 0,
        tp1: signalData.tp1_price || item.tp1 || 0,
        strategyName: canonicalStrategyName,
        strategyId: rawStrategyId || 'UNKNOWN',
        status: item.status || item.outcome || 'FINISHED',
        reason: item.reason || ''
      };
    });

    const response: ApiResponse<any> = {
      success: true,
      data: formattedData,
      error: null,
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response);

  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'HISTORY_FETCH_ERROR',
        message: error.message || 'Failed to fetch trade history'
      },
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
