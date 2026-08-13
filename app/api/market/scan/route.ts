import { NextResponse } from 'next/server';
import { getMarketScanner } from '@/lib/trading-engine/scanner';
import { getStrategiesData } from '@/lib/services/api-service';

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const scanner = getMarketScanner();
    await scanner.scan();
    const strategies = await getStrategiesData();
    return NextResponse.json({ success: true, message: 'Scan executed successfully', data: strategies });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Scan failed' }, { status: 500 });
  }
}
