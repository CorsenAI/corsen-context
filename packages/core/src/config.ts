import { z } from 'zod';

export const corsenContextConfigSchema = z.object({
  siteUrl: z.string().url(),
  siteName: z.string().optional(),
  description: z.string().optional(),

  content: z
    .object({
      postTypes: z.array(z.string()).default(['post', 'page']),
      excludePaths: z.array(z.string()).default([]),
      maxPages: z.number().int().positive().default(500),
    })
    .default({}),

  mcp: z
    .object({
      enabled: z.boolean().default(true),
      endpoint: z.string().default('/v1/mcp'),
      tools: z
        .array(z.string())
        .default(['search_site', 'get_page_content', 'list_content', 'get_sitemap']),
    })
    .default({}),

  static: z
    .object({
      generateLlmsTxt: z.boolean().default(true),
      includeFullContent: z.boolean().default(true),
    })
    .default({}),

  security: z
    .object({
      rateLimit: z.number().int().positive().default(100),
      burstLimit: z.number().int().positive().default(10),
      allowedOrigins: z.array(z.string()).default([]),
      apiKey: z.string().optional(),
    })
    .default({}),

  cache: z
    .object({
      enabled: z.boolean().default(true),
      ttl: z.number().int().positive().default(3600),
      driver: z.enum(['memory', 'redis']).default('memory'),
    })
    .default({}),

  credit: z.boolean().default(true),
});

export type CorsenContextConfig = z.input<typeof corsenContextConfigSchema>;
export type ResolvedConfig = z.output<typeof corsenContextConfigSchema>;

export function resolveConfig(input: CorsenContextConfig): ResolvedConfig {
  const config = corsenContextConfigSchema.parse(input);

  if (!config.security.apiKey && process.env.CORSEN_CONTEXT_API_KEY) {
    config.security.apiKey = process.env.CORSEN_CONTEXT_API_KEY;
  }

  // Safety check: if Redis is selected but no REDIS_URL is set, warn loudly
  if (config.cache.driver === 'redis' && !process.env.REDIS_URL) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new Error(
        'Corsen Context: cache.driver is "redis" but REDIS_URL environment variable is not set. ' +
        'Set REDIS_URL or switch to driver: "memory".',
      );
    } else {
      console.warn(
        '[corsen-context] WARNING: cache.driver is "redis" but REDIS_URL is not set. ' +
        'Falling back to memory cache. Set REDIS_URL for production.',
      );
    }
  }

  return config;
}
