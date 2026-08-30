/**
 * Single source of truth for version strings.
 *
 * CORSEN_CONTEXT_VERSION is bumped by hand on every release, in the same
 * commit that updates the package.json versions. serverInfo and the CLI both
 * read from here so the version can never silently drift between what is
 * published and what is reported over MCP.
 */

/** Corsen Context release version. */
export const CORSEN_CONTEXT_VERSION = '2.0.0';

/** MCP protocol version implemented by this server. */
export const MCP_PROTOCOL_VERSION = '2025-11-25';
