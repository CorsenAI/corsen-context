import { notFound } from 'next/navigation';
import { demoPages } from '../../lib/provider';

/**
 * Renders the provider's markdown as real pages, so every URL the tools
 * advertise also answers a human visitor. Replace with your real renderer.
 */
export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const path = '/' + (slug ?? []).join('/');
  const page = demoPages.find((p) => p.path === path);
  if (!page) notFound();

  const blocks: string[] = [];
  let inCode = false;
  for (const line of page.markdown.split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      blocks.push(`<pre><code>${escapeHtml(line)}</code></pre>`);
    } else if (line.startsWith('## ')) {
      blocks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      blocks.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.trim()) {
      blocks.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui', lineHeight: 1.5 }}>
      <div dangerouslySetInnerHTML={{ __html: blocks.join('\n') }} />
      <p style={{ marginTop: '2rem', color: '#888', fontSize: 14 }}>
        <a href="/">Home</a> — Powered by Corsen Context
      </p>
    </main>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
