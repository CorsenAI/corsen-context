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
];
