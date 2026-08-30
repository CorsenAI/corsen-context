/**
 * Single source of truth for the demo site: the content. The build script
 * turns it into static HTML + llms.txt + the WebMCP bridge; the function
 * serves the same data over MCP. No framework, no CMS.
 */
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3010').replace(/\/$/, '');

export const pages = [
  {
    path: '/',
    title: 'Home',
    description: 'A hand-built HTML site that talks to AI agents',
    type: 'page',
    body: 'This site is plain HTML — no framework, no CMS, no build toolchain. Its agent surfaces are generated once at build time, and one tiny function answers MCP calls.',
  },
  {
    path: '/about.html',
    title: 'About',
    description: 'Why a static site can be agent-native',
    type: 'page',
    body: 'Static hosting is the most reliable stack on the web. With Corsen Context, even a folder of HTML files gets llms.txt, an MCP endpoint and WebMCP tools.',
  },
  {
    path: '/posts/no-framework.html',
    title: 'Agent-native without a framework',
    description: 'llms.txt, MCP and WebMCP for a folder of HTML files',
    type: 'post',
    lastModified: '2026-08-25',
    body: 'Run the build script and your static site gains: /llms.txt for discovery, /webmcp.js so in-page agents can call your tools over WebMCP, and one small function for POST /v1/mcp. Works on any static host that lets you add one serverless function.',
  },
  {
    path: '/posts/one-function.html',
    title: 'The only dynamic piece is one function',
    description: 'Static by default, dynamic exactly where it counts',
    type: 'post',
    lastModified: '2026-08-27',
    body: 'Everything on this site is a static file except POST /v1/mcp. That is the whole cost of being agent-native on static hosting: one function, same four read-only tools.',
  },
  {
    path: '/forms.html',
    title: 'Forms and agents',
    description: 'Which forms an agent may fill — the owner decides, per form',
    type: 'page',
    // Trusted local content: injected as-is by the build (never escaped).
    rawHtml: `<h1>Forms and agents</h1>
<p>WebMCP's declarative API turns a form into a tool with three attributes —
<code>toolname</code>, <code>tooldescription</code>, and
<code>toolparamdescription</code> per field. The browser synthesizes the schema
and lets the agent fill and submit the form like a person. No JavaScript.</p>

<h2>Agent-callable: request a quote</h2>
<form toolname="request_quote" tooldescription="Request a quote for a kit installation."
      action="/forms.html" method="get">
  <p><label>Name<br><input type="text" name="name" required
      toolparamdescription="Customer's full name"></label></p>
  <p><label>Email<br><input type="email" name="email" required
      toolparamdescription="Customer's email address"></label></p>
  <p><label>Kit<br><select name="kit" toolparamdescription="Which kit to quote">
      <option value="mini">Mini</option><option value="pro">Pro</option>
  </select></label></p>
  <p><button type="submit">Request quote</button></p>
</form>

<h2>Human-only: checkout</h2>
<form action="/forms.html" method="get">
  <p><label>Card number<br><input type="text" name="card" autocomplete="cc-number"></label></p>
  <p><button type="submit">Pay now</button></p>
</form>
<p><small>No <code>toolname</code> — agents never see this form as a tool.
Agents may request a quote; they may never check out. That boundary is the
site owner's choice, per form, in plain HTML.</small></p>`,
  },
];
