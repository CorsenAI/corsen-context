import { z } from 'zod';

export const corsenContextConfigSchema = z.object({
  siteUrl: z.string().url(),
  siteName: z.string().optional(),
  description: z.string().optional(),

  content: z
    .object({
      postTypes: z.array(z.string()).default(['post', 'page']),
      excludePaths: z.array(z.string()).default([]),
      maxPages: z.number().int().min(1).max(5000).default(500),
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
      includeFullContent: z.boolean().default(false),
      maxOutputBytes: z.number().int().min(65536).max(10485760).default(5242880),
    })
    .default({}),

  security: z
    .object({
      rateLimit: z.number().int().positive().default(100),
      burstLimit: z.number().int().positive().default(10),
      allowedOrigins: z.array(z.string()).default([]),
      apiKey: z.string().optional(),
      // Only honor forwarding headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP)
      // when the request reaches the server through a trusted reverse proxy.
      // Left false, the rate limiter keys on the socket address so spoofed
      // forwarding headers cannot each land in a fresh bucket.
      trustProxy: z.boolean().default(false),
      // Deprecated compatibility input. MCP requires Implementation.version
      // in initialize results, so this value no longer suppresses it.
      exposeVersion: z.boolean().default(true),
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

  return config;
}
