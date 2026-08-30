import express from 'express';
import { CorsenContext } from '@corsenai/corsen-context';
import { SITE_URL, pages } from '../content.mjs';

/**
 * The one dynamic piece of an otherwise fully static site: the MCP endpoint.
 * On Netlify/Vercel/Cloudflare this exact handler is a serverless function;
 * here it's a tiny Express server. Everything else is static files.
 */
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// A page's readable text: the plain body, or the stripped rawHtml.
const pageText = (p) => p.body ?? stripHtml(p.rawHtml);

const provider = {
  async getPages() {
    return pages.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      title: p.title,
      description: p.description,
      type: p.type,
      lastModified: p.lastModified,
    }));
  },
  async getPageContent(url) {
    const page = pages.find((p) => `${SITE_URL}${p.path}` === url);
    if (!page) return null;
    return {
      url,
      title: page.title,
      description: page.description,
      markdown: `# ${page.title}\n\n${pageText(page)}`,
      lastModified: page.lastModified,
      metadata: {},
    };
  },
  async searchContent(query, limit) {
    const q = query.toLowerCase();
    return (await this.getPages())
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
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

const cc = new CorsenContext({ siteUrl: SITE_URL }, provider);

const app = express();
app.use(express.json());

app.post('/v1/mcp', async (req, res) => {
  const server = cc.createMCPServer();
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.set(key, value);
  }
  const clientIp = req.socket.remoteAddress || 'unknown';
  const apiKey =
    req.headers['x-mcp-key']?.toString() ||
    req.headers['authorization']?.toString().replace('Bearer ', '') ||
    undefined;
  const rateLimit = await server.checkRateLimit(clientIp, apiKey);
  for (const [key, value] of Object.entries(rateLimit.headers)) {
    res.set(key, value);
  }
  if (!rateLimit.allowed) {
    return res
      .status(429)
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null });
  }
  const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });
  if (result === null) return res.status(204).end();
  res.json(result);
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
  console.log(`MCP function for ${SITE_URL} on port ${PORT} (the site itself is static)`);
});
