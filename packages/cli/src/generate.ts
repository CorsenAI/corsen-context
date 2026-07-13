import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CorsenContext, createSitemapProvider } from '@corsenai/corsen-context';

export function parseArgs(args: string[]): { url?: string; output?: string; full?: boolean } {
  const result: { url?: string; output?: string; full?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--url' || args[i] === '-u') && args[i + 1]) {
      result.url = args[++i];
    }
    if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
      result.output = args[++i];
    }
    if (args[i] === '--full') {
      result.full = true;
    }
  }
  return result;
}

export async function generate(args: string[]) {
  const { url, output, full } = parseArgs(args);

  if (!url) {
    console.error('  Error: --url is required');
    console.error('  Usage: npx corsen-context generate --url https://mysite.com [--full]');
    process.exit(1);
  }

  console.log(`\n  Generating llms.txt for ${url}...`);
  console.log('  Discovering + fetching pages via sitemap...');

  // The core's sitemap provider handles discovery, SSRF-safe fetching, and
  // markdown conversion.
  const provider = createSitemapProvider(url, { maxPages: 100 });
  const cc = new CorsenContext({ siteUrl: url }, provider);

  const outputDir = output || process.cwd();

  console.log('  Generating llms.txt...');
  const llmsTxt = await cc.generateLlmsTxt();
  const llmsPath = join(outputDir, 'llms.txt');
  writeFileSync(llmsPath, llmsTxt, 'utf-8');
  console.log(`  Written: ${llmsPath}`);

  if (full) {
    console.log('  Generating llms-full.txt...');
    const llmsFull = await cc.generateLlmsFullTxt();
    const fullPath = join(outputDir, 'llms-full.txt');
    writeFileSync(fullPath, llmsFull, 'utf-8');
    console.log(`  Written: ${fullPath}`);
  }

  console.log('\n  Done!\n');
}
