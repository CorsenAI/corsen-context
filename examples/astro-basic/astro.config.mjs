import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Server output: the MCP endpoint, llms.txt and the WebMCP bridge are API
// routes answered at request time by the Corsen Context Astro adapter.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
