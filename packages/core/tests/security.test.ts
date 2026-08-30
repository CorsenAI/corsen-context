import { describe, it, expect } from 'vitest';
import {
  isPrivateUrl,
  isPrivateIp,
  RateLimiter,
  MemoryRateLimitStore,
  validateApiKey,
  validateOrigin,
  validateHost,
  extractClientIp,
  buildRateLimitKey,
  hashApiKey,
  ApiKeyManager,
} from '../src/security.js';

describe('SSRF Protection — isPrivateIp (sync)', () => {
  it('detects private IPv4 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true); // Carrier-grade NAT
  });

  it('allows public IPs', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('203.0.113.1')).toBe(false);
  });

  it('detects private IPv6', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd12::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });
});

describe('SSRF Protection — isPrivateUrl (async, DNS-aware)', () => {
  it('blocks localhost', async () => {
    expect(await isPrivateUrl('http://localhost/api')).toBe(true);
    expect(await isPrivateUrl('http://127.0.0.1/api')).toBe(true);
    expect(await isPrivateUrl('http://[::1]/api')).toBe(true);
  });

  it('blocks private IP ranges', async () => {
    expect(await isPrivateUrl('http://10.0.0.1/api')).toBe(true);
    expect(await isPrivateUrl('http://172.16.0.1/api')).toBe(true);
    expect(await isPrivateUrl('http://192.168.1.1/api')).toBe(true);
    expect(await isPrivateUrl('http://169.254.169.254/latest')).toBe(true);
  });

  it('allows public URLs (DNS resolves to public IP)', async () => {
    expect(await isPrivateUrl('https://example.com/sitemap.xml')).toBe(false);
    expect(await isPrivateUrl('https://8.8.8.8/dns')).toBe(false);
  });

  it('blocks unparseable URLs', async () => {
    expect(await isPrivateUrl('not-a-url')).toBe(true);
  });

  it('blocks URLs that fail DNS resolution (safe fail)', async () => {
    expect(await isPrivateUrl('http://this-domain-does-not-exist-xyzzy123.com/api')).toBe(true);
  });
});

describe('Rate Limiter (async)', () => {
  it('allows requests within limit', async () => {
    const limiter = new RateLimiter(5, 10);
    const result = await limiter.check('client-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests exceeding limit', async () => {
    const limiter = new RateLimiter(3, 10);
    await limiter.check('client-2');
    await limiter.check('client-2');
    await limiter.check('client-2');
    const result = await limiter.check('client-2');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks separate clients independently', async () => {
    const limiter = new RateLimiter(2, 10);
    await limiter.check('client-a');
    await limiter.check('client-a');
    const resultA = await limiter.check('client-a');
    const resultB = await limiter.check('client-b');

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });
});

describe('API Key Validation (simple)', () => {
  it('returns true if no key configured', () => {
    expect(validateApiKey(undefined, undefined)).toBe(true);
    expect(validateApiKey('any-key', undefined)).toBe(true);
  });

  it('returns false if key required but not provided', () => {
    expect(validateApiKey(undefined, 'secret')).toBe(false);
  });

  it('validates matching keys', () => {
    expect(validateApiKey('my-secret', 'my-secret')).toBe(true);
  });

  it('rejects mismatching keys', () => {
    expect(validateApiKey('wrong', 'my-secret')).toBe(false);
  });

  it('rejects different-length keys', () => {
    expect(validateApiKey('short', 'much-longer-key')).toBe(false);
  });
});

describe('API Key Manager (enhanced)', () => {
  it('generates and validates keys', () => {
    const manager = new ApiKeyManager();
    const { plainKey } = manager.generateKey({ name: 'test-key' });

    const result = manager.validate(plainKey);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test-key');
  });

  it('rejects invalid keys', () => {
    const manager = new ApiKeyManager();
    manager.generateKey({ name: 'test-key' });

    expect(manager.validate('csk_wrong_key')).toBeNull();
  });

  it('respects scopes', () => {
    const manager = new ApiKeyManager();
    const { plainKey } = manager.generateKey({ name: 'read-only', scopes: ['read'] });

    expect(manager.validate(plainKey, 'read')).not.toBeNull();
    expect(manager.validate(plainKey, 'write')).toBeNull();
  });

  it('supports wildcard scope', () => {
    const manager = new ApiKeyManager();
    const { plainKey } = manager.generateKey({ name: 'admin', scopes: ['*'] });

    expect(manager.validate(plainKey, 'anything')).not.toBeNull();
  });

  it('revokes keys', () => {
    const manager = new ApiKeyManager();
    const { plainKey, record } = manager.generateKey({ name: 'revocable' });

    expect(manager.validate(plainKey)).not.toBeNull();
    manager.revoke(record.id);
    expect(manager.validate(plainKey)).toBeNull();
  });

  it('enforces expiry', () => {
    const manager = new ApiKeyManager();
    const { plainKey } = manager.generateKey({
      name: 'expired',
      expiresAt: new Date('2020-01-01'),
    });

    expect(manager.validate(plainKey)).toBeNull();
  });

  it('lists keys without secrets', () => {
    const manager = new ApiKeyManager();
    manager.generateKey({ name: 'key-1' });
    manager.generateKey({ name: 'key-2' });

    const list = manager.listKeys();
    expect(list).toHaveLength(2);
    // Ensure no hash/salt leaked
    for (const k of list) {
      expect(k).not.toHaveProperty('keyHash');
      expect(k).not.toHaveProperty('keySalt');
    }
  });
});

describe('API Key Hashing', () => {
  it('produces consistent hashes with same salt', () => {
    const { hash: h1, salt } = hashApiKey('my-key');
    const { hash: h2 } = hashApiKey('my-key', salt);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different keys', () => {
    const salt = 'fixed-salt';
    const { hash: h1 } = hashApiKey('key-a', salt);
    const { hash: h2 } = hashApiKey('key-b', salt);
    expect(h1).not.toBe(h2);
  });
});

describe('Client IP Extraction', () => {
  // With trustProxy=true (behind a reverse proxy that sets forwarding headers).
  it('extracts from CF-Connecting-IP when proxy is trusted', () => {
    expect(extractClientIp({ 'cf-connecting-ip': '1.2.3.4' }, undefined, true)).toBe('1.2.3.4');
  });

  it('extracts from X-Real-IP when proxy is trusted', () => {
    expect(extractClientIp({ 'x-real-ip': '5.6.7.8' }, undefined, true)).toBe('5.6.7.8');
  });

  it('extracts first IP from X-Forwarded-For when proxy is trusted', () => {
    expect(
      extractClientIp({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }, undefined, true),
    ).toBe('1.1.1.1');
  });

  it('prioritizes CF > X-Real-IP > XFF > socket when proxy is trusted', () => {
    expect(
      extractClientIp(
        {
          'cf-connecting-ip': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3',
        },
        '4.4.4.4',
        true,
      ),
    ).toBe('1.1.1.1');
  });

  // Default (trustProxy=false): forwarding headers are attacker-controllable and
  // must be ignored, keying on the socket IP instead.
  it('ignores forwarding headers by default and uses the socket IP', () => {
    expect(
      extractClientIp(
        {
          'cf-connecting-ip': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3',
        },
        '4.4.4.4',
      ),
    ).toBe('4.4.4.4');
  });

  it('falls back to socket IP', () => {
    expect(extractClientIp({}, '9.9.9.9')).toBe('9.9.9.9');
  });

  it('returns unknown when nothing available', () => {
    expect(extractClientIp({})).toBe('unknown');
  });
});

describe('Rate Limit Key Building', () => {
  it('uses hashed API key when present', () => {
    const key = buildRateLimitKey('1.2.3.4', 'my-api-key');
    expect(key).toMatch(/^key:[a-f0-9]{16}$/);
  });

  it('uses IP when no API key', () => {
    expect(buildRateLimitKey('1.2.3.4')).toBe('ip:1.2.3.4');
  });
});

describe('CORS Validation', () => {
  it('allows any origin when whitelist is empty', () => {
    expect(validateOrigin('https://evil.com', [])).toBe(true);
    expect(validateOrigin(undefined, [])).toBe(true);
    expect(validateOrigin('ftp://evil.com', [])).toBe(false);
  });

  it('validates against whitelist', () => {
    const allowed = ['https://mysite.com', 'https://admin.mysite.com'];
    expect(validateOrigin('https://mysite.com', allowed)).toBe(true);
    expect(validateOrigin('https://evil.com', allowed)).toBe(false);
  });

  it('normalizes configured origins, default ports, and trailing paths', () => {
    expect(validateOrigin('https://mysite.com', ['https://mysite.com:443/path/'])).toBe(true);
    expect(validateOrigin('http://mysite.com', ['http://mysite.com:80/'])).toBe(true);
  });

  it('rejects non-HTTP, credential-bearing, opaque, and CRLF origins', () => {
    const allowed = ['https://mysite.com'];
    expect(validateOrigin('https://user:pass@mysite.com', allowed)).toBe(false);
    expect(validateOrigin('null', allowed)).toBe(false);
    expect(validateOrigin('ftp://mysite.com', ['ftp://mysite.com'])).toBe(false);
    expect(validateOrigin('blob:https://mysite.com/id', ['blob:https://mysite.com/id'])).toBe(
      false,
    );
    expect(validateOrigin('https://mysite.com\r\n', allowed)).toBe(false);
    expect(validateOrigin('https://mysite.com', ['https://mysite.com\n'])).toBe(false);
    expect(validateOrigin('https://mysite.com', ['https://user:pass@mysite.com'])).toBe(false);
  });

  it('rejects missing origin when whitelist is set', () => {
    expect(validateOrigin(undefined, ['https://mysite.com'])).toBe(false);
  });
});

describe('Host Validation', () => {
  it('validates matching host', () => {
    expect(validateHost('example.com', 'https://example.com')).toBe(true);
  });

  it('rejects mismatching host', () => {
    expect(validateHost('evil.com', 'https://example.com')).toBe(false);
  });

  it('rejects missing host', () => {
    expect(validateHost(undefined, 'https://example.com')).toBe(false);
  });
});

describe('SSRF — IPv6 and encoded IPv4', () => {
  it('detects IPv6 loopback, ULA, and link-local (full fe80::/10)', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd12:3456::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('feaf::1')).toBe(true); // still link-local (fe80::/10)
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // public
  });

  it('detects IPv4-mapped and IPv4-embedded IPv6 pointing at private space', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
  });

  it('blocks IPv6 literal loopback/link-local via isPrivateUrl', async () => {
    // IPv6 literals need no DNS, so these are deterministic across environments.
    expect(await isPrivateUrl('http://[::1]/')).toBe(true);
    expect(await isPrivateUrl('http://[::ffff:169.254.169.254]/')).toBe(true);
    expect(await isPrivateUrl('http://localhost/')).toBe(true);
    expect(await isPrivateUrl('http://127.0.0.1/')).toBe(true);
  });

  // Note: decimal/hex/octal-encoded IPv4 (e.g. http://2130706433/) is blocked at
  // runtime because safeFetch/isPrivateUrl resolve via getaddrinfo, which
  // normalizes them to 127.0.0.1 — but that normalization is OS-resolver
  // dependent, so it isn't asserted here to keep the suite deterministic.
});

describe('ApiKeyManager — quota', () => {
  it('blocks once the daily quota is reached', () => {
    const mgr = new ApiKeyManager();
    const { plainKey } = mgr.generateKey({ name: 'q', quotaPerDay: 2 });
    expect(mgr.validate(plainKey)).not.toBeNull(); // 1
    expect(mgr.validate(plainKey)).not.toBeNull(); // 2
    expect(mgr.validate(plainKey)).toBeNull(); // over quota
  });

  it('rejects revoked and expired keys', () => {
    const mgr = new ApiKeyManager();
    const { plainKey, record } = mgr.generateKey({ name: 'r' });
    expect(mgr.validate(plainKey)).not.toBeNull();
    mgr.revoke(record.id);
    expect(mgr.validate(plainKey)).toBeNull();

    const expired = mgr.generateKey({ name: 'e', expiresAt: new Date(Date.now() - 1000) });
    expect(mgr.validate(expired.plainKey)).toBeNull();
  });

  it('enforces scopes', () => {
    const mgr = new ApiKeyManager();
    const { plainKey } = mgr.generateKey({ name: 's', scopes: ['read'] });
    expect(mgr.validate(plainKey, 'read')).not.toBeNull();
    expect(mgr.validate(plainKey, 'write')).toBeNull();
  });
});

describe('RateLimiter — window and burst boundaries', () => {
  it('allows up to the per-minute limit then blocks (memory atomic hit path)', async () => {
    const limiter = new RateLimiter(3, 100);
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) results.push((await limiter.check('ip:a')).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('enforces the burst limit within a second', async () => {
    const limiter = new RateLimiter(1000, 2);
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await limiter.check('ip:b')).allowed);
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
    expect(results[2]).toBe(false); // 3rd within 1s exceeds burst=2
  });

  it('reports remaining count in the result', async () => {
    const limiter = new RateLimiter(5, 100);
    const first = await limiter.check('ip:c');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);
  });
});

describe('MemoryRateLimitStore — bounded growth', () => {
  it('caps the number of tracked keys (evicts oldest)', async () => {
    const store = new MemoryRateLimitStore({ maxKeys: 10, autoCleanup: false });
    const limiter = new RateLimiter(100, 100, store);
    // Simulate an attacker rotating the key so each request is a new bucket.
    for (let i = 0; i < 100; i++) {
      await limiter.check(`key:${i}`);
    }
    expect(store.size).toBeLessThanOrEqual(10);
    store.destroy();
  });
});
