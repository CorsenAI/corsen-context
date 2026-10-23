import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import type { ContentProvider } from '../src/types.js';
import { webMCPAnnotationsFor } from '../src/webmcp.js';
import { mcpAnnotationsFor, toolTitleFor } from '../src/tool-metadata.js';

/**
 * The tool manifest is the single agent-facing contract. Every runtime
 * implements it independently, so this test is what keeps them in sync:
 * if the core drifts from the manifest, CI fails here.
 */

const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '../../../tools.manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  version: number;
  tools: Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: unknown;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    mcpAnnotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
  }>;
};

const emptyProvider: ContentProvider = {
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

describe('tool manifest', () => {
  it('declares a supported contract version', () => {
    expect(manifest.version).toBe(1);
  });

  it('annotates every tool for WebMCP consumers', () => {
    expect(manifest.tools.length).toBeGreaterThan(0);

    for (const tool of manifest.tools) {
      // Every tool Corsen Context exposes is a read of site content.
      expect(tool.annotations.readOnlyHint).toBe(true);
      // Site content comes from authors, comments and imports: an agent
      // must treat tool output as data, never as instructions.
      expect(tool.annotations.untrustedContentHint).toBe(true);
    }
  });
});

describe('core runtime matches the tool manifest', () => {
  const server = new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), emptyProvider);
  const implemented = server.getToolDefinitions();

  it('implements exactly the manifest tools, in order', () => {
    expect(implemented.map((t) => t.name)).toEqual(manifest.tools.map((t) => t.name));
  });

  for (const expected of manifest.tools) {
    describe(expected.name, () => {
      it('matches the manifest description', () => {
        const actual = implemented.find((t) => t.name === expected.name);
        expect(actual?.description).toBe(expected.description);
      });

      it('matches the manifest input schema', () => {
        const actual = implemented.find((t) => t.name === expected.name);
        expect(actual?.inputSchema).toEqual(expected.inputSchema);
      });

      it('matches the manifest title', () => {
        const actual = implemented.find((t) => t.name === expected.name);
        expect(actual?.title).toBe(expected.title);
        expect(toolTitleFor(expected.name)).toBe(expected.title);
      });

      it('matches the manifest MCP annotations', () => {
        const actual = implemented.find((t) => t.name === expected.name);
        expect(actual?.annotations).toEqual(expected.mcpAnnotations);
        expect(mcpAnnotationsFor(expected.name)).toEqual(expected.mcpAnnotations);
      });
    });
  }
});

describe('core WebMCP annotations match the tool manifest', () => {
  for (const expected of manifest.tools) {
    it(`${expected.name} carries the manifest annotations`, () => {
      expect(webMCPAnnotationsFor(expected.name)).toEqual(expected.annotations);
    });
  }
});
