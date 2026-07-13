/**
 * Single source of truth for version strings.
 *
 * Keep CORSEN_CONTEXT_VERSION in sync with each package.json `version` on release
 * (the release tooling does this). serverInfo and the CLI both read from here so
 * the version can never silently drift between what is published and what is
 * reported over MCP.
 */

/** Corsen Context release version. */
export const CORSEN_CONTEXT_VERSION = '1.2.0';

/** MCP protocol version implemented by this server. */
export const MCP_PROTOCOL_VERSION = '2025-11-25';
