#!/usr/bin/env python3
"""
Patch every CMS example's server.js in the repo to use the shared
Live Contract Observatory shell. Keeps the pageShell(title, inner) API;
stack/accent/query are inlined per example. Idempotent.
"""
import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, "shared", "webmcp-observatory")

def elem(name):
    with open(os.path.join(S, name), encoding="utf-8") as f:
        return f.read()

NAV_CSS = elem("cc-nav.css")
NAV_JS = elem("cc-nav.js")
OBS_CSS = elem("cc-observatory.css")
OBS_JS = elem("cc-observatory.js")

ACCENTS = {
    "ghost": "#9f1d51",
    "strapi": "#4338ca",
    "directus": "#7c3aed",
    "wagtail": "#0d6b57",
    "mediawiki": "#155e75",
}

def new_shell(stack, accent, query):
    return f"""const mcpEnabled = process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false';
const bridgeTag = mcpEnabled ? '<script src="/webmcp.js" defer></script>' : '';
const pageShell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${{title}}</title>
<style>{NAV_CSS}</style>
<style>{OBS_CSS}</style>
${{bridgeTag}}</head>
<body>
<div data-cc-nav data-stack="{stack}" data-uid="{stack.lower()}" data-home="#top" data-accent="{accent}"></div>
<main id="top" style="max-width:1080px;margin:0 auto;padding:32px 24px;font-family:system-ui;line-height:1.55;color:#12202e">
${{inner}}
<section id="live" style="margin:36px 0 0">
  <h2>Live contract observatory</h2>
  <div data-cc-observatory data-stack="{stack}" data-endpoint="/v1/mcp" data-query="{query}" data-accent="{accent}"></div>
</section>
</main>
<footer data-cc-foot data-stack="{stack}" data-accent="{accent}"></footer>
<script>{OBS_JS}</script>
<script>{NAV_JS}</script>
</body></html>`;"""

def patch(path, stack, query):
    src = open(path, encoding="utf-8").read()
    if "data-cc-observatory" in src:
        return "already"
    shell_pat = re.compile(r"const pageShell = \(title, inner\) => `.*?`;\n", re.S)
    m = shell_pat.search(src)
    if not m:
        return "NO_SHELL"
    accent = ACCENTS[stack.lower()]
    block = new_shell(stack, accent, query)
    src = shell_pat.sub(lambda _m: block, src, count=1)
    open(path, "w", encoding="utf-8").write(src)
    return "ok"

def main():
    jobs = [
        ("ghost-cms", "Ghost", "Ghost"),
        ("strapi-cms", "Strapi", "Strapi"),
        ("directus-cms", "Directus", "Directus"),
        ("wagtail-cms", "Wagtail", "Wagtail"),
        ("mediawiki-cms", "MediaWiki", "MediaWiki"),
    ]
    for folder, stack, query in jobs:
        p = os.path.join(ROOT, "examples", folder, "server.js")
        print(f"{folder}: {patch(p, stack, query)}")

if __name__ == "__main__":
    main()
