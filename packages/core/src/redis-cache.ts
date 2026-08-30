import type { CacheDriver, RedisCacheClient } from './types.js';

/**
 * Redis-backed cache driver for distributed / multi-instance deployments.
 * Accepts @upstash/redis directly. Wrap ioredis with adaptIORedisClient().
 * Custom RedisCacheClient implementations must expose atomic SET with EX.
 *
 * Usage:
 *   import Redis from 'ioredis';
 *   import { adaptIORedisClient } from '@corsenai/corsen-context';
 *   const redis = adaptIORedisClient(new Redis());
 *   const cache = new RedisCache(redis);
 *   const ctx = new CorsenContext(config, provider, cache);
 */
export class RedisCache implements CacheDriver {
  private redis: RedisCacheClient;
  private prefix: string;

  constructor(redis: RedisCacheClient, options?: { prefix?: string }) {
    if (typeof redis.set !== 'function') {
      throw new Error('Corsen Context: RedisCache requires an atomic SET-with-EX client method.');
    }
    this.redis = redis;
    this.prefix = options?.prefix || 'corsen:cache:';
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(`${this.prefix}${key}`);
    if (raw === null) return null;

    // @upstash/redis can deserialize JSON automatically; ioredis returns the
    // serialized string. Both forms are safe because this prefix is private to
    // RedisCache.
    if (typeof raw !== 'string') return raw as T;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted entry — delete and return null
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    if (!Number.isSafeInteger(ttl) || ttl <= 0) {
      throw new Error('Corsen Context: RedisCache TTL must be a positive integer.');
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('Corsen Context: RedisCache cannot serialize the supplied value.');
    }
    const redisKey = `${this.prefix}${key}`;
    await this.redis.set(redisKey, serialized, { ex: ttl });
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(`${this.prefix}${key}`);
  }

  async clear(): Promise<void> {
    // FLUSHDB is unsafe and the minimal cross-client interface does not expose
    // SCAN. Never report a successful purge when entries remain live.
    throw new Error(
      `Corsen Context: RedisCache.clear() cannot enumerate prefix "${this.prefix}". ` +
        'Delete that prefix with your Redis client or replace the cache instance.',
    );
  }
}
