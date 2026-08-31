export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getMarketDataService } from '@/lib/market-data/market-data-service';
import crypto from 'crypto';
import { publicApiError } from '@/lib/utils/api-error';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || 'H1';

  const validTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
  if (!validTimeframes.includes(timeframe)) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: `Invalid timeframe: ${timeframe}. Allowed values: ${validTimeframes.join(', ')}` },
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  let candles: any[] = [];
  let success = false;
  let error = null;

  let providerStatus: any = undefined;

  try {
    const result = await getMarketDataService().getCandles('XAUUSD', timeframe);
    const hasStatusObj = result && typeof result === 'object' && ('status' in result || (result as any).available === false);
    
    if (Array.isArray(result) && !hasStatusObj && result.length > 0) {
      candles = result;
      success = true;
    } else if (result && typeof result === 'object' && (result as any).candles && Array.isArray((result as any).candles) && (result as any).candles.length > 0) {
      candles = (result as any).candles;
      success = true;
    } else {
      const errStatus = (result as any)?.status || 'unavailable';
      const reason = (result as any)?.reason || 'No valid market candles available from configured providers';
      error = {
        code: errStatus === 'not_configured' ? 'PROVIDER_NOT_CONFIGURED' : 'MARKET_DATA_UNAVAILABLE',
        message: reason
      };
      success = false;
    }
  } catch (err: any) {
    error = { code: 'FETCH_ERROR', message: publicApiError(err, 'Failed to fetch candles') };
    candles = [];
    success = false;
  }
  
  const response: ApiResponse<any> = {
    success,
    data: success ? {
      symbol: 'XAUUSD',
      timeframe,
      candles: Array.isArray(candles) ? candles : [],
      ...providerStatus
    } : null,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: success ? 200 : 503 });
}
