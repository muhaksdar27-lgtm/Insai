const fs = require('fs');
let code = fs.readFileSync('app/api/config/save/route.ts', 'utf8');

// Remove fs write and envFile logic entirely, just update memory and return
const newCode = `import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

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
  'REDIS_URL'
]);

export async function POST(req: Request) {
  const reqId = crypto.randomUUID();
  
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Config modification forbidden in production' } }, { status: 403 });
  }

  try {
    const data = await req.json();
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "Invalid payload format" } }, { status: 400 });
    }

    logger.info('Config Save: Received request to update configuration');
    
    let keysUpdated = 0;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && ALLOWED_KEYS.has(key)) {
        const sanitizedValue = value.replace(/[\\n\\r]/g, '');
        process.env[key] = sanitizedValue; 
        logger.info(\`Config Validation: Validated and applied update in memory for key: \${key}\`);
        keysUpdated++;
      }
    }

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Configuration updated in memory. Please update your environment variables to persist.' },
      error: null,
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(response);
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'SAVE_ERROR', message: error.message },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
`;

fs.writeFileSync('app/api/config/save/route.ts', newCode);
