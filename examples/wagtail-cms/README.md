# Corsen Context — Wagtail example

Make a [Wagtail](https://wagtail.org) (Python/Django) site agent-native without
a Wagtail plugin: Corsen Context wraps Wagtail's public REST API v2, and the
same four read-only tools appear on three surfaces — `/llms.txt`,
`POST /v1/mcp`, and `/webmcp.js` for an agent running inside the page (WebMCP).

The read API needs no key: pages are public by default.

## Run

```bash
npm install
WAGTAIL_URL=http://127.0.0.1:8000 \
SITE_URL=https://your-site.example \
npm start
```

Wagtail side, the API is three lines: add `wagtail.api.v2` and
`rest_framework` to `INSTALLED_APPS`, create a `WagtailAPIRouter`, and mount
`path("api/v2/", include((api_router.get_urlpatterns(), "wagtailapi"), namespace="wagtailapi"))`
in `urls.py`.
