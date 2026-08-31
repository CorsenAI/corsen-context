import {
  accessBoundary,
  troubleshooting,
  integrationStacks,
  integrationSteps,
  policies,
  tools,
  prompts,
  resources,
} from './content.mjs';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const navigation = [
  ['/', 'Overview'],
  ['/tools', 'Tools'],
  ['/guides/mcp-404', 'Support'],
  ['/security', 'Security'],
  ['/guides', 'Guides'],
  ['/agent-access', 'Access'],
  ['/integrate', 'Integrate'],
];

const styles = `
:root{color-scheme:light;--ink:#15221d;--muted:#57645f;--paper:#f7f8f3;--surface:#fff;--line:#d8dfd9;--accent:#4e2ca3;--soft:#eee9fb;--mint:#bcebd5;font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.55;background:var(--paper);color:var(--ink)}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:.18em}a:hover{color:var(--accent)}code{font-family:Consolas,monospace}.site-header,main,footer{width:min(1160px,calc(100% - 2rem));margin-inline:auto}.site-header{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding-block:1.25rem}.brand{display:inline-flex;align-items:center;gap:.65rem;font-weight:800;text-decoration:none;white-space:nowrap}.brand span{display:grid;width:2.25rem;height:2.25rem;place-items:center;border-radius:.65rem;background:var(--ink);color:#fff;font-size:.75rem}.site-header nav ul{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.25rem;margin:0;padding:0;list-style:none}.site-header nav a{display:block;padding:.45rem .65rem;border-radius:.5rem;color:var(--muted);font-size:.9rem;text-decoration:none}.site-header nav a[aria-current=page]{background:#fff;color:var(--ink);box-shadow:0 0 0 1px var(--line)}main{min-height:70vh}.hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(18rem,.7fr);gap:clamp(2rem,6vw,6rem);align-items:center;padding-block:clamp(4rem,9vw,8rem)}.eyebrow{margin:0 0 .75rem;color:var(--accent);font-size:.76rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1,h2,h3{line-height:1.08}h1{max-width:14ch;margin:0;font-size:clamp(2.65rem,7vw,5.8rem);letter-spacing:-.055em}h2{font-size:clamp(1.8rem,4vw,3.15rem);letter-spacing:-.035em}.lede{max-width:62ch;color:var(--muted);font-size:clamp(1.08rem,2vw,1.35rem)}.hero-links{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem}.primary-link,.secondary-link{display:inline-flex;min-height:2.9rem;align-items:center;justify-content:center;padding:.7rem 1rem;border:1px solid var(--ink);border-radius:.65rem;font-weight:750;text-decoration:none}.primary-link{background:var(--ink);color:#fff}.tool-panel{padding:1.35rem;border:1px solid var(--line);border-radius:1rem;background:#fff;box-shadow:.75rem .75rem 0 var(--mint)}.tool-panel dl{margin:0}.tool-panel dl div{padding:.85rem 0;border-top:1px solid var(--line)}.tool-panel dt{font-family:monospace;font-weight:800}.tool-panel dd{margin:.2rem 0 0;color:var(--muted)}.browser-status{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.5rem 1rem;padding:1rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;background:#fff}.browser-status p{margin:0}.demo-disclaimer{max-width:60ch;margin:-1rem 0 3rem;padding-left:.8rem;border-left:3px solid var(--mint);color:var(--muted);font-size:.9rem}.section{padding-block:clamp(3.5rem,8vw,7rem);border-top:1px solid var(--line)}.section h2,.page-intro h1{max-width:18ch;margin:0}.section-intro{max-width:60ch;color:var(--muted)}.prompt-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:2.5rem 0 0;padding:0;list-style:none}.prompt-rail li{display:grid;align-content:start;gap:1rem;min-width:0;padding:1.25rem;border:1px solid var(--line);border-radius:.9rem;background:#fff}.prompt-rail li>span{color:var(--accent);font-weight:850}.prompt-rail pre{min-height:9rem;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.prompt-rail code{font:inherit}.prompt-rail pre:focus{outline:3px solid var(--mint)}.card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-top:2.5rem}.case-card{min-height:13rem;padding:1.5rem;border-radius:1rem;background:#fff}.case-card:nth-child(2),.case-card:nth-child(3){background:var(--soft)}.case-card h3{max-width:22ch;margin:.25rem 0 .75rem;font-size:1.3rem}.case-card p:last-child{color:var(--muted)}.integration-callout{display:flex;align-items:center;justify-content:space-between;gap:2rem;margin-block:2rem 6rem;padding:clamp(1.5rem,4vw,3rem);border-radius:1rem;background:var(--mint)}.integration-callout h2{max-width:20ch;margin:0}.page-intro{padding-block:clamp(3.5rem,8vw,7rem);border-top:1px solid var(--line)}.page-intro h1{font-size:clamp(2.5rem,6vw,5rem)}.table-wrap{overflow-x:auto;margin-bottom:2rem;border:1px solid var(--line);border-radius:1rem;background:#fff}table{width:100%;border-collapse:collapse}caption{padding:1rem 1.25rem;color:var(--muted);text-align:left}th,td{padding:1.25rem;border-top:1px solid var(--line);text-align:left;vertical-align:top}thead th{background:var(--ink);color:#fff}.price{color:var(--accent);font-size:1.45rem;font-weight:850}.inline-facts{display:flex;flex-wrap:wrap;gap:.5rem;margin:0;padding:0;list-style:none}.inline-facts li{padding:.35rem .65rem;border-radius:99rem;background:var(--soft)}.evidence-note{margin-bottom:6rem;padding:1rem 1.25rem;border-left:.3rem solid var(--accent);background:#fff}.diagnostic-card,.setup-card{margin-bottom:1rem;padding:clamp(1.5rem,4vw,3rem);border:1px solid var(--line);border-radius:1rem;background:#fff}.code-badge{display:inline-block;padding:.4rem .65rem;border-radius:.4rem;background:var(--ink);color:#fff;font-family:monospace;font-weight:850}.steps{display:grid;gap:1rem;padding:0;list-style:none;counter-reset:steps}.steps li{position:relative;min-height:3rem;padding:.9rem 1rem .9rem 4rem;border-top:1px solid var(--line);counter-increment:steps}.steps li:before{content:counter(steps);position:absolute;left:.75rem;top:.7rem;display:grid;width:2rem;height:2rem;place-items:center;border-radius:50%;background:var(--mint);font-weight:850}.escalation{margin-bottom:6rem;padding:clamp(1.5rem,4vw,2.5rem);border:1px solid #e7c6a6;border-radius:1rem;background:#fff0d7}.escalation h2{margin:0;font-size:1.6rem}.policy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:0 0 6rem}.policy-grid div{min-height:12rem;padding:1.5rem;border:1px solid var(--line);border-radius:1rem;background:#fff}.policy-grid div:first-child{background:var(--mint)}.policy-grid dt{color:var(--accent);font-size:.8rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.policy-grid dd{margin:1.5rem 0 0;font-size:1.45rem;font-weight:720;line-height:1.25}.resource-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:0 0 6rem;padding:0;list-style:none}.resource-grid article{height:100%;padding:1.35rem;border:1px solid var(--line);border-radius:.85rem;background:#fff}.resource-grid time,.published{color:var(--muted);font-family:monospace;font-size:.85rem}.resource-grid h2{margin:1rem 0 .75rem;font-size:1.35rem}.resource-grid p{color:var(--muted)}.boundary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:6rem}.boundary{padding:clamp(1.5rem,4vw,2.5rem);border-radius:1rem}.boundary.can{background:var(--mint)}.boundary.cannot{border:1px solid #edc7ca;background:#fff4f4}.boundary-mark{margin:0;font-size:2rem;font-weight:900}.boundary h2{margin:.5rem 0 1.5rem}.boundary li+li{margin-top:.9rem}.stack-selector ul{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin:0 0 2rem;padding:0;list-style:none}.stack-selector li{display:grid;align-content:start;gap:.65rem;min-height:10rem;padding:1.2rem;border:1px solid var(--line);border-radius:.8rem;background:#fff;color:var(--muted)}.stack-selector li.current{border:2px solid var(--accent);background:var(--soft);color:var(--ink)}.stack-name{color:var(--ink);font-size:1.25rem;font-weight:850}.stack-selector strong{color:var(--accent);font-size:.75rem;text-transform:uppercase}.setup-card{margin-bottom:6rem}.resource-article{max-width:760px;padding-block:clamp(4rem,10vw,8rem)}.resource-copy{margin:2.5rem 0;padding:1.5rem;border:1px solid var(--line);border-radius:.8rem;background:#fff;white-space:pre-line}footer{display:flex;justify-content:space-between;gap:2rem;padding-block:2rem;border-top:1px solid var(--line);color:var(--muted);font-size:.88rem}footer p{margin:0}@media(max-width:820px){.site-header{align-items:flex-start}.hero{grid-template-columns:1fr}.prompt-rail,.resource-grid{grid-template-columns:1fr}.prompt-rail pre{min-height:auto}.stack-selector ul{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.site-header{flex-direction:column}.site-header nav ul{justify-content:flex-start}.card-grid,.policy-grid,.boundary-grid,.stack-selector ul{grid-template-columns:1fr}.integration-callout,footer{align-items:flex-start;flex-direction:column}th,td{padding:.85rem}}
button{font:inherit}:where(a,button,[tabindex]):focus-visible,.prompt-rail pre:focus{outline:3px solid var(--accent);outline-offset:3px}.prompt-actions{display:grid;gap:.45rem;align-items:start}.copy-button{justify-self:start;min-height:2.75rem;padding:.65rem .9rem;border:1px solid var(--ink);border-radius:.6rem;background:var(--ink);color:#fff;font-weight:750;cursor:pointer}.copy-button:hover{border-color:var(--accent);background:var(--accent)}.copy-feedback{min-height:1.35rem;color:var(--muted);font-size:.82rem}
`;

const interactions = `(() => {
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard copy was rejected');
  }

  document.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-copy-prompt]') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const card = button.closest('li');
    const prompt = card?.querySelector('code')?.textContent ?? '';
    const feedback = card?.querySelector('[data-copy-feedback]');
    if (!prompt || !(feedback instanceof HTMLElement)) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(prompt);
      } else {
        fallbackCopy(prompt);
      }
      button.textContent = 'Copied';
      feedback.textContent = 'Prompt copied to the clipboard.';
    } catch {
      button.textContent = 'Try copying again';
      feedback.textContent = 'Copy failed. Select the prompt text and copy it manually.';
    }
  });
})();`;

const intro = (eyebrow, title, copy) =>
  `<header class="page-intro"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="lede">${esc(copy)}</p></header>`;

function home({ mcpEnabled = true } = {}) {
  const workflows = [
    [
      '/tools',
      'Tool contract',
      'Read the four-tool contract and bounds',
      'search_site, get_page_content, list_content, and get_sitemap.',
    ],
    [
      '/guides/mcp-404',
      'Support',
      'Retrieve a fixed diagnostic sequence',
      'Three ordered checks and one stop-and-escalate rule for MCP-404.',
    ],
    [
      '/security',
      'Security',
      'Review the four guarantees',
      'Read-only, same-origin, rate-limited, and bounded.',
    ],
    [
      '/guides',
      'Guides',
      'Browse six dated guides',
      'WebMCP setup, MCP vs WebMCP, install, security, stacks, and llms.txt.',
    ],
  ];
  const browserStatus = mcpEnabled
    ? '<span data-webmcp-status>status not checked (JavaScript is unavailable)</span>'
    : '<span data-state="disabled">disabled by the owner at build time</span>';
  return `<section class="hero"><div><p class="eyebrow">WebMCP use-case gallery</p><h1>Corsen Context &mdash; WebMCP Demo</h1><p class="lede">Corsen Context gives a site an explicit, owner-governed read path for agents — four read-only tools served over MCP and registered in-page through WebMCP.</p><p class="hero-links"><a class="primary-link" href="#try-prompts">Try a prompt</a><a class="secondary-link" href="/agent-access">Check the boundary</a></p></div><aside class="tool-panel" aria-labelledby="tool-panel-title"><p class="eyebrow" id="tool-panel-title">Published interface</p><dl><div><dt>search_site</dt><dd>Find the relevant URL</dd></div><div><dt>get_page_content</dt><dd>Retrieve its clean content</dd></div><div><dt>list_content</dt><dd>Browse public records</dd></div><div><dt>get_sitemap</dt><dd>Map the public corpus</dd></div></dl></aside><aside class="browser-status" aria-live="polite"><p><strong>Browser WebMCP:</strong> ${browserStatus}</p><a href="/integrate">Browser setup</a></aside></section><p class="demo-disclaimer">This is a live deployment of the Corsen Context static-HTML example, served from one origin with the same four read-only tools.</p>
  <section class="section" id="try-prompts" aria-labelledby="prompt-title"><p class="eyebrow">Try with your agent</p><h2 id="prompt-title">Three copyable research prompts</h2><p class="section-intro">Copy any prompt into your agent. The page does not simulate an answer or perform an action on your behalf.</p><ol class="prompt-rail">${prompts
    .map((prompt, index) => {
      const promptId = `research-prompt-${index + 1}`;
      return `<li><span aria-hidden="true">0${index + 1}</span><pre id="${promptId}"><code>${esc(prompt)}</code></pre><div class="prompt-actions"><button class="copy-button" type="button" aria-describedby="${promptId}" data-copy-prompt>Copy prompt</button><span class="copy-feedback" role="status" aria-live="polite" data-copy-feedback></span></div></li>`;
    })
    .join('')}</ol></section>
  <section class="section" aria-labelledby="workflow-title"><p class="eyebrow">Different retrieval patterns</p><h2 id="workflow-title">A gallery of real content workflows</h2><div class="card-grid">${workflows.map(([path, eyebrow, title, copy]) => `<article class="case-card"><p class="eyebrow">${eyebrow}</p><h3><a href="${path}">${title}</a></h3><p>${copy}</p></article>`).join('')}</div></section>
  <section class="integration-callout" aria-labelledby="integration-callout-title"><div><p class="eyebrow">For site owners</p><h2 id="integration-callout-title">Replace the demo records with your content.</h2><p>The human pages and all four tools read from the same records, so URLs and answers stay aligned.</p></div><a class="primary-link" href="/integrate">View the static HTML path</a></section>`;
}

const toolsView = () =>
  `${intro('Tool contract', 'The four read-only tools', 'A compact fact table that can be retrieved from the same provider as this page.')}<div class="table-wrap"><table><caption>Published tool contract</caption><thead><tr><th scope="col">Tool</th><th scope="col">Returns</th><th scope="col">Bounds</th></tr></thead><tbody>${tools.map((tool) => `<tr><th scope="row">${tool.name}</th><td >${tool.returns}</td><td><ul class="inline-facts">${tool.facts.map((fact) => `<li>${fact}</li>`).join('')}</ul></td></tr>`).join('')}</tbody></table></div><aside class="evidence-note"><strong>Useful chain:</strong> search for “sitemap” or “Markdown”, then retrieve this page with <code>get_page_content</code>.</aside>`;
const troubleshootingView = () =>
  `${intro('Support diagnostic', `${troubleshooting.code} — ${troubleshooting.title}`, 'The recovery sequence has exactly three steps. Its stop condition is part of the published record.')}<section class="diagnostic-card" aria-labelledby="steps-title"><div class="code-badge">${troubleshooting.code}</div><h2 id="steps-title">Run once, in this order</h2><ol class="steps">${troubleshooting.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol></section><aside class="escalation" aria-labelledby="escalation-title"><p class="eyebrow">Safety boundary</p><h2 id="escalation-title">When to stop and escalate</h2><p>${esc(troubleshooting.escalation)}</p></aside>`;
const policiesView = () =>
  `${intro('Security', 'Four guarantees, one retrievable page', 'The public contract is intentionally read-only and bounded.')}<dl class="policy-grid">${policies.map((policy) => `<div><dt>${policy.label}</dt><dd>${policy.value}</dd></div>`).join('')}</dl>`;
const resourcesView = () =>
  `${intro('Freshness and discovery', 'Six dated guides', 'Each guide has a stable provider URL, title, description, and publication date.')}<ol class="resource-grid">${resources.map((resource) => `<li><article><time datetime="${resource.date}">${resource.date}</time><h2><a href="${resource.path}">${resource.title}</a></h2><p>${resource.description}.</p></article></li>`).join('')}</ol>`;
const accessView = () =>
  `${intro('Owner control', 'What the tools can and cannot access', 'The public contract is intentionally read-only and limited to this site’s published corpus.')}<div class="boundary-grid"><section class="boundary can" aria-labelledby="can-title"><p class="boundary-mark" aria-hidden="true">✓</p><h2 id="can-title">Can access</h2><ul>${accessBoundary.can.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section><section class="boundary cannot" aria-labelledby="cannot-title"><p class="boundary-mark" aria-hidden="true">×</p><h2 id="cannot-title">Cannot access</h2><ul>${accessBoundary.cannot.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section></div>`;
const integrationView = () =>
  `${intro('Implementation comparison', 'Compare integration patterns for your stack', 'This page compares the Next.js, Astro, Express, and static HTML examples; it highlights the pattern rendered here.')}<section class="stack-selector" aria-label="Available integration patterns"><ul>${integrationStacks.map((stack) => `<li class="${stack.current ? 'current' : ''}"><span class="stack-name">${stack.name}</span><span>${stack.detail}</span>${stack.current ? '<strong>Current example</strong>' : ''}</li>`).join('')}</ul></section><section class="setup-card" aria-labelledby="setup-title"><p class="eyebrow">Static HTML</p><h2 id="setup-title">Integration path</h2><ol class="steps">${integrationSteps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol></section>`;

function resourceView(page) {
  const resource = resources.find((item) => item.path === page.path);
  return `<article class="resource-article"><p class="eyebrow">Corsen Context guide</p><h1>${esc(resource.title)}</h1><p class="published">Published <time datetime="${resource.date}">${resource.date}</time></p><p class="lede">${esc(resource.description)}.</p><div class="resource-copy">${esc(resource.body)}</div><p><a href="/guides">← Back to all six guides</a></p></article>`;
}

export function renderDocument(page, options = {}) {
  const views = {
    home: () => home(options),
    tools: toolsView,
    troubleshooting: troubleshootingView,
    policies: policiesView,
    resources: resourcesView,
    access: accessView,
    integration: integrationView,
    resource: () => resourceView(page),
  };
  const body = views[page.view]();
  const mcpEnabled = options.mcpEnabled !== false;
  const llmsTxtEnabled = options.llmsTxtEnabled !== false;
  const agentScripts = mcpEnabled
    ? '<script src="/webmcp.js" defer></script><script src="/webmcp-status.js" defer></script>'
    : '';
  const surfaces = [
    mcpEnabled ? 'Four read-only tools' : 'Machine tool surfaces disabled at build time',
    ...(llmsTxtEnabled ? ['<a href="/llms.txt">llms.txt</a>'] : []),
    ...(mcpEnabled ? ['<code>POST /v1/mcp</code>', 'WebMCP'] : []),
  ].join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)}${page.path !== '/' ? ' — Corsen Context' : ''}</title><meta name="description" content="${esc(page.description)}"><style>${styles}</style><link rel="stylesheet" href="/corsen/cc-nav.css"><link rel="stylesheet" href="/corsen/cc-observatory.css">${agentScripts}</head><body><div data-cc-nav data-stack="Static HTML" data-uid="html" data-home="/" data-accent="#0f766e"></div><main id="top">${body}<section id="live" style="padding:32px 24px 8px"><h2>Live contract observatory</h2><div data-cc-observatory data-stack="Static HTML" data-endpoint="/v1/mcp" data-query="Static HTML" data-accent="#0f766e"></div></section></main><footer data-cc-foot data-stack="Static HTML" data-accent="#0f766e"></footer><script>${interactions}</script><script src="/corsen/cc-observatory.js" defer></script><script src="/corsen/cc-nav.js" defer></script></body></html>`;
}
