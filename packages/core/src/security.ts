import { timingSafeEqual, createHash, createHmac, randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';
import { z } from 'zod';
import type { RateLimitResult, JSONRPCRequest, RateLimitStore, ApiKeyRecord } from './types.js';

// --- SSRF Protection (DNS-aware) ---

/**
 * Check if an IP address is private/internal.
 * Sync function — works on resolved IPs, not hostnames.
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
  if (lower === '::1' || lower === '::') {
    return true;
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    // Unique local addresses fc00::/7
    return true;
  }
  // Link-local fe80::/10 — the first hextet is fe80–febf (top 2 bits of the
  // 3rd nibble are 10), not just the literal "fe80" prefix.
  const firstHextet = lower.split(':')[0];
  if (/^fe[89ab][0-9a-f]?$/.test(firstHextet)) {
    return true;
  }
  // IPv4-mapped in dotted form (::ffff:a.b.c.d) and IPv4-embedded (::a.b.c.d)
  // — recurse on the trailing dotted-quad so the IPv4 rules above apply.
  const embeddedIpv4 = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (embeddedIpv4 && lower.includes(':')) {
    return isPrivateIp(embeddedIpv4[1]);
  }

  // IPv4-mapped in canonical hex form (::ffff:a9fe:a9fe) — the form Node's URL
  // parser normalizes ::ffff:169.254.169.254 to. Decode the last two hextets.
  const mappedHex = lower.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return isPrivateIp(dotted);
  }

  return false;
}

/**
 * Check if a URL points to a private/internal address.
 * ASYNC — resolves DNS to prevent DNS rebinding attacks (OWASP SSRF 2026).
 *
 * Flow: parse URL → check hostname literally → resolve DNS → check resolved IPs.
 */
export async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // Quick check on the hostname itself (catches literals like 127.0.0.1, localhost, ::1)
    if (hostname === 'localhost' || isPrivateIp(hostname)) {
      return true;
    }

    // Resolve DNS to get the actual IP — this defeats DNS rebinding
    try {
      const results = await dns.lookup(hostname, { all: true });
      for (const { address } of results) {
        if (isPrivateIp(address)) {
          return true;
        }
      }
    } catch {
      // DNS resolution failed — block by default (safe fail)
      return true;
    }

    return false;
  } catch {
    // URL parsing failed — block by default
    return true;
  }
}

// --- Safe Fetch (DNS-pinned, defeats DNS rebinding) ---

// Lazily-loaded undici Agent factory. When undici is available, safeFetch pins
// the socket to a pre-vetted IP while keeping the real hostname for TLS/SNI —
// which defeats DNS rebinding without breaking certificate validation. When it
// is not available, safeFetch still resolves + verifies every IP is public
// (fail-closed) before fetching the original URL.
let undiciAgentFactory: ((ip: string, family: number) => unknown) | null | undefined;

async function getUndiciAgentFactory(): Promise<((ip: string, family: number) => unknown) | null> {
  if (undiciAgentFactory !== undefined) return undiciAgentFactory;
  try {
    // Variable specifier: undici is an optional peer, so avoid a static import
    // that would require its type declarations at build time or bundle it in.
    const undiciModule = 'undici';
    const undici = (await import(undiciModule)) as {
      Agent: new (opts: unknown) => unknown;
    };
    undiciAgentFactory = (ip: string, family: number) =>
      new undici.Agent({
        connect: {
          // Force every connection for this request to the vetted IP.
          lookup(_hostname: string, opts: { all?: boolean }, cb: CallableFunction) {
            if (opts && opts.all) cb(null, [{ address: ip, family }]);
            else cb(null, ip, family);
          },
        },
      });
  } catch {
    undiciAgentFactory = null;
  }
  return undiciAgentFactory;
}

/**
 * Fetch a URL with SSRF protection.
 *
 * 1. Parse URL, reject literal localhost / private IPs.
 * 2. Resolve DNS and verify EVERY resolved IP is public (fail-closed).
 * 3. If undici is available, pin the connection to the vetted IP at the socket
 *    level (keeping the hostname for TLS/SNI) so a rebind can't redirect the
 *    request. Otherwise fetch the original URL — TLS still validates against the
 *    real hostname, with a narrow residual rebinding window.
 * 4. Never follow redirects (`redirect: 'error'`).
 */
export async function safeFetch(
  url: string,
  options?: RequestInit & { timeout?: number },
): Promise<Response> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SSRF protection: only http(s) URLs are allowed');
  }

  // Quick check: literal IPs and localhost
  if (hostname === 'localhost' || isPrivateIp(hostname)) {
    throw new Error('SSRF protection: cannot fetch private/internal URLs');
  }

  // Resolve DNS once and verify every resolved IP is public.
  let resolvedIp: string;
  try {
    const results = await dns.lookup(hostname, { all: true });
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        throw new Error('SSRF protection: DNS resolved to private IP');
      }
    }
    resolvedIp = results[0].address;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SSRF')) throw err;
    throw new Error('SSRF protection: DNS resolution failed (fail-closed)', { cause: err });
  }

  const family = resolvedIp.includes(':') ? 6 : 4;
  const agentFactory = await getUndiciAgentFactory();
  const dispatcher = agentFactory ? agentFactory(resolvedIp, family) : undefined;

  // Fetch the ORIGINAL url so TLS/SNI and cert validation use the real
  // hostname. The dispatcher (when present) pins the socket to the vetted IP.
  return fetch(url, {
    ...options,
    ...(dispatcher ? { dispatcher } : {}),
    signal: options?.signal ?? AbortSignal.timeout(options?.timeout ?? 10000),
    redirect: 'error',
  } as RequestInit);
}

// --- Rate Limiting (sliding window) ---

interface RateLimitEntry {
  timestamps: number[];
}

/**
 * In-memory rate limit store. Default for development / single-instance.
 * For production multi-instance, use RedisRateLimitStore.
 *
 * The store is long-lived (shared across requests), so it self-bounds: expired
 * keys are pruned on a periodic timer and the key count is capped (oldest-first
 * eviction). This prevents an attacker who rotates the rate-limit key — e.g. a
 * fresh Authorization header per request — from growing the Map without bound.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxKeys: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { maxKeys?: number; autoCleanup?: boolean }) {
    this.maxKeys = options?.maxKeys ?? 100_000;
    if (options?.autoCleanup !== false) {
      this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
      if (
        this.cleanupTimer &&
        typeof this.cleanupTimer === 'object' &&
        'unref' in this.cleanupTimer
      ) {
        this.cleanupTimer.unref();
      }
    }
  }

  /** Number of tracked keys. */
  get size(): number {
    return this.store.size;
  }

  /** Stop the cleanup timer (for graceful shutdown or tests). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Evict the oldest-inserted keys until under the cap (after a prune pass). */
  private enforceCap(): void {
    if (this.store.size < this.maxKeys) return;
    this.cleanup();
    while (this.store.size >= this.maxKeys) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

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
      this.enforceCap();
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }
    entry.timestamps.push(timestamp);
  }

  /**
   * Atomic prune + record + count. Runs synchronously (no await between the
   * prune and the append), so concurrent requests on the same tick cannot
   * interleave a check between another request's read and write — the TOCTOU
   * race the split getTimestamps()/addTimestamp() path has.
   */
  async hit(
    key: string,
    windowStart: number,
    burstWindowStart: number,
    now: number,
  ): Promise<{ windowCount: number; burstCount: number }> {
    let entry = this.store.get(key);
    if (!entry) {
      this.enforceCap();
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    entry.timestamps.push(now);
    const windowCount = entry.timestamps.length;
    const burstCount = entry.timestamps.filter((t) => t > burstWindowStart).length;
    return { windowCount, burstCount };
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

    // Prefer the atomic combined path when the store provides it (defeats the
    // check-then-add TOCTOU race). Fall back to the two-step API otherwise.
    if (this.store.hit) {
      const { windowCount, burstCount } = await this.store.hit(
        key,
        windowStart,
        burstWindowStart,
        now,
      );
      // Counts already include the current request.
      if (burstCount > this.burstLimit) {
        return { allowed: false, remaining: 0, resetAt: burstWindowStart + 1000, retryAfter: 1 };
      }
      if (windowCount > this.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: now + this.windowMs,
          retryAfter: Math.max(1, Math.ceil(this.windowMs / 1000)),
        };
      }
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - windowCount),
        resetAt: now + this.windowMs,
      };
    }

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
 * Extract the real client IP from request headers.
 *
 * Forwarding headers (CF-Connecting-IP, X-Real-IP, X-Forwarded-For) are only
 * honored when `trustProxy` is true — i.e. the server sits behind a reverse
 * proxy that sets them. Otherwise they are attacker-controllable: a client can
 * send a fresh spoofed value per request and land in a new rate-limit bucket
 * every time, defeating the limiter. When untrusted, we key on the socket IP.
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketIp?: string,
  trustProxy: boolean = false,
): string {
  if (trustProxy) {
    // Cloudflare
    const cfIp = headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp) return cfIp.trim();

    // X-Real-IP (nginx)
    const realIp = headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp) return realIp.trim();

    // X-Forwarded-For (first = original client, set by the trusted proxy)
    const xff = headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }

  return socketIp || 'unknown';
}

// --- Rate Limit Key ---

/** Fixed (non-secret) label for deriving rate-limit bucket ids. */
const RATE_LIMIT_KEY_LABEL = 'corsen-context:ratelimit-bucket';

/**
 * Build rate limit key. Uses API key if present (more accurate), falls back to IP.
 *
 * The API key is run through a keyed hash (HMAC) purely to derive a stable,
 * non-reversible bucket id — it is a store/log key, not credential storage.
 * The fixed label keeps the id deterministic across instances so a distributed
 * (Redis) limiter shares state for the same key.
 */
export function buildRateLimitKey(clientIp: string, apiKey?: string): string {
  if (apiKey) {
    return `key:${createHmac('sha256', RATE_LIMIT_KEY_LABEL).update(apiKey).digest('hex').slice(0, 16)}`;
  }
  return `ip:${clientIp}`;
}

// --- Input Validation ---

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1).max(100),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
});

export const initializeParamsSchema = z
  .object({
    protocolVersion: boundedUnicodeString(1, 50),
    capabilities: z.record(z.unknown()),
    clientInfo: z
      .object({
        name: boundedUnicodeString(1, 200),
        version: boundedUnicodeString(1, 100),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * JSON Schema string lengths are measured in Unicode code points, whereas
 * JavaScript's String#length and Zod's built-in max() count UTF-16 code units.
 */
function boundedUnicodeString(minimum: number, maximum: number) {
  return z.string().refine(
    (value) => {
      const length = Array.from(value).length;
      return length >= minimum && length <= maximum;
    },
    { message: `String must contain between ${minimum} and ${maximum} Unicode code points` },
  );
}

export const searchParamsSchema = z
  .object({
    query: boundedUnicodeString(1, 500),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export const getPageParamsSchema = z
  .object({
    uri: boundedUnicodeString(1, 2000),
  })
  .strict();

export const listContentParamsSchema = z
  .object({
    type: boundedUnicodeString(1, 50).default('page'),
    page: z.number().int().min(1).max(5000).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export const getSitemapParamsSchema = z.object({}).strict();

export function validateJsonRpcRequest(body: unknown): JSONRPCRequest {
  return jsonRpcRequestSchema.parse(body) as JSONRPCRequest;
}

// --- CORS ---

function canonicalHttpOrigin(value: string): string | null {
  if (/[\r\n]/.test(value)) return null;

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.origin === 'null'
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function validateOrigin(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return allowed.length === 0;
  const candidate = canonicalHttpOrigin(origin);
  if (!candidate) return false;
  if (allowed.length === 0) return true;

  return allowed.some((value) => {
    const configured = canonicalHttpOrigin(value);
    return configured !== null && configured === candidate;
  });
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
 * Timing-safe API key validation via the double-HMAC compare pattern.
 *
 * Both keys are HMAC'd with a fresh per-call random key, yielding fixed-length
 * digests that are compared with timingSafeEqual. This leaks neither key length
 * nor content through timing, and (unlike a bare hash) an attacker cannot
 * precompute the digests.
 */
export function validateApiKey(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return true; // No key configured = public
  if (!provided) return false;

  const compareKey = randomBytes(32);
  const a = createHmac('sha256', compareKey).update(provided).digest();
  const b = createHmac('sha256', compareKey).update(expected).digest();

  return timingSafeEqual(a, b);
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

      // Check key match — timing-safe comparison of hex hashes
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
    return Array.from(this.keys.values()).map(({ keyHash, keySalt, ...rest }) => rest);
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
