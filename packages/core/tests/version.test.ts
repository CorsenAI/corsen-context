import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CORSEN_CONTEXT_VERSION, MCP_PROTOCOL_VERSION } from '../src/version.js';

/**
 * CORSEN_CONTEXT_VERSION is bumped by hand; this test is the safety net that
 * keeps the runtime-reported version from drifting away from the published
 * package version again.
 */
describe('version constants', () => {
  it('CORSEN_CONTEXT_VERSION matches the core package version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(CORSEN_CONTEXT_VERSION).toBe(pkg.version);
  });

  it('MCP_PROTOCOL_VERSION stays a dated protocol identifier', () => {
    expect(MCP_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
