import { describe, it, expect } from 'vitest';
import { RedisCache } from '../src/redis-cache.js';
import { RedisRateLimitStore } from '../src/redis-rate-limit.js';
import { RateLimiter } from '../src/security.js';
import type { RedisClient } from '../src/types.js';

/** Minimal in-memory RedisClient for tests (string KV + sorted set). */
class FakeRedis implements RedisClient {
  kv = new Map<string, string>();
  ttl = new Map<string, number>();
  zsets = new Map<string, Array<{ score: number; member: string }>>();

  async get(key: string) {
    return this.kv.has(key) ? this.kv.get(key)! : null;
  }
  async set(key: string, value: string) {
    this.kv.set(key, value);
    return 'OK';
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) {
      if (this.kv.delete(k)) n++;
      this.zsets.delete(k);
    }
    return n;
  }
  async incr(key: string) {
    const v = Number(this.kv.get(key) ?? '0') + 1;
    this.kv.set(key, String(v));
    return v;
  }
  async expire(key: string, seconds: number) {
    this.ttl.set(key, seconds);
    return 1;
  }
  async zadd(key: string, score: number, member: string) {
    const set = this.zsets.get(key) ?? [];
    set.push({ score, member });
    this.zsets.set(key, set);
    return 1;
  }
  async zremrangebyscore(key: string, min: number | string, max: number | string) {
    const set = this.zsets.get(key) ?? [];
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = max === '+inf' ? Infinity : Number(max);
    const kept = set.filter((e) => e.score < lo || e.score > hi);
    this.zsets.set(key, kept);
    return set.length - kept.length;
  }
  async zcard(key: string) {
    return (this.zsets.get(key) ?? []).length;
  }
  async zrangebyscore(key: string, min: number | string, max: number | string) {
    const set = this.zsets.get(key) ?? [];
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = max === '+inf' ? Infinity : Number(max);
    return set.filter((e) => e.score >= lo && e.score <= hi).map((e) => e.member);
  }
}

describe('RedisCache', () => {
  it('round-trips a JSON value under the prefix and sets a TTL', async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    await cache.set('page:/x', { title: 'X' }, 120);
    expect(redis.kv.has('corsen:cache:page:/x')).toBe(true);
    expect(redis.ttl.get('corsen:cache:page:/x')).toBe(120);
    expect(await cache.get('page:/x')).toEqual({ title: 'X' });
  });

  it('returns null for a missing key and drops corrupted JSON', async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    expect(await cache.get('nope')).toBeNull();
    redis.kv.set('corsen:cache:bad', '{not json');
    expect(await cache.get('bad')).toBeNull();
    expect(redis.kv.has('corsen:cache:bad')).toBe(false); // deleted
  });
});

describe('RedisRateLimitStore + RateLimiter', () => {
  it('allows up to the limit then blocks via the atomic hit path', async () => {
    const redis = new FakeRedis();
    const store = new RedisRateLimitStore(redis);
    const limiter = new RateLimiter(3, 100, store);

    const outcomes: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      outcomes.push((await limiter.check('ip:1.2.3.4')).allowed);
    }
    expect(outcomes).toEqual([true, true, true, false, false]);
  });

  it('enforces the burst limit', async () => {
    const redis = new FakeRedis();
    const store = new RedisRateLimitStore(redis);
    const limiter = new RateLimiter(1000, 2, store);

    const outcomes: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      outcomes.push((await limiter.check('ip:9.9.9.9')).allowed);
    }
    // 3rd request within the same second exceeds burst=2.
    expect(outcomes[0]).toBe(true);
    expect(outcomes[1]).toBe(true);
    expect(outcomes[2]).toBe(false);
  });
});
