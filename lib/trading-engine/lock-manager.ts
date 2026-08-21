import { getQueueManager } from '../redis/queue';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface LockInfo {
  key: string;
  owner: string;
  expiresAt: number;
  acquiredAt: number;
}

export class InFlightLockManager {
  private static instance: InFlightLockManager;
  private localLocks: Map<string, LockInfo> = new Map();

  private constructor() {
    // Periodic stale lock cleanup recovery
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.recoverStaleLocks(), 10000);
    }
  }

  public static getInstance(): InFlightLockManager {
    if (!InFlightLockManager.instance) {
      InFlightLockManager.instance = new InFlightLockManager();
    }
    return InFlightLockManager.instance;
  }

  /**
   * Generates a unique worker/process owner ID
   */
  public generateOwnerId(prefix: string = 'worker'): string {
    return `${prefix}_${process.pid || 'p'}_${crypto.randomUUID().substring(0, 8)}`;
  }

  /**
   * Acquires an in-flight lock with owner and TTL.
   * If Redis is available, uses Redis SET NX EX.
   * Otherwise uses memory map with atomic ownership and expiration check.
   */
  public async acquireLock(key: string, owner: string, ttlSeconds: number = 30): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    // Check memory lock first
    const existing = this.localLocks.get(key);
    if (existing) {
      if (existing.expiresAt > now) {
        if (existing.owner === owner) {
          // Re-entrant lock by same owner - refresh TTL
          existing.expiresAt = expiresAt;
          return true;
        }
        logger.debug(`[IN-FLIGHT LOCK] Key ${key} is currently locked by owner ${existing.owner} until ${new Date(existing.expiresAt).toISOString()}`);
        return false;
      } else {
        // Stale lock recovery
        logger.info(`[LOCK RECOVERY] Recovering expired in-flight lock on ${key} (previous owner: ${existing.owner})`);
        this.localLocks.delete(key);
      }
    }

    // Try Redis if connected
    const qm = getQueueManager();
    if (qm.isConnected()) {
      try {
        const redisKey = `inflight_lock:${key}`;
        const acquired = await qm.acquireLock(redisKey, ttlSeconds);
        if (!acquired) {
          return false;
        }
      } catch (err: any) {
        logger.warn(`Redis lock failed for ${key}, relying on local lock: ${err.message}`);
      }
    }

    this.localLocks.set(key, {
      key,
      owner,
      expiresAt,
      acquiredAt: now
    });

    logger.debug(`[IN-FLIGHT LOCK] Acquired lock on ${key} for owner ${owner} (TTL: ${ttlSeconds}s)`);
    return true;
  }

  /**
   * Releases lock safely — only if the requesting owner matches, or if forced.
   */
  public async releaseLock(key: string, owner: string, force: boolean = false): Promise<boolean> {
    const existing = this.localLocks.get(key);
    if (!existing) {
      return true;
    }

    if (!force && existing.owner !== owner && existing.expiresAt > Date.now()) {
      logger.warn(`[IN-FLIGHT LOCK] Owner mismatch on release: key ${key} owned by ${existing.owner}, release requested by ${owner}`);
      return false;
    }

    this.localLocks.delete(key);

    const qm = getQueueManager();
    if (qm.isConnected()) {
      try {
        await qm.releaseLock(`inflight_lock:${key}`);
      } catch (err: any) {
        logger.warn(`Redis lock release failed for ${key}: ${err.message}`);
      }
    }

    logger.debug(`[IN-FLIGHT LOCK] Released lock on ${key} by owner ${owner}`);
    return true;
  }

  /**
   * Checks if key is currently locked
   */
  public isLocked(key: string): boolean {
    const existing = this.localLocks.get(key);
    if (!existing) return false;
    if (existing.expiresAt <= Date.now()) {
      this.localLocks.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Gets lock information
   */
  public getLockInfo(key: string): LockInfo | null {
    const existing = this.localLocks.get(key);
    if (!existing) return null;
    if (existing.expiresAt <= Date.now()) {
      this.localLocks.delete(key);
      return null;
    }
    return { ...existing };
  }

  /**
   * Stale lock recovery scanner
   */
  public recoverStaleLocks(): number {
    const now = Date.now();
    let recoveredCount = 0;
    for (const [key, info] of this.localLocks.entries()) {
      if (info.expiresAt <= now) {
        this.localLocks.delete(key);
        recoveredCount++;
        logger.info(`[LOCK RECOVERY] Automatically purged expired lock: ${key} (Owner: ${info.owner})`);
      }
    }
    return recoveredCount;
  }

  /**
   * Reset all locks (used in test teardowns)
   */
  public reset(): void {
    this.localLocks.clear();
  }
}

export const lockManager = InFlightLockManager.getInstance();
