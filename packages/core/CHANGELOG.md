# @corsenai/corsen-context

## 1.3.0

### Minor Changes

- 8cedb8c: Add the WebMCP surface: the same four tools, registered with an agent running inside the page through `document.modelContext`.
  - Core: `generateWebMCPScript`, `toWebMCPTools`, and per-tool WebMCP annotations (`readOnlyHint`, `untrustedContentHint`), kept in sync with `tools.manifest.json` by cross-runtime parity tests. The bridge is same-origin only, refuses to register inside a frame, sends no credentials, and forwards every call to the existing MCP endpoint.
  - Next.js and Astro: `createWebMCPScriptHandler` serves the bridge as cacheable JavaScript from a route.
  - CLI: `doctor` now checks whether the homepage carries a WebMCP bridge.
