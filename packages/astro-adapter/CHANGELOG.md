# @corsenai/corsen-context-astro

## 2.0.1

### Patch Changes

- @corsenai/corsen-context@2.0.1

## 2.0.0

### Major Changes

- Require Node.js 22.12 or newer across the npm runtime packages.
- Harden the WebMCP bridge and MCP 2025-11-25 stateless JSON transport: complete the initialization lifecycle, validate Origin and protocol headers, return correct notification and tool-error envelopes, align bounded schemas across runtimes, and add reproducible cross-stack verification.
- Return `404` from MCP, WebMCP, and static handlers when their owner switches
  are disabled. Static full content remains off by default and both exports
  inherit the core's UTF-8 byte bound.
- Parse at most 100 KiB of JSON after Origin, media, rate-limit, and optional
  authentication checks; return bounded parse and body-size errors.
- Updated dependencies
  - @corsenai/corsen-context@2.0.0

## 1.3.0

### Minor Changes

- 8cedb8c: Add the WebMCP surface: the same four tools, registered with an agent running inside the page through `document.modelContext`.
  - Core: `generateWebMCPScript`, `toWebMCPTools`, and per-tool WebMCP annotations (`readOnlyHint`, `untrustedContentHint`), kept in sync with `tools.manifest.json` by cross-runtime parity tests. The bridge is same-origin only, refuses to register inside a frame, sends no credentials, and forwards every call to the existing MCP endpoint.
  - Next.js and Astro: `createWebMCPScriptHandler` serves the bridge as cacheable JavaScript from a route.
  - CLI: `doctor` now checks whether the homepage carries a WebMCP bridge.

### Patch Changes

- Updated dependencies [8cedb8c]
  - @corsenai/corsen-context@1.3.0
