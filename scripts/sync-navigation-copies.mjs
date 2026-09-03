/**
 * Keep every demonstration site on the canonical navigation implementation.
 *
 * Two apps serve cc-nav.js as a file; six single-file example servers embed it
 * in their HTML shell. This script updates both forms and fails if a target no
 * longer has exactly one replaceable navigation block.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const canonicalPath = join(root, 'shared', 'webmcp-observatory', 'cc-nav.js');
const canonical = readFileSync(canonicalPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();

if (canonical.includes('`') || canonical.includes('${')) {
  throw new Error('Canonical navigation cannot be embedded safely in a template literal.');
}

const fileCopies = [
  'examples/astro-basic/public/cc-nav.js',
  'examples/nextjs-app-router/public/corsen/cc-nav.js',
  'examples/static-html/assets/cc-nav.js',
];

for (const relative of fileCopies) {
  copyFileSync(canonicalPath, join(root, relative));
  console.log(`synced ${relative}`);
}

const embeddedCopies = [
  'examples/express-basic/render.js',
  'examples/ghost-cms/server.js',
  'examples/strapi-cms/server.js',
  'examples/directus-cms/server.js',
  'examples/wagtail-cms/server.js',
  'examples/mediawiki-cms/server.js',
];

const embeddedPattern =
  /\/\* ={20,}\n   Corsen Context shared navigation  - logic \(v\d+\)[\s\S]*?\n\}\)\(\);/g;

for (const relative of embeddedCopies) {
  const target = join(root, relative);
  const source = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  const matches = source.match(embeddedPattern) || [];
  if (matches.length !== 1) {
    throw new Error(`${relative}: expected one embedded navigation block, found ${matches.length}`);
  }
  writeFileSync(target, source.replace(embeddedPattern, canonical), 'utf8');
  console.log(`synced ${relative}`);
}
