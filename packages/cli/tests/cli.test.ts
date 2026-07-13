import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFramework } from '../src/init.js';
import { parseArgs } from '../src/generate.js';

describe('parseArgs (generate)', () => {
  it('parses --url and --output', () => {
    expect(parseArgs(['--url', 'https://a.com', '--output', '/tmp'])).toEqual({
      url: 'https://a.com',
      output: '/tmp',
    });
  });

  it('parses short flags -u/-o and the --full flag', () => {
    expect(parseArgs(['-u', 'https://a.com', '--full'])).toEqual({
      url: 'https://a.com',
      full: true,
    });
  });

  it('ignores a flag with no following value', () => {
    expect(parseArgs(['--url'])).toEqual({});
  });
});

describe('detectFramework', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'corsen-cli-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function pkg(deps: Record<string, string>) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: deps }));
  }

  it('detects WordPress via wp-config.php', () => {
    writeFileSync(join(dir, 'wp-config.php'), '<?php');
    expect(detectFramework(dir).framework).toBe('wordpress');
  });

  it('detects Next.js App Router', () => {
    pkg({ next: '15.0.0' });
    mkdirSync(join(dir, 'app'));
    expect(detectFramework(dir).framework).toBe('nextjs-app');
  });

  it('detects Next.js Pages Router', () => {
    pkg({ next: '15.0.0' });
    expect(detectFramework(dir).framework).toBe('nextjs-pages');
  });

  it('detects Astro and Express', () => {
    pkg({ astro: '4.0.0' });
    expect(detectFramework(dir).framework).toBe('astro');
  });

  it('detects a static site via index.html', () => {
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    expect(detectFramework(dir).framework).toBe('static');
  });

  it('returns unknown for an empty directory', () => {
    expect(detectFramework(dir).framework).toBe('unknown');
  });
});
