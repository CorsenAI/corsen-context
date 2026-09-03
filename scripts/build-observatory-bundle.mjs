/**
 * Build the shared WebMCP Observatory assets into a single deployable bundle.
 *
 * Output (gitignored): .challenge/observatory/dist/
 *   - cc-nav.css, cc-nav.js, cc-observatory.css, cc-observatory.js (minified-safe)
 *   - wp-home.html  (WordPress flagship homepage, base64-bootstrapped, UTF-8 safe)
 *   - manifest.json (sha256 of each artifact + build info)
 *
 * Usage: node scripts/build-observatory-bundle.mjs
 * The bundle is what actually gets deployed to the ten demo sites; sources live
 * under shared/webmcp-observatory/ so the whole thing is reconstructible from a
 * clean clone (no dependency on .challenge/ or the VM).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'shared', 'webmcp-observatory');
const OUT = join(ROOT, '.challenge', 'observatory', 'dist');

const FILES = [
  'cc-nav.css',
  'cc-nav.js',
  'cc-observatory.css',
  'cc-observatory.js',
  'wp-home.html',
];

mkdirSync(OUT, { recursive: true });

/** WordPress wpautop destroys double-newlines in inline <script>/<style>,
 *  and inside a single <script> tag the HTML parser decodes entities like
 *  &lt; back into <, which corrupts JS containing string literals like
 *  .replace(/</g, '&lt;'). The bootstrap below therefore encodes the whole
 *  payload as base64 (single-line, no <, no newlines) and decodes at runtime. */
function wpBootstrap(payloadCss, payloadJs) {
  const blob = Buffer.from(payloadCss + '\n@@@JS@@@\n' + payloadJs, 'utf8').toString('base64');
  return (
    '<script>\n' +
    '(function(){var b=atob(' +
    JSON.stringify(blob) +
    ');' +
    'var u=Uint8Array.from(b,function(c){return c.charCodeAt(0);});' +
    'var s=new TextDecoder("utf-8").decode(u).split("@@@JS@@@");' +
    'var d=document.createElement("style");d.textContent=s[0];document.head.appendChild(d);' +
    'var e=document.createElement("script");e.textContent=s[1];document.body.appendChild(e);})();\n' +
    '</script>'
  );
}

const read = (name) => readFileSync(join(SRC, name), 'utf8');

const navCss = read('cc-nav.css');
const navJs = read('cc-nav.js');
const obsCss = read('cc-observatory.css');
const obsJs = read('cc-observatory.js');
const wpHtml = read('wp-home.html');

// --- Static files (Astro/Next/static serve them via /corsen/* or /cc-*) ---
for (const name of FILES.filter((file) => file !== 'wp-home.html')) {
  writeFileSync(join(OUT, name), read(name), 'utf8');
}

// --- WordPress homepage: inject CSS+JS via base64 bootstrap ---
// wpautop must not see blank lines inside <style>/<script>: collapse them.
// This is a whitespace normalizer over first-party source, not an HTML
// sanitizer; the closing-tag patterns tolerate whitespace and attributes.
const wpSanitizedHtml = wpHtml
  .replace(/\r\n/g, '\n')
  .replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\b[^>]*>)/gi,
    (m, open, body, close) => open + body.replace(/\n[ \t]*\n/g, '\n') + close,
  )
  .replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script\b[^>]*>)/gi,
    (m, open, body, close) => open + body.replace(/\n[ \t]*\n/g, '\n') + close,
  );
const bootstrap = wpBootstrap(navCss + '\n' + obsCss, obsJs + '\n' + navJs);
const idx = wpSanitizedHtml.lastIndexOf('</div>');
const wpFinal = wpSanitizedHtml.slice(0, idx) + bootstrap + wpSanitizedHtml.slice(idx);
writeFileSync(join(OUT, 'wp-home.html'), wpFinal, 'utf8');

// --- Manifest ---
const manifest = {};
for (const name of FILES) {
  const data = readFileSync(join(OUT, name));
  manifest[name] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
manifest._source = 'shared/webmcp-observatory/ (public, reconstructible)';
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('bundle written to', OUT);
for (const [name, m] of Object.entries(manifest)) {
  if (name.startsWith('_')) continue;
  console.log(`  ${name}: ${m.bytes} bytes  ${m.sha256.slice(0, 16)}`);
}
