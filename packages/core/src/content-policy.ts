import type { ResolvedConfig } from './config.js';
import type { ContentListItem, PageContent, SearchResult } from './types.js';

function siteOrigin(config: ResolvedConfig): string {
  return new URL(config.siteUrl).origin;
}

function normalizePath(path: string): string | null {
  const trimmed = path.trim();
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

  return config.content.excludePaths.some((exclude) => {
    const excluded = pathFromUrlOrPath(exclude, config);
    if (!excluded || excluded === '/') return false;
    return path === excluded || path.startsWith(`${excluded}/`);
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
