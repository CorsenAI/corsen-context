import type { MCPToolAnnotations } from './types.js';

/**
 * One table for every agent-facing surface. MCP `tools/list` and the WebMCP
 * registration both read it, so the two can never disagree about which tools
 * only read. Before this table existed the MCP definitions declared no hints
 * at all, and clients applied the protocol defaults (`readOnlyHint: false`,
 * `destructiveHint: true`) to a site search.
 *
 * Every tool Corsen Context exposes reads published site content, so all of
 * them are read-only, idempotent, non-destructive and closed-world. An unknown
 * name gets the opposite, which is also what the MCP defaults say about a tool
 * that declares nothing.
 */
export const TOOL_TITLES: Readonly<Record<string, string>> = Object.freeze({
  search_site: 'Search site',
  get_page_content: 'Read a page',
  list_content: 'List content',
  get_sitemap: 'Sitemap',
});

const READ_ONLY_TOOL: MCPToolAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const UNKNOWN_TOOL: MCPToolAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
});

export const MCP_TOOL_ANNOTATIONS: Readonly<Record<string, MCPToolAnnotations>> = Object.freeze({
  search_site: READ_ONLY_TOOL,
  get_page_content: READ_ONLY_TOOL,
  list_content: READ_ONLY_TOOL,
  get_sitemap: READ_ONLY_TOOL,
});

/** Human-readable title for client UIs; the name itself for an unknown tool. */
export function toolTitleFor(name: string): string {
  return TOOL_TITLES[name] ?? name;
}

/** MCP annotations for a tool. An unknown tool is treated as writable. */
export function mcpAnnotationsFor(name: string): MCPToolAnnotations {
  return MCP_TOOL_ANNOTATIONS[name] ?? UNKNOWN_TOOL;
}
