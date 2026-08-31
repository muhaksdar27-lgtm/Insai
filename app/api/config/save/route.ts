import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set([
  'STANDARD_PIP_BUFFER',
  'MIN_ENGULFING_BODY_RATIO',
  'DOUBLE_PATTERN_TOLERANCE',
  'NEWS_NO_TRADE_WINDOW'
]);

export async function POST(req: Request) {
  const reqId = crypto.randomUUID();

  try {
    const data = await req.json();
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: "INVALID_INPUT", message: "Invalid payload format. Expected key-value object." },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 400 });
    }

    logger.info('Config Save: Received request to update configuration');
    
    const updatedKeys: string[] = [];
    const invalidKeys: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (!ALLOWED_KEYS.has(key)) {
        invalidKeys.push(key);
        continue;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        invalidKeys.push(key);
        continue;
      }

      const strVal = String(value).trim();
      if (!strVal || strVal.length > 32 || /[\n\r\0]/.test(strVal)) {
        invalidKeys.push(key);
        continue;
      }
      
      // Perform validation based on key type
      if (key === 'STANDARD_PIP_BUFFER' || key === 'DOUBLE_PATTERN_TOLERANCE' || key === 'NEWS_NO_TRADE_WINDOW') {
        const num = Number(strVal);
        if (!Number.isFinite(num) || num < 0 || num > 500) {
          return NextResponse.json({
            success: false,
            data: null,
            error: { code: "VALIDATION_FAILED", message: `Value for ${key} must be a number between 0 and 500` },
            meta: { request_id: reqId, timestamp: new Date().toISOString() }
          }, { status: 400 });
        }
      }

      if (key === 'MIN_ENGULFING_BODY_RATIO') {
        const num = Number(strVal);
        if (!Number.isFinite(num) || num <= 0 || num > 1) {
          return NextResponse.json({
            success: false,
            data: null,
            error: { code: "VALIDATION_FAILED", message: `Value for ${key} must be a decimal between 0.1 and 1.0` },
            meta: { request_id: reqId, timestamp: new Date().toISOString() }
          }, { status: 400 });
        }
      }

      process.env[key] = strVal;
      logger.info(`Config Applied: Updated ${key} in runtime memory`);
      updatedKeys.push(key);
    }

    if (updatedKeys.length === 0) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: "NO_VALID_KEYS", message: invalidKeys.length > 0 ? `Disallowed or invalid keys: ${invalidKeys.join(', ')}` : "No valid configuration keys provided." },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 400 });
    }

    // Runtime-only configuration. Secrets and deployment configuration must be managed
    // outside the application process via the platform secret manager.
    const persistedToDisk = false;

    const response: ApiResponse<{ message: string; updatedKeys: string[]; persistedToDisk: boolean }> = {
      success: true,
      data: {
        message: `Successfully updated ${updatedKeys.length} configuration key(s) in runtime memory only.`,
        updatedKeys,
        persistedToDisk
      },
      error: null,
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'SAVE_ERROR', message: 'Failed to save configuration' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
