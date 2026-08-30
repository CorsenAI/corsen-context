import { createLlmsTxtHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../lib/provider';

export const GET = createLlmsTxtHandler(
  {
    siteUrl: SITE_URL,
    static: { generateLlmsTxt: process.env.CORSEN_CONTEXT_LLMS_TXT_ENABLED !== 'false' },
  },
  demoProvider,
);
