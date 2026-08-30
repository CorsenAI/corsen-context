import { createLlmsTxtHandler } from '@corsenai/corsen-context-nextjs';
import { demoProvider, SITE_URL } from '../../lib/provider';

const config = {
  siteUrl: SITE_URL,
};

const GET = createLlmsTxtHandler(config, demoProvider);

export { GET };
