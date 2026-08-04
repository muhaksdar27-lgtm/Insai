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
    fallbackValue?: R
  ): Promise<R> {
    const errors: Error[] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const { provider, name } = this.providers[i];

      const healthStatus = getProviderRegistry().getProviderHealth(name)?.healthStatus;
      if (healthStatus === 'UNAVAILABLE' || healthStatus === 'RATE LIMITED' || healthStatus === 'QUOTA_EXCEEDED' || healthStatus === 'INVALID_KEY' || healthStatus === 'PROVIDER_ERROR') {
        const health = getProviderRegistry().getProviderHealth(name);
        if (health?.circuitBreakerStatus === 'open') {
           logger.warn(`Skipping provider ${name} due to open circuit breaker for ${context} (Status: ${healthStatus})`);
           errors.push(new Error(`Provider ${name} skipped: circuit breaker open (${healthStatus})`));
           continue;
        }
      }

      try {
        const result = await operation(provider);
        if (i > 0 && typeof result === 'object' && result !== null) {
          const primaryName = this.providers[0].name;
          logger.info(`FALLBACK_EVENT: ${context} failed on primary ${primaryName}. Fallback recorded source: ${name}`);
          (result as any).recordedSource = {
            primaryProvider: primaryName,
            activeProvider: name,
            fallbackIndex: i,
            fallbackReason: errors.map(e => e.message).join(' | ')
          };
        }
        return result;
      } catch (error: any) {
        if (error.message.includes('not configured')) {
          logger.warn(`Provider ${name} skipped for ${context}: ${error.message}`);
        } else if (error.message.includes('not supported by')) {
          logger.info(`Provider ${name} skipped for ${context}: ${error.message}`);
        } else {
          logger.error(`Provider ${name} failed for ${context}: ${error.message}`);
        }
        errors.push(error);
        if (!error.message.includes('not configured') && !error.message.includes('not supported by')) {
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
