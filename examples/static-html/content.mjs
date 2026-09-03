/** Single source of truth for both the generated HTML and read-only tools. */
export { SITE_URL } from './site-url.mjs';

export const prompts = [
  'What is Corsen Context and which four read-only tools does it publish?',
  'Compare the integration stacks and tell me which one fits a static HTML site.',
  'Find the WebMCP browser setup guide and list the current requirements.',
];

export const tools = [
  {
    name: 'search_site',
    returns: 'Matching public URLs and snippets',
    facts: ['query 1–500 code points', 'limit 1–50'],
  },
  {
    name: 'get_page_content',
    returns: 'One public URL as clean Markdown',
    facts: ['URI 1–2000 code points', 'same-site only'],
  },
  {
    name: 'list_content',
    returns: 'One allowed content type, paged',
    facts: ['page 1–5000', 'limit 1–100'],
  },
  {
    name: 'get_sitemap',
    returns: 'Bounded structured overview',
    facts: ['no input properties', 'owner content limit'],
  },
];

export const troubleshooting = {
  code: 'MCP-404',
  title: 'MCP endpoint not found',
  steps: [
    'Confirm the endpoint path matches the integration config (default /v1/mcp).',
    'Check mcp.enabled is not false — a disabled handler returns 404 for GET, POST, and OPTIONS.',
    'Verify the static build used the same SITE_URL as the deployed origin.',
  ],
  escalation:
    'Stop and escalate if POST returns 405, the WebMCP bridge script is missing from the page, or the initialize handshake reports a protocol mismatch.',
};

export const policies = [
  {
    label: 'Read-only',
    value: 'The public contract exposes no write, purchase, or form action.',
  },
  {
    label: 'Same-origin',
    value: 'WebMCP resolves to the same-origin MCP endpoint and sends no cookies or API key.',
  },
  {
    label: 'Rate-limited',
    value: 'Rate and burst limits apply before any optional authentication.',
  },
  {
    label: 'Bounded',
    value: 'Request bodies, JSON depth, result counts, and export sizes are capped.',
  },
];

export const resources = [
  {
    path: '/guides/webmcp-browser-setup.html',
    title: 'WebMCP browser setup',
    description: 'The current browser flag, compatible client, and public origin-trial paths',
    date: '2026-08-29',
    body: 'WebMCP is an evolving Community Group draft; browser and client support varies. The reference integration registers each manifest-backed tool through document.modelContext.registerTool. Follow docs/WEBMCP-BROWSER-SETUP.md for the current development flag, compatible client, and public origin-trial paths.',
  },
  {
    path: '/guides/mcp-vs-webmcp.html',
    title: 'MCP vs WebMCP',
    description: 'One contract, two transports: clients outside the page versus agents inside it',
    date: '2026-08-28',
    body: 'MCP serves clients outside the page over POST /v1/mcp. WebMCP registers the same tool contract for agents running inside the page through document.modelContext, and calls return to the same-origin MCP endpoint. llms.txt separately publishes a bounded static overview.',
  },
  {
    path: '/guides/install-and-integrate.html',
    title: 'Install and integrate',
    description: 'The npm packages, the WordPress plugin, and the one-page integration shape',
    date: '2026-08-27',
    body: 'Install @corsenai/corsen-context plus the adapter for your stack (@corsenai/corsen-context-nextjs or @corsenai/corsen-context-astro), implement a ContentProvider for the public pages you expose, then mount the MCP route and the WebMCP bridge script. WordPress uses the native PHP plugin instead of the npm core.',
  },
  {
    path: '/guides/security-boundary.html',
    title: 'Security boundary',
    description: 'Strict schemas, same-origin routing, rate limiting, and bounded output',
    date: '2026-08-26',
    body: 'The boundary is strict input schemas with runtime validation, same-origin WebMCP resolution with frame refusal and no credentials, rate limiting before optional authentication, bounded request bodies and JSON depth, same-site URL checks, and generated-metadata escaping. Page bodies remain untrusted site-authored content.',
  },
  {
    path: '/guides/ten-integration-stacks.html',
    title: 'The ten integration stacks',
    description: 'Native plugins, npm adapters, and deployable read-only CMS bridges',
    date: '2026-08-25',
    body: 'WordPress gets a native PHP plugin. Next.js and Astro get npm adapters. Express, static HTML, Ghost, Strapi, Directus, Wagtail, and MediaWiki get deployable read-only bridges or reference servers. The five CMS bridges are reference services, not native CMS extensions.',
  },
  {
    path: '/guides/llms-txt.html',
    title: 'llms.txt and llms-full.txt',
    description: 'Bounded static discovery surfaces with an explicit full-content opt-in',
    date: '2026-08-24',
    body: 'llms.txt publishes a bounded static overview. llms-full.txt is an explicit bounded opt-in, not a default: includeFullContent defaults to false, so /llms-full.txt returns 404 until the owner enables it. Both exports are capped at a UTF-8 byte limit without splitting a code point.',
  },
];

export const accessBoundary = {
  can: [
    'Search public titles and descriptions with search_site.',
    'Read a public page as clean Markdown with get_page_content.',
    'Browse an allowed public content type with list_content.',
    'Retrieve the bounded public URL map with get_sitemap.',
  ],
  cannot: [
    'Write, purchase, or submit a form.',
    'Read private, draft, personalized, or authenticated content.',
    'Act on another site.',
    'Call a tool the owner did not publish.',
  ],
};

export const integrationStacks = [
  { name: 'WordPress', detail: 'Native PHP plugin, independent of the npm core', current: false },
  { name: 'Next.js', detail: 'npm adapter plus App Router route handlers', current: false },
  { name: 'Astro', detail: 'npm adapter plus server endpoints', current: false },
  { name: 'Express', detail: 'Framework-agnostic core plus a reference server', current: false },
  {
    name: 'Static HTML',
    detail: 'Build-time assets plus one same-origin MCP function',
    current: true,
  },
];

export const integrationSteps = [
  'Install @corsenai/corsen-context in the build and function environment.',
  'Replace the demo records in content.mjs with your published page records.',
  'Run npm run build to generate HTML, llms.txt, llms-full.txt, and the browser bridge.',
  'Deploy public/ and the MCP function on one origin, then verify search_site followed by get_page_content.',
];

export const pages = [
  {
    path: '/',
    title: 'Corsen Context — WebMCP Demo',
    description:
      'Owner-controlled public content for MCP and WebMCP: four read-only tools, ten integration stacks, and a bounded security boundary',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'home',
    markdown: `# Corsen Context — WebMCP Demo\n\nOwner-controlled public content for MCP and WebMCP.\n\n## Copyable prompts\n\n${prompts.map((prompt) => `- ${prompt}`).join('\n')}\n\n## Demonstrated workflows\n\n- Read the four-tool contract and their bounds.\n- Compare the integration stacks.\n- Review the security boundary.\n- Browse the guide library.`,
  },
  {
    path: '/tools',
    file: '/tools/index.html',
    title: 'The four read-only tools',
    description:
      'search_site, get_page_content, list_content, and get_sitemap with their input bounds and return values',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'tools',
    markdown: `# The four read-only tools\n\n${tools.map((tool) => `## ${tool.name}\n\nReturns ${tool.returns}. Bounds: ${tool.facts.join('; ')}.`).join('\n\n')}`,
  },
  {
    path: '/guides/mcp-404',
    file: '/guides/mcp-404/index.html',
    title: 'MCP endpoint troubleshooting',
    description:
      'Three ordered checks for a missing MCP endpoint plus the stop-and-escalate condition',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'troubleshooting',
    markdown: `# ${troubleshooting.code} — ${troubleshooting.title}\n\n## Recovery steps\n\n${troubleshooting.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n## Escalation\n\n${troubleshooting.escalation}`,
  },
  {
    path: '/security',
    file: '/security/index.html',
    title: 'Security boundary',
    description:
      'Read-only, same-origin, rate-limited, and bounded: the four guarantees of the public contract',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'policies',
    markdown: `# Security boundary\n\n${policies.map((policy) => `## ${policy.label}\n\n${policy.value}`).join('\n\n')}`,
  },
  {
    path: '/guides',
    file: '/guides/index.html',
    title: 'Guide library',
    description:
      'Six dated guides covering WebMCP setup, MCP vs WebMCP, installation, security, stacks, and llms.txt',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'resources',
    markdown: `# Guide library\n\n${resources.map((resource) => `## ${resource.title}\n\nPublished ${resource.date}. ${resource.description}.`).join('\n\n')}`,
  },
  {
    path: '/agent-access',
    file: '/agent-access/index.html',
    title: 'What the read-only tools can and cannot access',
    description:
      'Public search, page content, content lists, and sitemap are available; writes, private data, and other sites are not',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'access',
    markdown: `# Agent access boundary\n\n## Can access\n\n${accessBoundary.can.map((item) => `- ${item}`).join('\n')}\n\n## Cannot access\n\n${accessBoundary.cannot.map((item) => `- ${item}`).join('\n')}`,
  },
  {
    path: '/integrate',
    file: '/integrate/index.html',
    title: 'Compare integration patterns: static HTML',
    description:
      'Static HTML integration compared with WordPress, Next.js, Astro, and Express, plus the four-step setup',
    type: 'page',
    lastModified: '2026-08-30',
    view: 'integration',
    markdown: `# Compare integration patterns\n\n${integrationStacks.map((stack) => `- ${stack.name}: ${stack.detail}${stack.current ? ' (this demo)' : ''}`).join('\n')}\n\n## Static HTML setup\n\n${integrationSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
  },
  ...resources.map((resource) => ({
    path: resource.path,
    file: resource.path,
    title: resource.title,
    description: resource.description,
    type: 'post',
    lastModified: resource.date,
    view: 'resource',
    markdown: `# ${resource.title}\n\nPublished ${resource.date}.\n\n${resource.body}`,
  })),
];
