import { getEnv, isRailwayProduction } from "../utils/env";
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
        'REDIS_URL'
    ];

    // Only check PYTHON_ENGINE_URL in non-Railway environments
    // Railway should use external Python or skip Python validation entirely
    if (!isRailwayProduction()) {
        recommendedVars.push('PYTHON_ENGINE_URL');
    }

    const missingRecommended = recommendedVars.filter(v => {
        if (v === 'NEXT_PUBLIC_SUPABASE_URL') {
            return !getEnv('NEXT_PUBLIC_SUPABASE_URL') && !getEnv('SUPABASE_URL');
        }
        return !getEnv(v);
    });

    if (missingRecommended.length > 0) {
        const isRailway = isRailwayProduction();
        const context = isRailway ? 'Railway production' : 'local/staging';
        logger.warn(`[${context}] Missing recommended environment variables: ${missingRecommended.join(', ')}`);
        logger.warn('System will start in DEGRADED mode or feature-limited mode if these are not provided.');
    } else {
        logger.info('Environment validation passed.');
    }
}

