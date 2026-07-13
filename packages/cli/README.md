# @corsenai/corsen-context-cli

Command-line tools for **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — scaffold your integration, generate `llms.txt` from a live site, and check if your site is AI-ready.

```bash
# Detect your framework and scaffold config + route files
npx @corsenai/corsen-context-cli init

# Generate llms.txt (and llms-full.txt) from a live site
npx @corsenai/corsen-context-cli generate --url https://example.com --full

# Check whether a site is AI-ready
npx @corsenai/corsen-context-cli doctor --url https://example.com
```

The `doctor` command checks HTTPS, `llms.txt`, `sitemap.xml`, the robots.txt MCP reference, and MCP endpoint availability.

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **License:** MIT
