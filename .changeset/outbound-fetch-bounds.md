---
'@corsenai/corsen-context': patch
'@corsenai/corsen-context-cli': patch
---

Bound every upstream body the core buffers and widen the SSRF address check.

- `createSitemapProvider` reads crawled pages through a shared 5 MiB budget (`readBoundedText`, `MAX_FETCH_BODY_BYTES`, now exported); an oversized page is skipped instead of being buffered whole, both while listing pages and on `get_page_content`. Concurrent first calls share one crawl and a failed crawl is retried by the next call.
- `parseSitemap` fetches at most `MAX_SITEMAP_DOCUMENTS` (50) sitemap documents per call, index included, so an index of thousands of empty child sitemaps no longer costs one request each.
- `isPrivateIp` decodes NAT64 (`64:ff9b::/96`, `64:ff9b:1::/48`), 6to4 (`2002::/16`) and Teredo (`2001:0::/32`) addresses and applies the IPv4 rules to the embedded address; multicast, reserved, site-local and discard-only ranges are also rejected.
- The CLI `doctor` command reads every diagnosed response through the same byte budget.
