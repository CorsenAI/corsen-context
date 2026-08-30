# @corsenai/corsen-context-cli

Command-line tools for **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — scaffold an integration, generate bounded static context from a live site, and diagnose its public agent surfaces.

```bash
# Detect your framework and scaffold config + route files
npx @corsenai/corsen-context-cli init

# Generate llms.txt and explicitly opt in to llms-full.txt
npx @corsenai/corsen-context-cli generate --url https://example.com --full

# Diagnose public discovery and MCP surfaces
npx @corsenai/corsen-context-cli doctor --url https://example.com
```

Without `--full`, `generate` writes only `llms.txt`; full-content output is not a
default. Generated static output uses the core's 5 MiB default UTF-8 byte limit
(configurable in integrations from 64 KiB through 10 MiB).

The `doctor` command checks HTTPS, `llms.txt`, `sitemap.xml`, the `robots.txt`
MCP reference, and the MCP initialize/initialized lifecycle with required
server metadata. It reports those public surfaces; it does not prove that a
browser registered or executed a WebMCP tool.

Generated Next.js handlers import `corsen-context.config.mjs` directly on the
server. The scaffold does not serialize that configuration through
`nextConfig.env`; keep credentials out of `NEXT_PUBLIC_*`.

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **License:** MIT
