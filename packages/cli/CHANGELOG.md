# @corsenai/corsen-context-cli

## 2.0.1

### Patch Changes

- Discover custom MCP endpoints from `llms.txt` or `robots.txt` while accepting only same-origin HTTPS targets. Relative endpoints now work, and unsafe cross-origin, credentialed, fragmented, or private discovery values fall back safely.
- @corsenai/corsen-context@2.0.1

## 2.0.0

### Major Changes

- Require Node.js 22.12 or newer across the npm packages and generated runtime examples.
- Harden the WebMCP bridge and MCP 2025-11-25 stateless JSON transport: complete the initialization lifecycle, validate Origin and protocol headers, return correct notification and tool-error envelopes, align bounded schemas across runtimes, and add reproducible cross-stack verification.
- Generate framework examples with authoritative MCP/static owner gates,
  bounded JSON parsing, strict media negotiation, and UTF-8-bounded static
  output. Full-content output remains disabled unless selected explicitly.
- Make `doctor` complete initialize/initialized, require server metadata, and
  report public surfaces without treating bridge discovery as browser tool
  execution proof.
- Make Next.js scaffolds import the shared configuration directly in server
  handlers instead of serializing it through `nextConfig.env`.
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
