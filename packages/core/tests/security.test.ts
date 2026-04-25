import { describe, it, expect } from 'vitest';
import {
  isPrivateUrl,
  isPrivateIp,
  RateLimiter,
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
  it('extracts from CF-Connecting-IP', () => {
    expect(extractClientIp({ 'cf-connecting-ip': '1.2.3.4' })).toBe('1.2.3.4');
  });

  it('extracts from X-Real-IP', () => {
    expect(extractClientIp({ 'x-real-ip': '5.6.7.8' })).toBe('5.6.7.8');
  });

  it('extracts first IP from X-Forwarded-For', () => {
    expect(extractClientIp({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' })).toBe('1.1.1.1');
  });

  it('falls back to socket IP', () => {
    expect(extractClientIp({}, '9.9.9.9')).toBe('9.9.9.9');
  });

  it('returns unknown when nothing available', () => {
    expect(extractClientIp({})).toBe('unknown');
  });

  it('prioritizes CF > X-Real-IP > XFF > socket', () => {
    expect(
      extractClientIp({
        'cf-connecting-ip': '1.1.1.1',
        'x-real-ip': '2.2.2.2',
        'x-forwarded-for': '3.3.3.3',
      }, '4.4.4.4'),
    ).toBe('1.1.1.1');
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
  it('rejects origins when whitelist is empty', () => {
    expect(validateOrigin('https://evil.com', [])).toBe(false);
  });

  it('validates against whitelist', () => {
    const allowed = ['https://mysite.com', 'https://admin.mysite.com'];
    expect(validateOrigin('https://mysite.com', allowed)).toBe(true);
    expect(validateOrigin('https://evil.com', allowed)).toBe(false);
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
