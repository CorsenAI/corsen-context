import type { RateLimitStore, RedisClient } from './types.js';

/**
 * Redis-backed rate limit store using Sorted Sets.
 *
 * Each request is stored as a sorted-set member with score = timestamp; the
 * window is pruned with ZREMRANGEBYSCORE and counted with ZCARD/ZRANGEBYSCORE.
 * Every individual command is atomic, but the prune → add → count sequence is
 * not wrapped in a single transaction, so under extreme concurrency the count
 * can momentarily overshoot the limit by roughly the in-flight request count.
 * The `hit()` path adds first and counts after (fail-safe: a rejected request
 * still occupies a slot), which keeps the overshoot small and bounded. For a
 * strict guarantee, back this with a client exposing an atomic script (Lua).
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

  /**
   * Combined add-then-count. Records the hit first, prunes the window, then
   * returns the window and burst counts (both including the current request).
   * Fewer round-trips than getTimestamps()+addTimestamp() and add-first so a
   * rejected request still counts against the window.
   */
  async hit(
    key: string,
    windowStart: number,
    burstWindowStart: number,
    now: number,
  ): Promise<{ windowCount: number; burstCount: number }> {
    const redisKey = `${this.prefix}${key}`;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    await this.redis.zadd(redisKey, now, member);
    await this.redis.expire(redisKey, Math.ceil(this.windowMs / 1000) + 1);
    await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);

    const windowCount = await this.redis.zcard(redisKey);
    const burstMembers = await this.redis.zrangebyscore(redisKey, burstWindowStart, '+inf');
    return { windowCount, burstCount: burstMembers.length };
  }

  async cleanup(): Promise<void> {
    // Redis TTL handles cleanup automatically
  }
}
