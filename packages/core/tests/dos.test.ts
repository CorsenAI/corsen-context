import { describe, it, expect } from 'vitest';
import { MCPServer, validateBodySize, MAX_BODY_SIZE } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import type { ContentProvider } from '../src/types.js';

const provider: ContentProvider = {
  async getPages() {
    return [];
  },
  async getPageContent() {
    return null;
  },
  async searchContent() {
    return [];
  },
};

function server() {
  return new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), provider);
}

describe('DoS guards', () => {
  it('validateBodySize throws over the limit', () => {
    const big = { jsonrpc: '2.0', method: 'ping', id: 1, params: { blob: 'x'.repeat(MAX_BODY_SIZE) } };
    expect(() => validateBodySize(big)).toThrow('Request body too large');
    expect(() => validateBodySize({ jsonrpc: '2.0', method: 'ping', id: 1 })).not.toThrow();
  });

  it('rejects an oversized request body via handleRequest', async () => {
    const big = { jsonrpc: '2.0', method: 'ping', id: 1, params: { blob: 'x'.repeat(MAX_BODY_SIZE) } };
    const res = await server().handleRequest(big);
    expect(res!.error).toBeDefined();
    expect(res!.error!.message).toBe('Request body too large');
  });

  it('rejects an over-nested request body via handleRequest', async () => {
    // Build nesting deeper than MAX_JSON_DEPTH (10).
    let deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 15; i++) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    const res = await server().handleRequest({ jsonrpc: '2.0', method: 'ping', id: 1, params: deep });
    expect(res!.error).toBeDefined();
    expect(res!.error!.message).toBe('JSON nesting too deep');
  });
});
