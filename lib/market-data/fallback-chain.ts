import { getProviderRegistry } from './provider-registry';
import { logger } from '../utils/logger';

export class FallbackChain<T> {
  private providers: { provider: T; name: string }[] = [];

  addProvider(provider: T, name: string) {
    this.providers.push({ provider, name });
  }

  async execute<R>(
    operation: (provider: T) => Promise<R>,
    context: string,
    fallbackValue?: R,
    targetSymbol?: string
  ): Promise<R> {
    const errors: Error[] = [];

    // Extract symbol from context if not explicitly provided (e.g. "getLatestPrice(DXY)" -> "DXY")
    let symbolToCheck = targetSymbol;
    if (!symbolToCheck) {
      const match = context.match(/\(([A-Z0-9^=._/-]+)/i);
      if (match && match[1]) {
        symbolToCheck = match[1];
      }
    }

    for (let i = 0; i < this.providers.length; i++) {
      const { provider, name } = this.providers[i];

      // Check if provider explicitly supports this symbol
      if (symbolToCheck && typeof (provider as any).supportsSymbol === 'function') {
        const isSupported = (provider as any).supportsSymbol(symbolToCheck);
        if (!isSupported) {
          // Provider does not support this specific symbol (e.g. TwelveData doesn't do DXY macro index)
          // Skip cleanly without error
          continue;
        }
      }

      const healthStatus = getProviderRegistry().getProviderHealth(name)?.healthStatus;
      if (healthStatus === 'NOT CONFIGURED' || healthStatus === 'UNAVAILABLE' || healthStatus === 'RATE LIMITED' || healthStatus === 'QUOTA_EXCEEDED' || healthStatus === 'INVALID_KEY' || healthStatus === 'PROVIDER_ERROR') {
        const health = getProviderRegistry().getProviderHealth(name);
        if (health?.circuitBreakerStatus === 'open') {
          if (healthStatus === 'NOT CONFIGURED') {
            errors.push(new Error(`Provider ${name} skipped: not configured`));
            continue;
          }
          logger.warn(`Skipping provider ${name} due to open circuit breaker for ${context} (Status: ${healthStatus})`);
          errors.push(new Error(`Provider ${name} skipped: circuit breaker open (${healthStatus})`));
          continue;
        }
      }

      try {
        const result = await operation(provider);
        if (i > 0 && typeof result === 'object' && result !== null) {
          const primaryName = this.providers[0].name;
          const isUnsupported = errors.some(e => {
            const m = (e.message || '').toLowerCase();
            return m.includes('not supported') || m.includes('does not support') || m.includes('does not provide direct index');
          });
          const isNotConfigured = errors.some(e => {
            const m = (e.message || '').toLowerCase();
            return m.includes('not configured') || m.includes('not specified') || m.includes('apikey');
          });
          if (!isUnsupported && !isNotConfigured && errors.length > 0) {
            logger.info(`FALLBACK_EVENT: ${context} failed on primary ${primaryName}. Fallback recorded source: ${name}`);
          }
          (result as any).recordedSource = {
            primaryProvider: primaryName,
            activeProvider: name,
            fallbackIndex: i,
            fallbackReason: errors.map(e => e.message).join(' | ')
          };
        }
        return result;
      } catch (error: any) {
        const errLower = (error.message || '').toLowerCase();
        const isUnsupported = errLower.includes('not supported') || 
                              errLower.includes('does not support') || 
                              errLower.includes('does not provide direct index') ||
                              errLower.includes('unsupported symbol');

        if (errLower.includes('not configured') || errLower.includes('not specified') || errLower.includes('apikey')) {
          logger.warn(`Provider ${name} skipped for ${context}: ${error.message}`);
        } else if (isUnsupported) {
          logger.debug(`Provider ${name} skipped for ${context}: ${error.message}`);
        } else if (errLower.includes('credits depleted') || errLower.includes('quota') || errLower.includes('exhausted')) {
          logger.warn(`Provider ${name} skipped for ${context}: ${error.message}`);
        } else {
          logger.error(`Provider ${name} failed for ${context}: ${error.message}`);
        }
        errors.push(error);
        if (!errLower.includes('not configured') && !isUnsupported && !errLower.includes('credits depleted') && !errLower.includes('quota')) {
          logger.warn(`Falling back to next provider for ${context}...`);
        }
      }
    }

    const errorMessage = errors.length > 0 
      ? errors.map(e => e.message).join(', ')
      : `No available providers for ${context}`;

    if (errorMessage.includes('not configured')) {
      logger.warn(`All providers skipped for ${context}. Reason: ${errorMessage}`);
    } else {
      logger.error(`All providers failed for ${context}. Errors: ${errorMessage}`);
    }
    
    if (fallbackValue !== undefined) {
      if (typeof fallbackValue === 'object' && fallbackValue !== null) {
        (fallbackValue as any).reason = errorMessage;
        
        if (errorMessage.includes('Rate Limited') || errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('exhausted')) {
          (fallbackValue as any).status = 'rate_limited';
        } else if (errorMessage.includes('Unavailable')) {
          (fallbackValue as any).status = 'unavailable';
        } else if (errorMessage.includes('not configured')) {
          (fallbackValue as any).status = 'not_configured';
        } else {
          (fallbackValue as any).status = 'error';
        }
      }
      return fallbackValue;
    }
    
    throw new Error(`Market Data Error (${context}): ${errorMessage}`);
  }
}
