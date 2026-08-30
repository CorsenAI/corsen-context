import { createLlmsFullTxtHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../lib/provider';

export const GET = createLlmsFullTxtHandler(
  {
    siteUrl: SITE_URL,
    static: {
      generateLlmsTxt: process.env.CORSEN_CONTEXT_LLMS_TXT_ENABLED !== 'false',
      includeFullContent: process.env.CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED === 'true',
    },
  },
  demoProvider,
);
