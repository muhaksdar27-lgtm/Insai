import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';

export interface EnvValidationResult {
  valid: boolean;
  requiredMissing: string[];
  recommendedMissing: string[];
  configuredVars: string[];
}

export function validateEnvironment(): EnvValidationResult {
    // Required: none hard-block HTTP boot unless mandatory, but if missing, features degrade
    const requiredVars: string[] = [];
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

    const requiredMissing = requiredVars.filter(v => !getEnv(v));
    const recommendedMissing = recommendedVars.filter(v => {
        if (v === 'DATABASE_URL') {
            return !getEnv('DATABASE_URL');
        }
        return !getEnv(v);
    });

    const configuredVars = recommendedVars.filter(v => !recommendedMissing.includes(v));

    if (requiredMissing.length > 0) {
        logger.error(`[ERROR][BOOT][ENV] Missing REQUIRED environment variables: ${requiredMissing.join(', ')}`);
        throw new Error(`Missing required environment variables: ${requiredMissing.join(', ')}`);
    }

    if (recommendedMissing.length > 0) {
        logger.warn(`[WARN][BOOT][ENV] Missing recommended environment variables: ${recommendedMissing.join(', ')}`);
        logger.warn('[BOOT] System starting with deterministic fallbacks for missing services.');
    } else {
        logger.info('[BOOT] All recommended environment variables are present and configured.');
    }

    return {
      valid: requiredMissing.length === 0,
      requiredMissing,
      recommendedMissing,
      configuredVars
    };
}

