import { describe, expect, it } from 'vitest';
import { withCorsenContext } from '../src/with-corsen-context.js';

describe('withCorsenContext', () => {
  it('never serializes server configuration or API keys into nextConfig.env', () => {
    const wrapped = withCorsenContext({
      siteUrl: 'https://example.com',
      security: { apiKey: 'sentinel-server-secret' },
    })({});

    expect(wrapped.env).toBeUndefined();
    expect(JSON.stringify(wrapped)).not.toContain('sentinel-server-secret');
    expect(JSON.stringify(wrapped)).not.toContain('CORSEN_CONTEXT_CONFIG');
  });

  it('adds only the owner-enabled static rewrites', async () => {
    const defaults = withCorsenContext({ siteUrl: 'https://example.com' })({});
    const full = withCorsenContext({
      siteUrl: 'https://example.com',
      static: { includeFullContent: true },
    })({});
    const disabled = withCorsenContext({
      siteUrl: 'https://example.com',
      static: { generateLlmsTxt: false, includeFullContent: true },
    })({});

    await expect(defaults.rewrites?.()).resolves.toEqual([
      { source: '/llms.txt', destination: '/api/corsen-context/llms-txt' },
    ]);
    await expect(full.rewrites?.()).resolves.toEqual([
      { source: '/llms.txt', destination: '/api/corsen-context/llms-txt' },
      { source: '/llms-full.txt', destination: '/api/corsen-context/llms-full-txt' },
    ]);
    await expect(disabled.rewrites?.()).resolves.toEqual([]);
  });

  it('preserves an existing environment object without adding Corsen values', () => {
    const wrapped = withCorsenContext({ siteUrl: 'https://example.com' })({
      env: { PUBLIC_FLAG: 'visible' },
    });

    expect(wrapped.env).toEqual({ PUBLIC_FLAG: 'visible' });
  });
});
