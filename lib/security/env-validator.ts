import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';

export function validateEnvironment(): void {
    const recommendedVars = [
        'GEMINI_API_KEY',
        'TWELVEDATA_API_KEY',
        'POLYGON_API_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'NEWS_API_KEY',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID',
        'REDIS_URL',
        'PYTHON_ENGINE_URL'
    ];

    const missingRecommended = recommendedVars.filter(v => {
        if (v === 'NEXT_PUBLIC_SUPABASE_URL') {
            return !getEnv('NEXT_PUBLIC_SUPABASE_URL') && !getEnv('SUPABASE_URL');
        }
        return !getEnv(v);
    });

    if (missingRecommended.length > 0) {
        logger.warn(`Missing recommended environment variables: ${missingRecommended.join(', ')}`);
        logger.warn('System will start in DEGRADED mode or feature-limited mode if these are not provided.');
    } else {
        logger.info('Environment validation passed.');
    }
}
