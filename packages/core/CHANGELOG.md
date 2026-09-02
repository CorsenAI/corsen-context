# @corsenai/corsen-context

## 2.0.1

## 2.0.0

### Major Changes

- Require Node.js 22.12 or newer across the npm runtime packages.
- Harden the WebMCP bridge and MCP 2025-11-25 stateless JSON transport: complete the initialization lifecycle, validate Origin and protocol headers, return correct notification and tool-error envelopes, align bounded schemas across runtimes, and add reproducible cross-stack verification.
- Enforce `mcp.enabled` before provider access; gate both `CorsenContext` static
  generation methods with `static.generateLlmsTxt`; keep full-content output
  opt-in; bound static output to 64 KiB–10 MiB (5 MiB by default) with
  UTF-8-safe truncation; and cap `content.maxPages` at 5000.
- Normalize same-site URLs and escape generated static metadata and Markdown
  destinations while leaving provider-supplied page bodies unchanged and
  explicitly untrusted.

## 1.3.0

### Minor Changes

- 8cedb8c: Add the WebMCP surface: the same four tools, registered with an agent running inside the page through `document.modelContext`.
  - Core: `generateWebMCPScript`, `toWebMCPTools`, and per-tool WebMCP annotations (`readOnlyHint`, `untrustedContentHint`), kept in sync with `tools.manifest.json` by cross-runtime parity tests. The bridge is same-origin only, refuses to register inside a frame, sends no credentials, and forwards every call to the existing MCP endpoint.
  - Next.js and Astro: `createWebMCPScriptHandler` serves the bridge as cacheable JavaScript from a route.
  - CLI: `doctor` now checks whether the homepage carries a WebMCP bridge.
