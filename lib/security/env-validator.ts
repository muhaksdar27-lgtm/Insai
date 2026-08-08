import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';

export function validateEnvironment(): void {
    const recommendedVars = [
        'GEMINI_API_KEY',
        'TWELVEDATA_API_KEY',
        'POLYGON_API_KEY',
        'DATABASE_URL',
        'NEWS_API_KEY',
        'TWITTER_BEARER_TOKEN',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID',
        'REDIS_URL',
        'PYTHON_ENGINE_URL'
    ];

    const missingRecommended = recommendedVars.filter(v => {
        if (v === 'DATABASE_URL') {
            return !getEnv('DATABASE_URL');
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
