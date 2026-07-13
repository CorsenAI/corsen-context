import type { ResolvedConfig } from './config.js';
import type { ContentListItem, PageContent, SearchResult } from './types.js';

function siteOrigin(config: ResolvedConfig): string {
  return new URL(config.siteUrl).origin;
}

function percentDecode(value: string): string {
  // Decode repeatedly (capped) so double-encoding like %2561 -> %61 -> a can't
  // slip an excluded path past the denylist comparison.
  let current = value;
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return current; // malformed escape — stop decoding
    }
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function normalizePath(path: string): string | null {
  const trimmed = percentDecode(path.trim());
  if (!trimmed) return null;
  const withSlash = `/${trimmed.replace(/^\/+/, '')}`;
  const withoutTrailing = withSlash.replace(/\/+$/, '');
  return withoutTrailing || '/';
}

function pathFromUrlOrPath(value: string, config: ResolvedConfig): string | null {
  try {
    const parsed = new URL(value, config.siteUrl);
    return normalizePath(parsed.pathname);
  } catch {
    return normalizePath(value);
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

  let parsed: URL;
  try {
    parsed = new URL(value, config.siteUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  if (parsed.origin !== siteOrigin(config)) {
    return null;
  }

  if (isExcludedPath(parsed.pathname, config)) {
    return null;
  }

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
  return pages.filter((page) => isPublicListItem(page, config)).slice(0, config.content.maxPages);
}

export function isPublicPageContent(content: PageContent, config: ResolvedConfig): boolean {
  return resolvePublicPageUrl(content.url, config) !== null;
}

export function filterPublicSearchResults(
  results: SearchResult[],
  config: ResolvedConfig,
  limit: number,
): SearchResult[] {
  return results
    .filter((result) => resolvePublicPageUrl(result.url, config) !== null)
    .slice(0, limit);
}
