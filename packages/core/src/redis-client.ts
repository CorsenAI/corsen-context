import type { IORedisClient, RedisClient } from './types.js';

/**
 * Normalize ioredis's variadic sorted-set API to the Upstash-compatible
 * RedisClient contract used by the core stores.
 */
export function adaptIORedisClient(redis: IORedisClient): RedisClient {
  return {
    get: (key) => redis.get(key),
    set: (key, value, options) => redis.set(key, value, 'EX', options.ex),
    del: (...keys) => redis.del(...keys),
    expire: (key, seconds) => redis.expire(key, seconds),
    zadd: (key, entry) => redis.zadd(key, entry.score, entry.member),
    zremrangebyscore: (key, min, max) => redis.zremrangebyscore(key, min, max),
    zcard: (key) => redis.zcard(key),
    zrange: (key, min, max) => redis.zrangebyscore(key, min, max),
  };
}
