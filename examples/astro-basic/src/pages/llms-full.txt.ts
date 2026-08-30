import { createLlmsFullTxtHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../lib/provider';

export const GET = createLlmsFullTxtHandler({ siteUrl: SITE_URL }, demoProvider);
