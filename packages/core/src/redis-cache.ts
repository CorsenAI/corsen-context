import type { CacheDriver, RedisClient } from './types.js';

/**
 * Redis-backed cache driver for distributed / multi-instance deployments.
 * Compatible with ioredis, @upstash/redis, or any client implementing RedisClient.
 *
 * Usage:
 *   import Redis from 'ioredis';
 *   const redis = new Redis();
 *   const cache = new RedisCache(redis);
 *   const ctx = new CorsenContext(config, provider, cache);
 */
export class RedisCache implements CacheDriver {
  private redis: RedisClient;
  private prefix: string;

  constructor(redis: RedisClient, options?: { prefix?: string }) {
    this.redis = redis;
    this.prefix = options?.prefix || 'corsen:cache:';
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(`${this.prefix}${key}`);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted entry — delete and return null
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const redisKey = `${this.prefix}${key}`;
    // Set + EXPIRE rather than SET ... EX: the `{ ex }` option is honored by
    // @upstash/redis but silently ignored by ioredis (which wants `'EX', ttl`),
    // whereas EXPIRE works identically on both clients.
    await this.redis.set(redisKey, serialized);
    if (ttl > 0) {
      await this.redis.expire(redisKey, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(`${this.prefix}${key}`);
  }

  async clear(): Promise<void> {
    // Redis doesn't support prefix-based deletion natively.
    // FLUSHDB is too dangerous. Users must use SCAN + DEL with their prefix.
    console.warn(
      `[corsen-context] RedisCache.clear() is a no-op. ` +
      `Use SCAN + DEL with prefix "${this.prefix}" to clear cached entries manually.`,
    );
  }
}
