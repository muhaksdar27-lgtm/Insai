import { NextResponse } from 'next/server';
import { ApiResponse, MarketSnapshot } from '@/types';
import { getMarketDataService } from '@/lib/market-data/market-data-service';
import crypto from 'crypto';
import { publicApiError } from '@/lib/utils/api-error';

export const dynamic = "force-dynamic";

export async function GET() {
  let data: MarketSnapshot | null = null;
  let success = false;
  let error: { code: string; message: string; } | null = null;

  try {
    data = await getMarketDataService().getLatestPrice('XAUUSD');
    const isExplicitError = data && typeof data === 'object' && (data as any).status === 'error' || (data as any).status === 'not_configured';
    
    if (data && typeof data.price === 'number' && !isNaN(data.price) && data.price > 0 && !isExplicitError) {
      success = true;
    } else {
      const errCode = (data as any)?.status === 'not_configured' ? 'PROVIDER_NOT_CONFIGURED' : 'MARKET_DATA_UNAVAILABLE';
      const reason = (data as any)?.reason || 'No valid real-time market price available from providers.';
      error = {
        code: errCode,
        message: reason
      };
      success = false;
    }
  } catch (err: any) {
    error = {
      code: 'PROVIDER_ERROR',
      message: publicApiError(err, 'Failed to fetch market price')
    };
  }

  const response: ApiResponse<MarketSnapshot | null> = {
    success,
    data: success ? data : null,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response, { status: success ? 200 : 503 });
}
