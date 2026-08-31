import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { logger } from '@/lib/utils/logger';
import { getDatabaseClient } from '@/lib/db/client';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Allowed tunable runtime parameters with explicit type constraints
const RUNTIME_NUMERIC_SCHEMA: Record<string, { min: number; max: number; integer?: boolean }> = {
  STANDARD_PIP_BUFFER: { min: 0, max: 100 },
  MIN_ENGULFING_BODY_RATIO: { min: 0.1, max: 1.0 },
  DOUBLE_PATTERN_TOLERANCE: { min: 0.001, max: 50 },
  NEWS_NO_TRADE_WINDOW: { min: 0, max: 240, integer: true }
};

export async function POST(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();

  try {
    // 1. Mandatory Admin Authentication Gate
    const adminToken = process.env.ADMIN_TOKEN || process.env.INTERNAL_API_TOKEN;
    const authHeader = req.headers.get('x-admin-token') || req.headers.get('authorization')?.replace('Bearer ', '') || req.headers.get('x-api-key');

    if (process.env.NODE_ENV === 'production' || adminToken) {
      if (!adminToken || authHeader !== adminToken) {
        logger.warn(`Config Save: Unauthorized access attempt rejected (reqId: ${reqId})`);
        return NextResponse.json({
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "Admin authorization required to modify system configuration." },
          meta: { request_id: reqId, timestamp: new Date().toISOString() }
        }, { status: 401 });
      }
    }

    const data = await req.json().catch(() => null);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: "INVALID_INPUT", message: "Invalid payload format. Expected key-value object." },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 400 });
    }

    logger.info(`Config Save: Authenticated request received to update runtime tuning parameters (reqId: ${reqId})`);
    
    const updatedKeys: string[] = [];
    const auditChanges: Record<string, { before: any; after: any }> = {};

    for (const [key, rawValue] of Object.entries(data)) {
      const schema = RUNTIME_NUMERIC_SCHEMA[key];
      if (!schema) {
        // Disallow arbitrary secret mutation or unknown parameters via this endpoint
        continue;
      }

      const numVal = Number(rawValue);
      if (isNaN(numVal) || numVal < schema.min || numVal > schema.max) {
        return NextResponse.json({
          success: false,
          data: null,
          error: { 
            code: "VALIDATION_FAILED", 
            message: `Parameter '${key}' must be a valid number between ${schema.min} and ${schema.max}` 
          },
          meta: { request_id: reqId, timestamp: new Date().toISOString() }
        }, { status: 400 });
      }

      const validatedVal = schema.integer ? Math.round(numVal) : Number(numVal.toFixed(3));
      const previousVal = process.env[key];

      auditChanges[key] = {
        before: previousVal !== undefined ? previousVal : 'DEFAULT',
        after: String(validatedVal)
      };

      // Apply atomically to runtime memory only (zero disk .env mutation)
      process.env[key] = String(validatedVal);
      updatedKeys.push(key);
    }

    if (updatedKeys.length === 0) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: "NO_VALID_KEYS", message: "No authorized runtime parameter keys provided." },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 400 });
    }

    // Record audit trail in database
    try {
      await getDatabaseClient().insertAuditLog({
        action: 'config_update',
        actor: 'ADMIN',
        entity_type: 'runtime_config',
        payload_json: {
          updatedKeys,
          changes: auditChanges,
          reqId
        }
      });
    } catch (auditErr: any) {
      logger.warn(`Config Save: Failed to record audit log (${auditErr.message})`);
    }

    logger.info(`Config Save: Successfully reloaded ${updatedKeys.length} parameter(s) in runtime memory`);

    const response: ApiResponse<{ message: string; updatedKeys: string[]; reloadedAt: string }> = {
      success: true,
      data: {
        message: `Successfully validated and updated ${updatedKeys.length} runtime tuning parameter(s).`,
        updatedKeys,
        reloadedAt: new Date().toISOString()
      },
      error: null,
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    logger.error(`Config Save Internal Error: ${error.message}`, { reqId });
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'CONFIG_UPDATE_FAILED', message: 'Failed to update system runtime configuration.' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
