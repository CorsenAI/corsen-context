import { timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { z } from 'zod';
import type { RateLimitResult, JSONRPCRequest, RateLimitStore, ApiKeyRecord } from './types.js';

// --- SSRF Protection (DNS-aware) ---

/**
 * Check if an IP address is private/internal.
 * Sync function â€” works on resolved IPs, not hostnames.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 simple prefixes
  if (
    ip.startsWith('10.') ||
    ip.startsWith('127.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('0.') ||
    ip === '0.0.0.0'
  ) {
    return true;
  }

  // IPv4 complex ranges
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 198.18.0.0/15 (benchmark testing)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  }

  // IPv6
  const lower = ip.toLowerCase();
  if (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') || // ULA fc00::/7
    lower.startsWith('fd') || // ULA fc00::/7
    lower.startsWith('fe80') || // link-local
    lower.startsWith('::ffff:') // IPv4-mapped
  ) {
    return true;
  }

  return false;
}

/**
 * Check if a URL points to a private/internal address.
 * ASYNC â€” resolves DNS to prevent DNS rebinding attacks (OWASP SSRF 2026).
 *
 * Flow: parse URL â†’ check hostname literally â†’ resolve DNS â†’ check resolved IPs.
 */
export async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // Quick check on the hostname itself (catches literals like 127.0.0.1, localhost, ::1)
    if (hostname === 'localhost' || isPrivateIp(hostname)) {
      return true;
    }

    // Resolve DNS to get the actual IP â€” this defeats DNS rebinding
    try {
      const results = await dns.lookup(hostname, { all: true });
      for (const { address } of results) {
        if (isPrivateIp(address)) {
          return true;
        }
      }
    } catch {
      // DNS resolution failed â€” block by default (safe fail)
      return true;
    }

    return false;
  } catch {
    // URL parsing failed â€” block by default
    return true;
  }
}

// --- Safe Fetch (DNS-checked, redirect-blocking) ---

/**
 * Fetch a URL after resolving and validating DNS.
 *
 * Flow:
 * 1. Parse URL â†’ extract hostname
 * 2. Resolve DNS â†’ get IP(s)
 * 3. Check ALL resolved IPs are public
 * 4. Use a pinned lookup result while preserving hostname and TLS SNI
 * 5. Reject redirects and enforce timeout
 *
 * Keeping the original hostname preserves TLS SNI, while the custom lookup prevents
 * a second DNS resolution from changing the target after validation.
 */
export async function safeFetch(
  url: string,
  options?: RequestInit & { timeout?: number },
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('SSRF protection: only http and https URLs are allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Quick check: literal IPs and localhost
  if (hostname === 'localhost' || isPrivateIp(hostname)) {
    throw new Error('SSRF protection: cannot fetch private/internal URLs');
  }

  // Resolve DNS once
  let resolved: { address: string; family: 4 | 6 };
  try {
    const results = await dns.lookup(hostname, { all: true });
    if (results.length === 0) {
      throw new Error('SSRF protection: DNS resolution returned no addresses');
    }
    // Check ALL resolved IPs
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        throw new Error('SSRF protection: DNS resolved to private IP');
      }
    }
    // Use the first public address for the request, pinned via custom lookup.
    resolved = {
      address: results[0].address,
      family: results[0].family === 6 ? 6 : 4,
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SSRF')) throw err;
    throw new Error('SSRF protection: DNS resolution failed (fail-closed)');
  }

  const headers = new Headers(options?.headers);
  headers.set('Host', parsed.host);
  if (!headers.has('Accept-Encoding')) {
    headers.set('Accept-Encoding', 'identity');
  }

  const body = await normalizeRequestBody(options?.body);
  const timeoutMs = options?.timeout ?? 10000;
  const lookup = ((_host: string, optionsOrCallback: unknown, maybeCallback?: unknown) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (typeof callback !== 'function') {
      throw new Error('SSRF protection: DNS lookup callback missing');
    }
    const wantsAll =
      typeof optionsOrCallback === 'object' &&
      optionsOrCallback !== null &&
      'all' in optionsOrCallback &&
      optionsOrCallback.all === true;
    if (wantsAll) {
      callback(null, [{ address: resolved.address, family: resolved.family }]);
      return;
    }
    callback(null, resolved.address, resolved.family);
  }) as LookupFunction;

  return new Promise<Response>((resolve, reject) => {
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requestFn(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options?.method || 'GET',
        headers: Object.fromEntries(headers.entries()),
        servername: parsed.hostname,
        lookup,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          reject(new Error('Redirects are not allowed'));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 0,
              statusText: res.statusMessage,
              headers: normalizeResponseHeaders(res.headers),
            }),
          );
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);

    options?.signal?.addEventListener(
      'abort',
      () => {
        req.destroy(new Error('Request aborted'));
      },
      { once: true },
    );

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function normalizeRequestBody(body: RequestInit['body']): Promise<string | Uint8Array | undefined> {
  if (body == null) return undefined;
  if (typeof body === 'string' || body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  throw new Error('safeFetch only supports string, URLSearchParams, Blob, ArrayBuffer, or Uint8Array bodies');
}

function normalizeResponseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized.set(key, value);
    } else if (Array.isArray(value)) {
      normalized.set(key, value.join(', '));
    }
  }
  return normalized;
}

// --- Rate Limiting (sliding window) ---

interface RateLimitEntry {
  timestamps: number[];
}

/**
 * In-memory rate limit store. Default for development / single-instance.
 * For production multi-instance, use RedisRateLimitStore.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  async getTimestamps(key: string, windowStart: number): Promise<number[]> {
    const entry = this.store.get(key);
    if (!entry) return [];
    // Prune old entries
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    if (entry.timestamps.length === 0) {
      this.store.delete(key);
      return [];
    }
    return entry.timestamps;
  }

  async addTimestamp(key: string, timestamp: number): Promise<void> {
    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }
    entry.timestamps.push(timestamp);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60_000;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

export class RateLimiter {
  private store: RateLimitStore;
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly burstLimit: number;

  constructor(
    maxRequestsPerMinute: number = 100,
    burstPerSecond: number = 10,
    store?: RateLimitStore,
  ) {
    this.windowMs = 60_000;
    this.maxRequests = maxRequestsPerMinute;
    this.burstLimit = burstPerSecond;
    this.store = store || new MemoryRateLimitStore();
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const burstWindowStart = now - 1000;

    const timestamps = await this.store.getTimestamps(key, windowStart);

    // Check burst limit (per second)
    const burstCount = timestamps.filter((t) => t > burstWindowStart).length;
    if (burstCount >= this.burstLimit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: burstWindowStart + 1000,
        retryAfter: 1,
      };
    }

    // Check rate limit (per minute)
    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestInWindow + this.windowMs,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    await this.store.addTimestamp(key, now);
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length - 1,
      resetAt: now + this.windowMs,
    };
  }
}

// --- Client IP Extraction ---

/**
 * Extract real client IP from request headers.
 * Handles X-Forwarded-For, X-Real-IP, CF-Connecting-IP (Cloudflare).
 * Falls back to provided socket IP.
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketIp?: string,
): string {
  // Cloudflare
  const cfIp = headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp) return cfIp.trim();

  // X-Real-IP (nginx)
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp.trim();

  // X-Forwarded-For (first = original client)
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  return socketIp || 'unknown';
}

// --- Rate Limit Key ---

/**
 * Build rate limit key. Uses API key if present (more accurate), falls back to IP.
 */
export function buildRateLimitKey(clientIp: string, apiKey?: string): string {
  if (apiKey) {
    // Hash the API key for privacy in logs/stores
    return `key:${createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
  }
  return `ip:${clientIp}`;
}

// --- Input Validation ---

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1).max(100),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

export const searchParamsSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(10),
});

export const getPageParamsSchema = z.object({
  uri: z.string().min(1).max(2000),
});

export const listContentParamsSchema = z.object({
  type: z.string().min(1).max(50).default('page'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export function validateJsonRpcRequest(body: unknown): JSONRPCRequest {
  return jsonRpcRequestSchema.parse(body) as JSONRPCRequest;
}

// --- CORS ---

export function validateOrigin(origin: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  if (!origin) return false;
  return allowed.includes(origin);
}

// --- Host Validation ---

export function validateHost(hostHeader: string | undefined, expectedHost: string): boolean {
  if (!hostHeader) return false;
  const expected = new URL(expectedHost).host;
  return hostHeader === expected;
}

// --- API Key Validation ---

/**
 * Hash an API key with SHA-256 + salt for secure storage.
 */
export function hashApiKey(key: string, salt?: string): { hash: string; salt: string } {
  const keySalt = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(keySalt + key)
    .digest('hex');
  return { hash, salt: keySalt };
}

/**
 * Simple timing-safe API key validation.
 * Compares SHA-256 hashes to avoid leaking key length via timing.
 */
export function validateApiKey(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true; // No key configured = public
  if (!provided) return false;

  // Hash both keys so we always compare fixed-length strings (64 hex chars).
  // This prevents timing leaks on key length differences.
  const hashA = createHash('sha256').update(provided).digest();
  const hashB = createHash('sha256').update(expected).digest();

  return timingSafeEqual(hashA, hashB);
}

/**
 * Enhanced API key validation with hashed keys, scopes, quotas, expiry.
 * For production multi-key setups.
 */
export class ApiKeyManager {
  private keys: Map<string, ApiKeyRecord> = new Map();

  /**
   * Register a new API key. Returns the plain key (show to user once).
   */
  generateKey(options: {
    name: string;
    scopes?: string[];
    quotaPerDay?: number;
    expiresAt?: Date;
  }): { plainKey: string; record: ApiKeyRecord } {
    const plainKey = `csk_${randomBytes(32).toString('base64url')}`;
    const { hash, salt } = hashApiKey(plainKey);

    const record: ApiKeyRecord = {
      id: randomBytes(8).toString('hex'),
      name: options.name,
      keyHash: hash,
      keySalt: salt,
      scopes: options.scopes || ['*'],
      quotaPerDay: options.quotaPerDay || 0, // 0 = unlimited
      requestsToday: 0,
      quotaResetAt: this.nextMidnight(),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: options.expiresAt?.toISOString() || null,
      revoked: false,
    };

    this.keys.set(record.id, record);
    return { plainKey, record };
  }

  /**
   * Validate a provided API key against stored records.
   * Returns the matching record or null.
   */
  validate(providedKey: string, requiredScope?: string): ApiKeyRecord | null {
    for (const record of this.keys.values()) {
      if (record.revoked) continue;

      // Check expiry
      if (record.expiresAt && new Date(record.expiresAt) < new Date()) continue;

      // Check key match â€” timing-safe comparison of hex hashes
      const { hash } = hashApiKey(providedKey, record.keySalt);
      if (!timingSafeEqual(Buffer.from(hash), Buffer.from(record.keyHash))) continue;

      // Check scope
      if (requiredScope && !record.scopes.includes('*') && !record.scopes.includes(requiredScope)) {
        continue;
      }

      // Check daily quota
      if (record.quotaPerDay > 0) {
        if (new Date() > new Date(record.quotaResetAt)) {
          record.requestsToday = 0;
          record.quotaResetAt = this.nextMidnight();
        }
        if (record.requestsToday >= record.quotaPerDay) {
          continue;
        }
        record.requestsToday++;
      }

      // Update last used
      record.lastUsedAt = new Date().toISOString();
      return record;
    }

    return null;
  }

  /**
   * Revoke an API key by ID.
   */
  revoke(keyId: string): boolean {
    const record = this.keys.get(keyId);
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  /**
   * List all keys (without secrets).
   */
  listKeys(): Omit<ApiKeyRecord, 'keyHash' | 'keySalt'>[] {
    return Array.from(this.keys.values()).map(({ keyHash: _keyHash, keySalt: _keySalt, ...rest }) => rest);
  }

  /**
   * Load keys from external storage (e.g., Redis, database).
   */
  loadKeys(records: ApiKeyRecord[]): void {
    for (const record of records) {
      this.keys.set(record.id, record);
    }
  }

  private nextMidnight(): string {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
  }
}
