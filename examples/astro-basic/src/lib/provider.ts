import type { ContentProvider } from '@corsenai/corsen-context';

/**
 * Example content provider with static demo data.
 * Replace this with your actual CMS, content collections, or API integration.
 *
 * URLs derive from SITE_URL so the sitemap, llms.txt and the tools always
 * advertise the origin the site is actually served from.
 */
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');

interface DemoPage {
  path: string;
  title: string;
  description: string;
  type: 'page' | 'post';
  lastModified?: string;
  markdown: string;
}

export const demoPages: DemoPage[] = [
  {
    path: '/',
    title: 'Home',
    description: 'Welcome to our Astro demo site',
    type: 'page',
    lastModified: '2026-04-01',
    markdown:
      '# Welcome to the Astro Demo\n\nThis site is powered by Corsen Context.\n\nAI agents can access our content through the MCP endpoint, by reading /llms.txt, or right inside this page over WebMCP.',
  },
  {
    path: '/about',
    title: 'About Us',
    description: 'Learn about our team and mission',
    type: 'page',
    markdown:
      '# About Us\n\nWe are a team passionate about making the web AI-native.\n\n## Our Mission\n\nBridge the gap between websites and AI agents with open standards.',
  },
  {
    path: '/blog/getting-started',
    title: 'Getting Started with AI Context',
    description: 'How to make your site AI-native in minutes',
    type: 'post',
    lastModified: '2026-04-05',
    markdown:
      '# Getting Started with AI Context\n\nMaking your site AI-native takes less than 5 minutes.\n\n## Step 1: Install\n\n```bash\nnpm install @corsenai/corsen-context-astro\n```\n\n## Step 2: Configure\n\nCreate a content provider and mount the handlers as API routes.\n\n## Step 3: Verify\n\nRun `npx @corsenai/corsen-context-cli doctor --url https://yoursite.com` to check.',
  },
  {
    path: '/blog/mcp-explained',
    title: 'MCP Explained',
    description: 'What is Model Context Protocol and why it matters',
    type: 'post',
    lastModified: '2026-04-07',
    markdown:
      '# MCP Explained\n\nModel Context Protocol (MCP) is an open standard for AI agent communication.\n\n## Why MCP?\n\nHTML was designed for browsers, not AI. MCP gives agents structured access to your content via JSON-RPC 2.0.\n\n## How It Works\n\nAgents send requests like `tools/call` with a tool name and parameters. The server returns clean, structured data.',
  },
];

const byUrl = new Map(demoPages.map((p) => [`${SITE_URL}${p.path}`, p]));

export const demoProvider: ContentProvider = {
  async getPages() {
    return demoPages.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      title: p.title,
      description: p.description,
      type: p.type,
      lastModified: p.lastModified,
    }));
  },

  async getPageContent(url) {
    const page = byUrl.get(url);
    if (!page) return null;
    return {
      url,
      title: page.title,
      description: page.description,
      markdown: page.markdown,
      lastModified: page.lastModified,
      metadata: {},
    };
  },

  async searchContent(query, limit) {
    const pages = await this.getPages();
    return pages
      .filter(
        (p) =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, limit)
      .map((p) => ({
        url: p.url,
        title: p.title,
        description: p.description,
        snippet: p.description,
        score: 1,
      }));
  },
};
