import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CorsenContext,
  discoverSitemap,
  parseSitemap,
  htmlToMarkdown,
  extractMetadata,
  type ContentProvider,
  type PageContent,
  type SearchResult,
  type ContentListItem,
} from '@corsenai/corsen-context';
import { safeFetch } from '@corsenai/corsen-context';

function parseArgs(args: string[]): { url?: string; output?: string } {
  const result: { url?: string; output?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--url' || args[i] === '-u') && args[i + 1]) {
      result.url = args[++i];
    }
    if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
      result.output = args[++i];
    }
  }
  return result;
}

function createFetchProvider(siteUrl: string, sitemapEntries: { url: string }[]): ContentProvider {
  return {
    async getPages(): Promise<ContentListItem[]> {
      const pages: ContentListItem[] = [];
      for (const entry of sitemapEntries) {
        try {
          const res = await safeFetch(entry.url, { timeout: 10000 });
          if (!res.ok) continue;
          const html = await res.text();
          const meta = extractMetadata(html);
          pages.push({
            url: entry.url,
            title: meta.title || entry.url,
            description: meta.description || '',
            type: meta['og:type'] === 'article' ? 'post' : 'page',
            lastModified: meta.modified || meta.published,
          });
        } catch {
          continue;
        }
      }
      return pages;
    },

    async getPageContent(url: string): Promise<PageContent | null> {
      try {
        const res = await safeFetch(url, { timeout: 10000 });
        if (!res.ok) return null;
        const html = await res.text();
        const meta = extractMetadata(html);
        const markdown = htmlToMarkdown(html);
        return {
          url,
          title: meta.title || url,
          description: meta.description || '',
          markdown,
          lastModified: meta.modified || meta.published,
          metadata: meta,
        };
      } catch {
        return null;
      }
    },

    async searchContent(_query: string, _limit: number): Promise<SearchResult[]> {
      return []; // Static generation doesn't support search
    },
  };
}

export async function generate(args: string[]) {
  const { url, output } = parseArgs(args);

  if (!url) {
    console.error('  Error: --url is required');
    console.error('  Usage: npx corsen-context generate --url https://mysite.com');
    process.exit(1);
  }

  console.log(`\n  Generating llms.txt for ${url}...`);

  // Discover sitemap
  console.log('  Discovering sitemap...');
  const sitemapUrl = await discoverSitemap(url);

  if (!sitemapUrl) {
    console.error('  Error: No sitemap found. Ensure your site has a sitemap.xml.');
    process.exit(1);
  }

  console.log(`  Found sitemap: ${sitemapUrl}`);

  // Parse sitemap
  console.log('  Parsing sitemap...');
  const entries = await parseSitemap(sitemapUrl, 100);
  console.log(`  Found ${entries.length} pages`);

  // Create provider from fetched pages
  const provider = createFetchProvider(url, entries);

  // Generate
  const cc = new CorsenContext({ siteUrl: url }, provider);

  console.log('  Generating llms.txt...');
  const llmsTxt = await cc.generateLlmsTxt();

  const outputDir = output || process.cwd();
  const llmsPath = join(outputDir, 'llms.txt');
  writeFileSync(llmsPath, llmsTxt, 'utf-8');
  console.log(`  Written: ${llmsPath}`);

  console.log('\n  Done!\n');
}
