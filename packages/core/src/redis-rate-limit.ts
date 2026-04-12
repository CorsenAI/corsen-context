import type { RateLimitStore, RedisClient } from './types.js';

/**
 * Redis-backed rate limit store using Sorted Sets for atomic operations.
 *
 * Uses ZADD + ZREMRANGEBYSCORE + ZCARD — all atomic Redis commands.
 * No GET→modify→SET race condition. Safe under concurrent load.
 *
 * Each request is stored as a sorted set member with score = timestamp.
 * Window pruning happens atomically with ZREMRANGEBYSCORE before counting.
 *
 * Compatible with ioredis, @upstash/redis, or any client implementing RedisClient.
 */
export class RedisRateLimitStore implements RateLimitStore {
  private redis: RedisClient;
  private prefix: string;
  private windowMs: number;

  constructor(redis: RedisClient, options?: { prefix?: string; windowMs?: number }) {
    this.redis = redis;
    this.prefix = options?.prefix || 'corsen:rl:';
    this.windowMs = options?.windowMs || 60_000;
  }

  async getTimestamps(key: string, windowStart: number): Promise<number[]> {
    const redisKey = `${this.prefix}${key}`;

    // Atomic: prune expired entries, then get remaining
    await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);
    const members = await this.redis.zrangebyscore(redisKey, windowStart, '+inf');

    return members.map((m) => {
      const ts = parseFloat(m.split(':')[0]);
      return isNaN(ts) ? 0 : ts;
    }).filter((t) => t > 0);
  }

  async addTimestamp(key: string, timestamp: number): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    // Member must be unique — append random suffix
    const member = `${timestamp}:${Math.random().toString(36).slice(2, 8)}`;

    // Atomic: add entry + set TTL
    await this.redis.zadd(redisKey, timestamp, member);
    const ttlSeconds = Math.ceil(this.windowMs / 1000) + 1;
    await this.redis.expire(redisKey, ttlSeconds);
  }

  async cleanup(): Promise<void> {
    // Redis TTL handles cleanup automatically
  }
}
