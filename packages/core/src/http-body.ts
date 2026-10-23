/**
 * Upper bound, in bytes, for any single upstream HTTP body the core buffers:
 * sitemaps, robots.txt, crawled pages and the CLI's diagnostic reads.
 */
export const MAX_FETCH_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Read a response body as text, giving up once `maxBytes` have been consumed.
 *
 * A `Content-Length` above the budget is rejected before any read; a chunked
 * body is counted as it streams and cancelled at the budget, so an oversized
 * upstream document is never buffered whole. Returns `null` when the body is
 * over budget, and callers treat that document as absent.
 */
export async function readBoundedText(
  response: Response,
  maxBytes: number = MAX_FETCH_BODY_BYTES,
): Promise<string | null> {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > maxBytes) return null;
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // No stream available (for example a mocked Response): read, then guard
    // on the UTF-8 size of what was read.
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
