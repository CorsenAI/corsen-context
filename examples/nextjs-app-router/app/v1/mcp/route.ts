import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
import { demoProvider } from '../../../lib/provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://demo.example.com',
};

const { POST, OPTIONS } = createMCPHandler(config, demoProvider);

export { POST, OPTIONS };
