import { createLlmsTxtHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../lib/provider';

export const GET = createLlmsTxtHandler({ siteUrl: SITE_URL }, demoProvider);
