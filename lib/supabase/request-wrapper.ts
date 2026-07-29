// Simple request wrapper used by SupabaseService for timeouts and retries
export async function withTimeout<T>(fn: () => Promise<T>, ms: number = 8000): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('RequestTimeout')), ms);
    });
    return await Promise.race([fn(), timeoutPromise]) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withRetries<T>(operation: () => Promise<T>, retries: number = 2, baseDelay = 200): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      const delay = Math.pow(2, i) * baseDelay;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
