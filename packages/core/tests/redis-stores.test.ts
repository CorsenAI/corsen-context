import { describe, it, expect } from 'vitest';
import { RedisCache } from '../src/redis-cache.js';
import { RedisRateLimitStore } from '../src/redis-rate-limit.js';
import { adaptIORedisClient } from '../src/redis-client.js';
import { RateLimiter } from '../src/security.js';
import { CorsenContext } from '../src/index.js';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import type {
  ContentProvider,
  IORedisClient,
  RedisCacheClient,
  RedisClient,
} from '../src/types.js';

/** Minimal in-memory RedisClient for tests (string KV + sorted set). */
class FakeRedis implements RedisClient {
  kv = new Map<string, string>();
  ttl = new Map<string, number>();
  zsets = new Map<string, Array<{ score: number; member: string }>>();
  expireCalls = 0;

  async get(key: string) {
    return this.kv.has(key) ? this.kv.get(key)! : null;
  }
  async set(key: string, value: string, options: { ex: number }) {
    if (!options || !Number.isSafeInteger(options.ex) || options.ex <= 0) {
      throw new Error('strict Upstash fake requires { ex: positive integer }');
    }
    this.kv.set(key, value);
    this.ttl.set(key, options.ex);
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
    this.expireCalls++;
    this.ttl.set(key, seconds);
    return 1;
  }
  async zadd(key: string, entry: { score: number; member: string }) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('strict Upstash fake requires a score/member object');
    }
    const set = this.zsets.get(key) ?? [];
    set.push(entry);
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
  async zrange(
    key: string,
    min: number | string,
    max: number | string,
    options: { byScore: true },
  ) {
    if (options?.byScore !== true) {
      throw new Error('strict Upstash fake requires { byScore: true }');
    }
    const set = this.zsets.get(key) ?? [];
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = max === '+inf' ? Infinity : Number(max);
    return set.filter((e) => e.score >= lo && e.score <= hi).map((e) => e.member);
  }
}

const provider: ContentProvider = {
  async getPages() {
    return [];
  },
  async getPageContent() {
    return null;
  },
  async searchContent() {
    return [];
  },
};

describe('RedisCache', () => {
  it('never silently substitutes MemoryCache for cache.driver redis', () => {
    const previous = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://configured-but-not-consumed.invalid';
    try {
      expect(
        () =>
          new CorsenContext(
            { siteUrl: 'https://example.com', cache: { driver: 'redis' } },
            provider,
          ),
      ).toThrow('no CacheDriver was injected');
    } finally {
      if (previous === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previous;
    }
  });

  it('accepts cache.driver redis when an explicit RedisCache is injected', () => {
    const cache = new RedisCache(new FakeRedis());
    expect(
      () =>
        new CorsenContext(
          { siteUrl: 'https://example.com', cache: { driver: 'redis' } },
          provider,
          cache,
        ),
    ).not.toThrow();
  });

  it('round-trips a JSON value under the prefix and sets a TTL', async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    await cache.set('page:/x', { title: 'X' }, 120);
    expect(redis.kv.has('corsen:cache:page:/x')).toBe(true);
    expect(redis.ttl.get('corsen:cache:page:/x')).toBe(120);
    expect(redis.expireCalls).toBe(0);
    expect(await cache.get('page:/x')).toEqual({ title: 'X' });
  });

  it('rejects clients without an atomic SET-with-EX method', () => {
    const incompatible = {
      async get() {
        return null;
      },
      async del() {
        return 0;
      },
    } as unknown as RedisCacheClient;

    expect(() => new RedisCache(incompatible)).toThrow('atomic SET-with-EX');
  });

  it('does not leave a persistent key when the atomic write fails', async () => {
    const redis = new FakeRedis();
    redis.set = async () => {
      throw new Error('atomic write failed');
    };
    const cache = new RedisCache(redis);

    await expect(cache.set('page:/x', { title: 'X' }, 120)).rejects.toThrow('atomic write failed');
    expect(redis.kv.has('corsen:cache:page:/x')).toBe(false);
  });

  it('returns null for a missing key and drops corrupted JSON', async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    expect(await cache.get('nope')).toBeNull();
    redis.kv.set('corsen:cache:bad', '{not json');
    expect(await cache.get('bad')).toBeNull();
    expect(redis.kv.has('corsen:cache:bad')).toBe(false); // deleted
  });

  it('rejects clear when the client cannot enumerate the configured prefix', async () => {
    const cache = new RedisCache(new FakeRedis());
    await expect(cache.clear()).rejects.toThrow('cannot enumerate prefix');
  });

  it('separates page entries by owner policy when two servers share Redis', async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    let providerCalls = 0;
    const pageProvider: ContentProvider = {
      ...provider,
      async getPageContent(url: string) {
        providerCalls++;
        return {
          url,
          title: 'Shared page',
          description: '',
          markdown: '# Shared page',
          metadata: {},
        };
      },
    };
    const first = new MCPServer(
      resolveConfig({
        siteUrl: 'https://example.com',
        cache: { driver: 'redis' },
        content: { maxPages: 50 },
      }),
      pageProvider,
      { cache },
    );
    const second = new MCPServer(
      resolveConfig({
        siteUrl: 'https://example.com',
        cache: { driver: 'redis' },
        content: { maxPages: 10 },
      }),
      pageProvider,
      { cache },
    );

    await first.getPageContent('https://example.com/shared');
    await second.getPageContent('https://example.com/shared');

    expect(providerCalls).toBe(2);
    expect(redis.kv.size).toBe(2);
  });
});

describe('RedisRateLimitStore + RateLimiter', () => {
  it('normalizes ioredis SET/ZADD/ZRANGEBYSCORE commands explicitly', async () => {
    const backing = new FakeRedis();
    let setMode: string | undefined;
    let numericZadd = false;
    const ioredis: IORedisClient = {
      get: (key) => backing.get(key),
      set: async (key, value, mode, ttl) => {
        setMode = mode;
        return backing.set(key, value, { ex: ttl });
      },
      del: (...keys) => backing.del(...keys),
      expire: (key, seconds) => backing.expire(key, seconds),
      zadd: async (key, score, member) => {
        numericZadd = typeof score === 'number' && typeof member === 'string';
        return backing.zadd(key, { score, member });
      },
      zremrangebyscore: (key, min, max) => backing.zremrangebyscore(key, min, max),
      zcard: (key) => backing.zcard(key),
      zrangebyscore: (key, min, max) => backing.zrange(key, min, max, { byScore: true }),
    };
    const normalized = adaptIORedisClient(ioredis);

    await new RedisCache(normalized).set('page:/x', { title: 'X' }, 30);
    await new RedisRateLimitStore(normalized).addTimestamp('ip:test', Date.now());

    expect(setMode).toBe('EX');
    expect(numericZadd).toBe(true);
  });

  it('allows up to the limit then blocks via the combined hit path', async () => {
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
