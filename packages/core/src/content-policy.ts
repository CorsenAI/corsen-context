import type { ResolvedConfig } from './config.js';
import type { ContentListItem, PageContent, SearchResult } from './types.js';

function siteOrigin(config: ResolvedConfig): string {
  return new URL(config.siteUrl).origin;
}

function percentDecode(value: string): string | null {
  // Decode repeatedly (capped) so double-encoding like %2561 -> %61 -> a can't
  // slip an excluded path past the denylist comparison.
  let current = value;
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      // A malformed escape in the input is ambiguous. A literal percent that
      // appears only after decoding (for example %25) is no longer an escape.
      return i === 0 ? null : current;
    }
    if (decoded === current) break;
    current = decoded;
  }

  // Reject encodings nested beyond the bounded decoding budget.
  try {
    if (decodeURIComponent(current) !== current) return null;
  } catch {
    // A decoded literal percent is allowed; it cannot hide another escape.
  }
  return current;
}

function normalizePath(path: string): string | null {
  const decoded = percentDecode(path.trim());
  if (!decoded) return null;
  if (/[\\?#]/.test(decoded) || /\p{Cc}/u.test(decoded)) return null;

  const withSlash = decoded.startsWith('/') ? decoded : `/${decoded}`;
  // Repeated separators are rejected rather than silently canonicalized: a
  // downstream proxy and the application may otherwise disagree on the URL.
  if (withSlash.includes('//')) return null;
  const segments = withSlash.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  // Linear trailing-slash trim (no regex repetition: `//` already rejected
  // above, and a quantifier here is what static analysis flags as quadratic).
  let withoutTrailing = withSlash;
  while (withoutTrailing.length > 1 && withoutTrailing.endsWith('/')) {
    withoutTrailing = withoutTrailing.slice(0, -1);
  }
  return withoutTrailing || '/';
}

function rawPathFromInput(value: string): string | null {
  if (value.includes('\\') || value.startsWith('//')) return null;

  const scheme = /^[a-z][a-z\d+.-]*:\/\//i.exec(value);
  if (!scheme) {
    const delimiter = value.search(/[?#]/);
    return delimiter === -1 ? value : value.slice(0, delimiter);
  }

  const authorityStart = scheme[0].length;
  const delimiter = value.slice(authorityStart).search(/[?#]/);
  const end = delimiter === -1 ? value.length : authorityStart + delimiter;
  const pathStart = value.indexOf('/', authorityStart);
  if (pathStart === -1 || pathStart >= end) return '/';
  return value.slice(pathStart, end);
}

function pathFromUrlOrPath(value: string, config: ResolvedConfig): string | null {
  const rawPath = rawPathFromInput(value.trim());
  if (rawPath === null) return null;
  const normalizedRaw = normalizePath(rawPath);
  if (!normalizedRaw) return null;
  try {
    const parsed = new URL(value, config.siteUrl);
    const normalizedParsed = normalizePath(parsed.pathname);
    return normalizedParsed === normalizedRaw ? normalizedParsed : null;
  } catch {
    return normalizedRaw;
  }
}

function isExcludedPath(pathname: string, config: ResolvedConfig): boolean {
  const path = normalizePath(pathname);
  if (!path) return false;

  // Denylist match is case-insensitive so an excluded /admin can't be reached
  // as /ADMIN on servers that treat paths case-insensitively.
  const lowerPath = path.toLowerCase();
  return config.content.excludePaths.some((exclude) => {
    const excluded = pathFromUrlOrPath(exclude, config);
    if (!excluded || excluded === '/') return false;
    const lowerExcluded = excluded.toLowerCase();
    return lowerPath === lowerExcluded || lowerPath.startsWith(`${lowerExcluded}/`);
  });
}

export function resolvePublicPageUrl(input: string, config: ResolvedConfig): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const value = raw.startsWith('resource://')
    ? `/${raw.slice('resource://'.length).replace(/^\/+/, '')}`
    : raw;

  const rawPath = rawPathFromInput(value);
  if (rawPath === null) return null;
  const normalizedRawPath = normalizePath(rawPath);
  if (!normalizedRawPath) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, config.siteUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  if (parsed.username || parsed.password) return null;

  if (parsed.origin !== siteOrigin(config)) {
    return null;
  }

  const normalizedParsedPath = normalizePath(parsed.pathname);
  if (!normalizedParsedPath || normalizedParsedPath !== normalizedRawPath) return null;

  if (isExcludedPath(normalizedParsedPath, config)) {
    return null;
  }

  parsed.pathname = normalizedParsedPath;
  return parsed.toString();
}

export function isPublicListItem(item: ContentListItem, config: ResolvedConfig): boolean {
  if (!config.content.postTypes.includes(item.type)) {
    return false;
  }
  return resolvePublicPageUrl(item.url, config) !== null;
}

export function filterPublicPages(
  pages: ContentListItem[],
  config: ResolvedConfig,
): ContentListItem[] {
  const allowed: ContentListItem[] = [];
  for (const page of pages) {
    if (!isPublicListItem(page, config)) continue;
    allowed.push(page);
    if (allowed.length >= config.content.maxPages) break;
  }
  return allowed;
}

export function isPublicPageContent(content: PageContent, config: ResolvedConfig): boolean {
  return resolvePublicPageUrl(content.url, config) !== null;
}

export function filterPublicSearchResults(
  results: SearchResult[],
  config: ResolvedConfig,
  limit: number,
): SearchResult[] {
  const allowed: SearchResult[] = [];
  for (const result of results) {
    if (resolvePublicPageUrl(result.url, config) === null) continue;
    allowed.push(result);
    if (allowed.length >= limit) break;
  }
  return allowed;
}
