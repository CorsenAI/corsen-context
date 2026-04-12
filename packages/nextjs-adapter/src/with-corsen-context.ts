import type { CorsenContextConfig } from '@corsenai/corsen-context';

interface NextConfig {
  rewrites?: () => Promise<any[] | { beforeFiles?: any[]; afterFiles?: any[]; fallback?: any[] }>;
  [key: string]: unknown;
}

/**
 * Wraps a Next.js config to enable Corsen Context.
 *
 * Usage in next.config.mjs:
 * ```js
 * import { withCorsenContext } from '@corsenai/corsen-context-nextjs';
 *
 * export default withCorsenContext({
 *   siteUrl: 'https://example.com',
 * })({
 *   // your existing Next.js config
 * });
 * ```
 */
export function withCorsenContext(corsenConfig: CorsenContextConfig) {
  return function wrapNextConfig(nextConfig: NextConfig = {}): NextConfig {
    const existingRewrites = nextConfig.rewrites;

    return {
      ...nextConfig,
      async rewrites() {
        const corsenRewrites = [
          {
            source: '/llms.txt',
            destination: '/api/corsen-context/llms-txt',
          },
          {
            source: '/llms-full.txt',
            destination: '/api/corsen-context/llms-full-txt',
          },
        ];

        if (existingRewrites) {
          const existing = await existingRewrites();
          if (Array.isArray(existing)) {
            return [...corsenRewrites, ...existing];
          }
          return {
            ...existing,
            beforeFiles: [...corsenRewrites, ...(existing.beforeFiles || [])],
          };
        }

        return corsenRewrites;
      },

      // Store config for runtime handlers
      env: {
        ...(nextConfig.env as Record<string, string> | undefined),
        CORSEN_CONTEXT_CONFIG: JSON.stringify(corsenConfig),
      },
    };
  };
}
