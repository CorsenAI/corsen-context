import type { Redis } from '@upstash/redis';
import type { RedisClient } from './types.js';

type Assert<T extends true> = T;

/** Compile-time fixture: the current Upstash SDK must remain directly assignable. */
type UpstashRedisIsCompatible = Assert<Redis extends RedisClient ? true : false>;

export type { UpstashRedisIsCompatible };
