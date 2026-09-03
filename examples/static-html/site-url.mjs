/**
 * Resolve the canonical origin for local runs and Netlify deploys.
 * SITE_URL remains the explicit override for custom domains.
 */
export function resolveSiteUrl() {
  const netlifyUrl =
    process.env.CONTEXT === 'deploy-preview'
      ? process.env.DEPLOY_PRIME_URL
      : process.env.URL || process.env.DEPLOY_PRIME_URL;
  const candidate = process.env.SITE_URL || netlifyUrl || 'http://localhost:3010';

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('SITE_URL must be an absolute http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('SITE_URL must use http or https');
  }
  return parsed.origin;
}

export const SITE_URL = resolveSiteUrl();
