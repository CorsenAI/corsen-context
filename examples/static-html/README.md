# Corsen Context — static HTML example

A plain folder of HTML files — no framework, no CMS — made agent-native.
This is the most common kind of site on the web, and it needs exactly two
things from Corsen Context:

1. **A build step** (`scripts/build.mjs`) that conditionally writes static
   context and WebMCP assets into `public/` from the owner switches.
2. **One same-origin endpoint** (`function/server.js`) answering
   `POST /v1/mcp`. The reference server also serves `public/`, so the page,
   `/webmcp.js`, and `/v1/mcp` work from one origin without hidden proxy setup.

[Static/Node repository](https://github.com/CorsenAI/corsen-context-static-html) ·
[Netlify one-click repository](https://github.com/CorsenAI/corsen-context-netlify) ·
[Static live demo](https://html-webmcp.corsen.ai) ·
[Netlify live demo](https://corsen-context-demo.netlify.app)

Before every build, the script removes any previous `llms.txt`,
`llms-full.txt`, `webmcp.js`, and `webmcp-status.js`. With
`CORSEN_CONTEXT_MCP_ENABLED=false`, it does not recreate the bridge/status
assets and removes their `<script>` tags from generated pages. With
`CORSEN_CONTEXT_LLMS_TXT_ENABLED=false`, it does not recreate either static
export. `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=false` removes only the full
export. The bounded full export is disabled by default and is created only when
that variable is exactly `true`.

The reference server applies the same gates at runtime, except that it requires
`CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true` to serve the full export. Use the
same explicit values for build and runtime. A host that serves `public/`
directly has no runtime gate: revocation requires a new disabled build,
redeployment, and purge of any CDN copy.

If the site is already live and you only want `llms.txt`, the CLI can generate
that file without opting in to full content:

```bash
npx @corsenai/corsen-context-cli generate --url https://yoursite.com
```

## Run

```bash
git clone https://github.com/CorsenAI/corsen-context-static-html.git
cd corsen-context-static-html
npm ci
cp .env.example .env
npm run build
npm start
```

Open `http://localhost:3010`. The default `SITE_URL` already targets that URL.
The server exits with an actionable error if `public/` has not been built.
It binds to `127.0.0.1` by default; set `HOST=0.0.0.0` only on a deployment
platform that requires a public listener.

At runtime, `CORSEN_CONTEXT_MCP_ENABLED=false` makes MCP and WebMCP return
`404`, and `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` makes both static export
paths return `404`. The core bounds generated output to 5 MiB by default,
configurable from 64 KiB through 10 MiB, and truncates only at a complete UTF-8
code point.

For a real domain, set the same canonical URL at build and runtime:

```bash
# macOS / Linux
SITE_URL=https://www.example.com npm run build
SITE_URL=https://www.example.com npm start
```

```powershell
# Windows PowerShell
$env:SITE_URL = 'https://www.example.com'
npm run build
npm start
```

Replace the sample entries in `content.mjs` with the public pages supplied by
your own build/content pipeline. Do not include private, personalized, draft,
or authenticated content.

## Deploy to Netlify

One click deploys this exact example — static site plus a serverless
`POST /v1/mcp` function — to your own Netlify account:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/CorsenAI/corsen-context-netlify)

The `netlify.toml` here sets `publish = "public"` and `functions directory =
"netlify/functions"`. Netlify bundles `netlify/functions/mcp.mjs` (a translation
of the reference `function/server.js`) with esbuild, so no runtime install step
is needed. The function exports `config.path = "/v1/mcp"`, so the MCP endpoint
is served directly at `https://<your-site>.netlify.app/v1/mcp`.

At build and runtime, the template derives its canonical origin from Netlify's
`URL` (or `DEPLOY_PRIME_URL` for a deploy preview). Set `SITE_URL` explicitly
and redeploy only when using a custom canonical domain.

The live demo for the WebMCP Challenge is at
<https://corsen-context-demo.netlify.app> with its endpoint at
<https://corsen-context-demo.netlify.app/v1/mcp>.

## Deployment invariant

The HTML pages, `/webmcp.js`, and `POST /v1/mcp` must share one public origin.
You can deploy the reference Express server as-is, or map those paths through
your host/reverse proxy. A separate static origin without a `/v1/mcp` rewrite
is not a working WebMCP deployment. Keep the endpoint public and rate-limited
when WebMCP is enabled; browser code intentionally does not embed or send a
secret API key.
