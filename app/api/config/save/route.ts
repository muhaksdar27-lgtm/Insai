import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set([
  'TWELVEDATA_API_KEY',
  'NEWS_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PYTHON_ENGINE_URL',
  'REDIS_URL',
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
      
      // Perform validation based on key type
      if (key === 'STANDARD_PIP_BUFFER' || key === 'DOUBLE_PATTERN_TOLERANCE' || key === 'NEWS_NO_TRADE_WINDOW') {
        const num = Number(strVal);
        if (isNaN(num) || num < 0 || num > 500) {
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
        if (isNaN(num) || num <= 0 || num > 1) {
          return NextResponse.json({
            success: false,
            data: null,
            error: { code: "VALIDATION_FAILED", message: `Value for ${key} must be a decimal between 0.1 and 1.0` },
            meta: { request_id: reqId, timestamp: new Date().toISOString() }
          }, { status: 400 });
        }
      }

      const sanitizedValue = strVal.replace(/[\n\r]/g, '');
      process.env[key] = sanitizedValue; 
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

    // Try persisting to .env file if available
    let persistedToDisk = false;
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      let envLines = envContent.split('\n');

      for (const key of updatedKeys) {
        const val = process.env[key] || '';
        let found = false;
        envLines = envLines.map(line => {
          if (line.trim().startsWith(`${key}=`)) {
            found = true;
            return `${key}=${val}`;
          }
          return line;
        });
        if (!found) {
          envLines.push(`${key}=${val}`);
        }
      }

      fs.writeFileSync(envPath, envLines.join('\n'), 'utf8');
      persistedToDisk = true;
      logger.info('Config Persisted: Successfully written updated keys to .env');
    } catch (fsErr: any) {
      logger.warn(`Config Disk Persistence Note: Could not write to .env file directly (${fsErr.message}). Runtime memory updated.`);
    }

    const response: ApiResponse<{ message: string; updatedKeys: string[]; persistedToDisk: boolean }> = {
      success: true,
      data: {
        message: persistedToDisk
          ? `Successfully updated ${updatedKeys.length} configuration key(s) in runtime memory and .env file.`
          : `Successfully updated ${updatedKeys.length} configuration key(s) in runtime memory (filesystem is read-only).`,
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
      error: { code: 'SAVE_ERROR', message: error.message || 'Failed to save configuration' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

