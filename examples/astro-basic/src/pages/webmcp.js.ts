import { createWebMCPScriptHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../lib/provider';

// Served as /webmcp.js — pages load it with <script src="/webmcp.js" defer>.
export const GET = createWebMCPScriptHandler({ siteUrl: SITE_URL }, demoProvider);
