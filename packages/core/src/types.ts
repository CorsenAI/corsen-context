export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  title?: string;
}

export interface PageContent {
  url: string;
  title: string;
  description: string;
  markdown: string;
  lastModified?: string;
  metadata: Record<string, string>;
}

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  snippet: string;
  score: number;
}

export interface ContentListItem {
  url: string;
  title: string;
  description: string;
  type: string;
  lastModified?: string;
}

export interface ContentList {
  items: ContentListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JSONRPCError;
  id: string | number | null;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPCapabilities {
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
}

export interface ContentProvider {
  getPages(): Promise<ContentListItem[]>;
  getPageContent(url: string): Promise<PageContent | null>;
  searchContent(query: string, limit: number): Promise<SearchResult[]>;
}

export interface CacheDriver {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

// --- Rate Limit Store (pluggable backend) ---

export interface RateLimitStore {
  getTimestamps(key: string, windowStart: number): Promise<number[]>;
  addTimestamp(key: string, timestamp: number): Promise<void>;
  cleanup(): Promise<void>;
  /**
   * Optional atomic prune + record + count. When present, the RateLimiter uses
   * this instead of the getTimestamps()/addTimestamp() pair to avoid the
   * check-then-add race. Returns counts that INCLUDE the current request.
   */
  hit?(
    key: string,
    windowStart: number,
    burstWindowStart: number,
    now: number,
  ): Promise<{ windowCount: number; burstCount: number }>;
}

// --- Redis Client Interface (compatible with ioredis, @upstash/redis, etc.) ---

export interface RedisClient {
  get(key: string): Promise<string | null>;
  // Supports both the @upstash/redis object form (`{ ex }`) and the ioredis
  // variadic form (`'EX', seconds`) so TTLs are honored on either client.
  set(
    key: string,
    value: string,
    options?: { ex?: number } | 'EX',
    ttlSeconds?: number,
  ): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number | boolean>;
  // Sorted set commands (for atomic rate limiting)
  zadd(key: string, score: number, member: string): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zcard(key: string): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
}

// --- API Key Record ---

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  keySalt: string;
  scopes: string[];
  quotaPerDay: number; // 0 = unlimited
  requestsToday: number;
  quotaResetAt: string; // ISO timestamp
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
}

export const CREDIT_LINE =
  'Powered by Corsen Context \u2022 Built by Corsen AI \u2022 github.com/CorsenAI/corsen-context';

export const JSONRPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  // Server-defined error (JSON-RPC reserves -32000..-32099 for implementations).
  // Used for auth failures and rate limiting across all adapters.
  UNAUTHORIZED: { code: -32000, message: 'Unauthorized' },
  RATE_LIMITED: { code: -32000, message: 'Rate limit exceeded' },
  RESOURCE_NOT_FOUND: { code: -32002, message: 'Resource not found' },
} as const;

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'",
  'Cache-Control': 'no-store',
  'X-Powered-By': 'Corsen Context / Corsen AI',
};
