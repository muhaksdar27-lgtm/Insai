import { NextResponse } from 'next/server';
import { getMarketScanner } from '@/lib/trading-engine/scanner';
import { getDatabaseClient } from '@/lib/db/client';
import { publicApiError } from '@/lib/utils/api-error';

export const dynamic = "force-dynamic";

async function runScan() {
  const scanner = getMarketScanner();
  await scanner.scan(true);
  const activeSignals = await getDatabaseClient().getActiveSignals();
  return activeSignals;
}

export async function POST() {
  try {
    const signals = await runScan();
    return NextResponse.json({ success: true, message: 'Market scan executed successfully', signals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: publicApiError(error, 'Scan failed') }, { status: 500 });
  }
}

export async function GET() {
  try {
    const signals = await runScan();
    return NextResponse.json({ success: true, message: 'Market scan executed successfully', signals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: publicApiError(error, 'Scan failed') }, { status: 500 });
  }
}

