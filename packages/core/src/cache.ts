import type { CacheDriver } from './types.js';

/** Default max entries before LRU eviction kicks in */
const DEFAULT_MAX_ENTRIES = 1000;

/** Cleanup interval: prune expired entries every 60 seconds */
const CLEANUP_INTERVAL_MS = 60_000;

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
}

/**
 * In-memory cache with TTL expiry, max size limit, and LRU eviction.
 *
 * - Entries expire after their TTL
 * - When maxEntries is reached, the least-recently-accessed entry is evicted
 * - Automatic periodic cleanup of expired entries
 *
 * For production multi-instance deployments, use RedisCache instead.
 */
export class MemoryCache implements CacheDriver {
  private store = new Map<string, MemoryCacheEntry<unknown>>();
  private maxEntries: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { maxEntries?: number; autoCleanup?: boolean }) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;

    // Auto-cleanup by default (can disable for testing)
    if (options?.autoCleanup !== false) {
      this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
      // Don't block Node.js shutdown
      if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Update access time for LRU
    entry.lastAccessedAt = Date.now();
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    // Evict if at capacity (before adding)
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      this.evictLRU();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
      lastAccessedAt: Date.now(),
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Current number of entries */
  get size(): number {
    return this.store.size;
  }

  /** Stop automatic cleanup (for graceful shutdown or testing) */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Remove all expired entries */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /** Evict the least-recently-accessed entry */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}
