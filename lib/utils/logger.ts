export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogPayload {
  correlation_id?: string;
  schema_version?: string;
  source_timestamp?: string;
  signal_key?: string;
  strategy_id?: string;
  service_name?: string;
  status?: string;
  reason?: string;
  [key: string]: any;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function getActiveLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
    return 'debug';
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const globalAny: any = globalThis;
if (!globalAny.__logBuffer) {
  globalAny.__logBuffer = [];
}
export const logBuffer: any[] = globalAny.__logBuffer;

// In-memory throttle tracker for high-frequency logs
const logThrottleMap = new Map<string, number>();

// Mock AsyncLocalStorage for browser compatibility
export const requestContext = {
  getStore: () => ({ correlationId: undefined }),
  run: (_store: any, callback: any) => callback()
};

function maskSensitive(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  const masked = { ...obj };
  const sensitiveKeys = ['API_KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'KEY'];
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some(sk => key.toUpperCase().includes(sk))) {
      masked[key] = '*** MASKED ***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitive(masked[key]);
    }
  }
  return masked;
}

export const logger = {
  log: (level: LogLevel, message: string, payload?: LogPayload) => {
    const context = requestContext.getStore();
    const correlation_id = payload?.correlation_id || context?.correlationId;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(correlation_id ? { correlation_id } : {}),
      ...(payload ? maskSensitive(payload) : {})
    };
    
    // Add to buffer (keep up to 200 recent entries for diagnostics)
    logBuffer.unshift(logEntry);
    if (logBuffer.length > 200) {
      logBuffer.pop();
    }
    
    // Check log level threshold before outputting to console
    const activeLevel = getActiveLogLevel();
    if (LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[activeLevel]) {
      const serialized = JSON.stringify(logEntry);
      switch (level) {
        case 'error':
          console.error(serialized);
          break;
        case 'warn':
          console.warn(serialized);
          break;
        case 'debug':
          console.debug(serialized);
          break;
        case 'info':
        default:
          console.log(serialized);
          break;
      }
    }
  },
  info: (message: string, payload?: LogPayload) => logger.log('info', message, payload),
  warn: (message: string, payload?: LogPayload) => logger.log('warn', message, payload),
  error: (message: string, payload?: LogPayload) => logger.log('error', message, payload),
  debug: (message: string, payload?: LogPayload) => logger.log('debug', message, payload),
  
  /**
   * Emits a debug log throttled by a unique key and interval.
   * If called multiple times with the same key within intervalMs, subsequent calls are skipped.
   */
  debugThrottled: (throttleKey: string, intervalMs: number, message: string, payload?: LogPayload) => {
    const now = Date.now();
    const lastLogged = logThrottleMap.get(throttleKey) || 0;
    if (now - lastLogged >= intervalMs) {
      logThrottleMap.set(throttleKey, now);
      if (logThrottleMap.size > 500) {
        for (const [k, ts] of logThrottleMap.entries()) {
          if (now - ts > 600000) logThrottleMap.delete(k);
        }
      }
      logger.debug(message, payload);
    }
  },

  /**
   * Emits a warn log throttled by a unique key and interval.
   */
  warnThrottled: (throttleKey: string, intervalMs: number, message: string, payload?: LogPayload) => {
    const now = Date.now();
    const lastLogged = logThrottleMap.get(throttleKey) || 0;
    if (now - lastLogged >= intervalMs) {
      logThrottleMap.set(throttleKey, now);
      if (logThrottleMap.size > 500) {
        for (const [k, ts] of logThrottleMap.entries()) {
          if (now - ts > 600000) logThrottleMap.delete(k);
        }
      }
      logger.warn(message, payload);
    }
  },

  /**
   * Emits an info log throttled by a unique key and interval.
   */
  infoThrottled: (throttleKey: string, intervalMs: number, message: string, payload?: LogPayload) => {
    const now = Date.now();
    const lastLogged = logThrottleMap.get(throttleKey) || 0;
    if (now - lastLogged >= intervalMs) {
      logThrottleMap.set(throttleKey, now);
      if (logThrottleMap.size > 500) {
        for (const [k, ts] of logThrottleMap.entries()) {
          if (now - ts > 600000) logThrottleMap.delete(k);
        }
      }
      logger.info(message, payload);
    }
  }
};

