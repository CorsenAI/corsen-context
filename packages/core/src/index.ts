import type pino from 'pino';
import type { ContentProvider, CacheDriver, RateLimitStore } from './types.js';
import type { CorsenContextConfig } from './config.js';
import { resolveConfig } from './config.js';
import { MCPServer, cachePolicyNamespace } from './mcp-server.js';
import { generateLlmsTxt, generateLlmsFullTxt } from './llms-txt.js';
import { parseSitemap, discoverSitemap } from './sitemap.js';
import { htmlToMarkdown, extractMetadata } from './converter.js';
import { resolvePublicPageUrl } from './content-policy.js';
import { MemoryCache } from './cache.js';
import { MemoryRateLimitStore } from './security.js';

export class CorsenContext {
  private config;
  private provider: ContentProvider;
  private cache: CacheDriver;
  private rateLimitStore: RateLimitStore;

  constructor(
    userConfig: CorsenContextConfig,
    provider: ContentProvider,
    cache?: CacheDriver,
    rateLimitStore?: RateLimitStore,
  ) {
    this.config = resolveConfig(userConfig);
    this.provider = provider;
    if (this.config.cache.driver === 'redis' && !cache) {
      throw new Error(
        'Corsen Context: cache.driver is "redis" but no CacheDriver was injected. ' +
          'REDIS_URL is not consumed automatically; pass a RedisCache instance or use driver: "memory".',
      );
    }
    this.cache = cache || new MemoryCache();
    // A single shared store so rate-limit state persists across the per-request
    // MCPServer instances every adapter creates. Pass a Redis store for
    // multi-instance deployments.
    this.rateLimitStore = rateLimitStore || new MemoryRateLimitStore();
  }

  async generateLlmsTxt(): Promise<string> {
    if (!this.config.static.generateLlmsTxt) {
      throw new Error('llms.txt is disabled by the owner configuration');
    }
    return generateLlmsTxt(this.config, this.provider);
  }

  async generateLlmsFullTxt(): Promise<string> {
    if (!this.config.static.generateLlmsTxt || !this.config.static.includeFullContent) {
      throw new Error('llms-full.txt is disabled by the owner configuration');
    }
    return generateLlmsFullTxt(this.config, this.provider);
  }

  createMCPServer(options?: { rateLimitStore?: RateLimitStore; logger?: pino.Logger }): MCPServer {
    return new MCPServer(this.config, this.provider, {
      cache: this.cache,
      rateLimitStore: options?.rateLimitStore ?? this.rateLimitStore,
      logger: options?.logger,
    });
  }

  /** Drop the cached body for a single page URL (wire to CMS update/delete hooks). */
  async invalidatePage(url: string): Promise<void> {
    const pageUrl = resolvePublicPageUrl(url, this.config);
    if (pageUrl) {
      await this.cache.delete(`${cachePolicyNamespace(this.config)}page:${pageUrl}`);
    }
  }

  /** Clear all cached page bodies. Call after bulk content changes. */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async discoverSitemap(url?: string): Promise<string | null> {
    return discoverSitemap(url || this.config.siteUrl);
  }

  async parseSitemap(sitemapUrl: string) {
    return parseSitemap(sitemapUrl, this.config.content.maxPages);
  }

  convertToMarkdown(html: string): string {
    return htmlToMarkdown(html);
  }

  extractMetadata(html: string): Record<string, string> {
    return extractMetadata(html);
  }

  getConfig() {
    return this.config;
  }
}

// Re-export everything
export {
  MCPServer,
  API_VERSION,
  MAX_BODY_SIZE,
  MAX_JSON_DEPTH,
  REQUEST_TIMEOUT_MS,
} from './mcp-server.js';
export { CORSEN_CONTEXT_VERSION, MCP_PROTOCOL_VERSION } from './version.js';
export { createLogger, getLogger, setLogger, securityLogger, mcpLogger } from './logger.js';
export type { LogLevel, LoggerOptions, Logger } from './logger.js';
export type { InMemoryPage } from './providers.js';
export type { DiscoveryConfig } from './discovery.js';
export { generateLlmsTxt, generateLlmsFullTxt } from './llms-txt.js';
export {
  generateWebMCPScript,
  toWebMCPTools,
  webMCPAnnotationsFor,
  WEBMCP_TOOL_ANNOTATIONS,
} from './webmcp.js';
export type { WebMCPTool, WebMCPToolAnnotations, WebMCPScriptConfig } from './webmcp.js';
export { parseSitemap, discoverSitemap } from './sitemap.js';
export { htmlToMarkdown, extractMetadata } from './converter.js';
export { MemoryCache } from './cache.js';
export { RedisCache } from './redis-cache.js';
export { RedisRateLimitStore } from './redis-rate-limit.js';
export { adaptIORedisClient } from './redis-client.js';
export {
  RateLimiter,
  MemoryRateLimitStore,
  isPrivateUrl,
  isPrivateIp,
  safeFetch,
  validateApiKey,
  validateOrigin,
  validateHost,
  extractClientIp,
  buildRateLimitKey,
  hashApiKey,
  ApiKeyManager,
  searchParamsSchema,
  getPageParamsSchema,
  listContentParamsSchema,
} from './security.js';
export {
  resolvePublicPageUrl,
  isPublicListItem,
  isPublicPageContent,
  filterPublicPages,
  filterPublicSearchResults,
} from './content-policy.js';
export { createInMemoryProvider, createSitemapProvider } from './providers.js';
export { generateRobotsTxt, generateWellKnownMcp, mcpLinkTag } from './discovery.js';
export { resolveConfig, corsenContextConfigSchema } from './config.js';
export type { CorsenContextConfig, ResolvedConfig } from './config.js';
export type {
  ContentProvider,
  CacheDriver,
  PageContent,
  SearchResult,
  ContentList,
  ContentListItem,
  SitemapEntry,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPCapabilities,
  RateLimitResult,
  RateLimitStore,
  RedisCacheClient,
  RedisClient,
  RedisRateLimitClient,
  IORedisClient,
  ApiKeyRecord,
} from './types.js';
export { CREDIT_LINE, SECURITY_HEADERS, JSONRPC_ERRORS } from './types.js';
