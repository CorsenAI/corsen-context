import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../src/cache.js';

describe('MemoryCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores and returns a value before expiry', async () => {
    const cache = new MemoryCache({ autoCleanup: false });
    await cache.set('k', { a: 1 }, 60);
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  it('returns null and evicts after TTL elapses', async () => {
    const cache = new MemoryCache({ autoCleanup: false });
    await cache.set('k', 'v', 1);
    vi.advanceTimersByTime(1001);
    expect(await cache.get('k')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('round-trips a falsy value (empty array) distinct from a miss', async () => {
    const cache = new MemoryCache({ autoCleanup: false });
    await cache.set('empty', [], 60);
    const hit = await cache.get('empty');
    expect(hit).toEqual([]); // a real cached empty array, not null
    expect(await cache.get('missing')).toBeNull();
  });

  it('evicts the least-recently-used entry at capacity', async () => {
    const cache = new MemoryCache({ maxEntries: 2, autoCleanup: false });
    // Advance the (faked) clock between ops so lastAccessedAt values differ.
    await cache.set('a', 1, 60);
    vi.advanceTimersByTime(10);
    await cache.set('b', 2, 60);
    vi.advanceTimersByTime(10);
    await cache.get('a'); // 'a' is now most-recently-used; 'b' is oldest
    vi.advanceTimersByTime(10);
    await cache.set('c', 3, 60); // capacity reached -> evict 'b'
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('c')).toBe(3);
  });

  it('delete and clear remove entries', async () => {
    const cache = new MemoryCache({ autoCleanup: false });
    await cache.set('a', 1, 60);
    await cache.delete('a');
    expect(await cache.get('a')).toBeNull();
    await cache.set('b', 2, 60);
    await cache.clear();
    expect(cache.size).toBe(0);
  });
});
