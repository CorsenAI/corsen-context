---
"@corsenai/corsen-context-astro": minor
"@corsenai/corsen-context-cli": patch
---

Add a dedicated Astro adapter (`@corsenai/corsen-context-astro`) with drop-in MCP + llms.txt route handlers. It uses Astro's `clientAddress` for accurate rate limiting and includes auth, CORS, DoS limits, and security headers. The CLI's `init` now scaffolds Astro projects against this adapter.
