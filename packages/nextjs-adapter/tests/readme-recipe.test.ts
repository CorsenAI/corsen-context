import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Upstash README recipe', () => {
  it('is exactly the compile-checked source fixture', async () => {
    const [readme, fixture] = await Promise.all([
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../src/upstash-recipe.typecheck.ts', import.meta.url), 'utf8'),
    ]);
    const block = readme.match(
      /<!-- upstash-recipe:start -->\s*```typescript\s*([\s\S]*?)\s*```\s*<!-- upstash-recipe:end -->/,
    )?.[1];

    expect(block?.replaceAll('\r\n', '\n').trim()).toBe(fixture.replaceAll('\r\n', '\n').trim());
  });
});
