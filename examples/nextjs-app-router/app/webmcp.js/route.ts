import { createWebMCPScriptHandler } from '@corsenai/corsen-context-nextjs';
import { demoProvider } from '../../lib/provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://demo.example.com',
};

// Served as /webmcp.js — load it with <script src="/webmcp.js" defer>.
const GET = createWebMCPScriptHandler(config, demoProvider);

export { GET };
