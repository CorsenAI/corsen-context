---
'@corsenai/corsen-context': minor
'@corsenai/corsen-context-nextjs': patch
'@corsenai/corsen-context-astro': patch
'@corsenai/corsen-context-cli': patch
---

Client identity and HTTP authentication conformance.

- New `security.clientIpHeader` (`cf-connecting-ip` | `x-real-ip` | `x-forwarded-for`): with `trustProxy`, only the named header is consulted, so a client-supplied `CF-Connecting-IP` can no longer open a fresh rate-limit bucket behind a proxy that does not set it. Without it the previous order is kept. `extractClientIp` takes the header as its fourth argument.
- `401` responses from the Next.js and Astro handlers and from the generated Express and Pages transports carry `WWW-Authenticate: Bearer realm="corsen-context"` (`error="invalid_token"` when a credential was presented), as RFC 9110 requires; new helpers `parseBearerToken`, `extractApiKey`, `apiKeyChallenge`, `API_KEY_REALM`.
- The `Bearer` scheme is matched case-insensitively; `Basic` and other schemes no longer reach the key check.
- The Astro handler tolerates a throwing `clientAddress` (adapter without support, prerendered route) instead of failing the request.
- `siteUrl` must be an http(s) URL without embedded credentials; other schemes produced a `null` origin that silently rejected every browser `Origin`.
- `validateHost` compares host names case-insensitively; `tools/call` echoes at most 128 characters of an unknown tool name.
- The CLI scaffold prints the real provider path and documents `clientIpHeader`.
