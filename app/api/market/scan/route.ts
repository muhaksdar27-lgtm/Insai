import { NextResponse } from 'next/server';
import { getMarketScanner } from '@/lib/trading-engine/scanner';
import { getDatabaseClient } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

async function runScan() {
  const scanner = getMarketScanner();
  await scanner.scan(true);
  const activeSignals = await getDatabaseClient().getActiveSignals();
  return activeSignals;
}

export async function POST(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    const signals = await runScan();
    return NextResponse.json({ 
      success: true, 
      message: 'Market scan executed successfully', 
      signals,
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    });
  } catch (error: any) {
    logger.error(`Market Scan POST Error: ${error.message}`, { reqId });
    return NextResponse.json({ 
      success: false, 
      error: { code: 'SCAN_FAILED', message: 'Market scan execution encountered an internal error.' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    const signals = await runScan();
    return NextResponse.json({ 
      success: true, 
      message: 'Market scan executed successfully', 
      signals,
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    });
  } catch (error: any) {
    logger.error(`Market Scan GET Error: ${error.message}`, { reqId });
    return NextResponse.json({ 
      success: false, 
      error: { code: 'SCAN_FAILED', message: 'Market scan execution encountered an internal error.' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    }, { status: 500 });
  }
}

