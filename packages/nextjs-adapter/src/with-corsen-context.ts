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
    const publishLlmsTxt = corsenConfig.static?.generateLlmsTxt !== false;
    const publishLlmsFullTxt = publishLlmsTxt && corsenConfig.static?.includeFullContent === true;

    return {
      ...nextConfig,
      async rewrites() {
        const corsenRewrites = [
          ...(publishLlmsTxt
            ? [
                {
                  source: '/llms.txt',
                  destination: '/api/corsen-context/llms-txt',
                },
              ]
            : []),
          ...(publishLlmsFullTxt
            ? [
                {
                  source: '/llms-full.txt',
                  destination: '/api/corsen-context/llms-full-txt',
                },
              ]
            : []),
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
    };
  };
}
