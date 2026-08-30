import { Redis } from '@upstash/redis';
import {
  RedisCache,
  RedisRateLimitStore,
  type ContentProvider,
  type CorsenContextConfig,
} from '@corsenai/corsen-context';
import { createMCPHandler } from '@corsenai/corsen-context-nextjs';

export function createUpstashMCPHandler(config: CorsenContextConfig, provider: ContentProvider) {
  // Server-only: reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
  const redis = Redis.fromEnv();
  return createMCPHandler(config, provider, {
    cache: new RedisCache(redis),
    rateLimitStore: new RedisRateLimitStore(redis),
  });
}
