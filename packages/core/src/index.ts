import type pino from 'pino';
import type { ContentProvider, CacheDriver, RateLimitStore } from './types.js';
import type { CorsenContextConfig } from './config.js';
import { resolveConfig } from './config.js';
import { MCPServer } from './mcp-server.js';
import { generateLlmsTxt, generateLlmsFullTxt } from './llms-txt.js';
import { parseSitemap, discoverSitemap } from './sitemap.js';
import { htmlToMarkdown, extractMetadata } from './converter.js';
import { MemoryCache } from './cache.js';

export class CorsenContext {
  private config;
  private provider: ContentProvider;
  private cache: CacheDriver;

  constructor(
    userConfig: CorsenContextConfig,
    provider: ContentProvider,
    cache?: CacheDriver,
  ) {
    this.config = resolveConfig(userConfig);
    this.provider = provider;
    this.cache = cache || new MemoryCache();
  }

  async generateLlmsTxt(): Promise<string> {
    return generateLlmsTxt(this.config, this.provider);
  }

  async generateLlmsFullTxt(): Promise<string> {
    return generateLlmsFullTxt(this.config, this.provider);
  }

  createMCPServer(options?: { rateLimitStore?: RateLimitStore; logger?: pino.Logger }): MCPServer {
    return new MCPServer(this.config, this.provider, {
      cache: this.cache,
      rateLimitStore: options?.rateLimitStore,
      logger: options?.logger,
    });
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
export { MCPServer, API_VERSION, MAX_BODY_SIZE, MAX_JSON_DEPTH, REQUEST_TIMEOUT_MS } from './mcp-server.js';
export { createLogger, getLogger, setLogger, securityLogger, mcpLogger } from './logger.js';
export type { LogLevel, LoggerOptions } from './logger.js';
export { generateLlmsTxt, generateLlmsFullTxt } from './llms-txt.js';
export { parseSitemap, discoverSitemap } from './sitemap.js';
export { htmlToMarkdown, extractMetadata } from './converter.js';
export { MemoryCache } from './cache.js';
export { RedisCache } from './redis-cache.js';
export { RedisRateLimitStore } from './redis-rate-limit.js';
export {
  RateLimiter,
  MemoryRateLimitStore,
  isPrivateUrl,
  isPrivateIp,
  safeFetch,
  validateApiKey,
  validateOrigin,
  extractClientIp,
  buildRateLimitKey,
  hashApiKey,
  ApiKeyManager,
} from './security.js';
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
  RedisClient,
  ApiKeyRecord,
} from './types.js';
export { CREDIT_LINE, SECURITY_HEADERS, JSONRPC_ERRORS } from './types.js';
