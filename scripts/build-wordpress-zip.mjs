#!/usr/bin/env node
/* global Buffer, console, process */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = join(repositoryRoot, 'packages', 'wordpress-plugin', 'corsen-context');
const mainFile = join(pluginRoot, 'corsen-context.php');
const readmeFile = join(pluginRoot, 'readme.txt');
const repositoryLicenseFile = join(repositoryRoot, 'LICENSE');
const pluginLicenseFile = join(pluginRoot, 'LICENSE');
const outputRoot = join(repositoryRoot, 'dist');

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function normalizedPath(path) {
  return path.split(sep).join('/');
}

async function collectPhpFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolutePath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in the plugin package: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectPhpFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith('.php')) {
      files.push(absolutePath);
    }
  }
  return files;
}

function readVersion(mainSource, readmeSource) {
  const header = mainSource.match(/^\s*\*\s*Version:\s*([^\r\n]+)$/m)?.[1]?.trim();
  const constant = mainSource.match(
    /define\(\s*'CORSEN_CONTEXT_VERSION'\s*,\s*'([^']+)'\s*\)/,
  )?.[1];
  const stableTag = readmeSource.match(/^Stable tag:\s*([^\r\n]+)$/m)?.[1]?.trim();
  if (!header || !constant || !stableTag) {
    throw new Error('Could not read the plugin header, runtime constant, and stable tag');
  }
  if (header !== constant || header !== stableTag) {
    throw new Error(
      `Plugin versions differ: header=${header}, constant=${constant}, stable=${stableTag}`,
    );
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(header)) {
    throw new Error(`Plugin version is not package-safe: ${header}`);
  }
  return header;
}

function makeLocalHeader(name, bytes) {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc32(bytes), 14);
  header.writeUInt32LE(bytes.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBytes, bytes]);
}

function makeCentralHeader(name, bytes, offset) {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(33, 14);
  header.writeUInt32LE(crc32(bytes), 16);
  header.writeUInt32LE(bytes.length, 20);
  header.writeUInt32LE(bytes.length, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0x81a40000, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBytes]);
}

function makeEndRecord(fileCount, centralSize, centralOffset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(fileCount, 8);
  end.writeUInt16LE(fileCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

async function buildArchive(entries) {
  if (entries.length === 0 || entries.length > 0xffff) {
    throw new Error(`Unsupported plugin file count: ${entries.length}`);
  }

  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const entry of entries) {
    if (entry.bytes.length > 0xffffffff) {
      throw new Error(`File is too large for the deterministic ZIP format: ${entry.name}`);
    }
    const local = makeLocalHeader(entry.name, entry.bytes);
    localRecords.push(local);
    centralRecords.push(makeCentralHeader(entry.name, entry.bytes, offset));
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const archive = Buffer.concat([
    ...localRecords,
    centralDirectory,
    makeEndRecord(entries.length, centralDirectory.length, offset),
  ]);
  if (archive.length > 0xffffffff) {
    throw new Error('Plugin archive is too large for the deterministic ZIP format');
  }
  return archive;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node scripts/build-wordpress-zip.mjs');
    console.log('Builds a deterministic source-only WordPress plugin ZIP in dist/.');
    return;
  }
  if (process.argv.length > 2) {
    throw new Error('Unsupported command-line argument');
  }

  const [mainSource, readmeSource, repositoryLicense, pluginLicense, includeFiles] =
    await Promise.all([
      readFile(mainFile, 'utf8'),
      readFile(readmeFile, 'utf8'),
      readFile(repositoryLicenseFile),
      readFile(pluginLicenseFile),
      collectPhpFiles(join(pluginRoot, 'includes')),
    ]);
  if (!pluginLicense.equals(repositoryLicense)) {
    throw new Error('WordPress LICENSE must be byte-for-byte identical to the repository LICENSE');
  }
  const version = readVersion(mainSource, readmeSource);
  const sourceFiles = [
    mainFile,
    join(pluginRoot, 'uninstall.php'),
    readmeFile,
    pluginLicenseFile,
    ...includeFiles,
  ];
  const entries = await Promise.all(
    sourceFiles.map(async (absolutePath) => ({
      name: `corsen-context/${normalizedPath(relative(pluginRoot, absolutePath))}`,
      bytes: await readFile(absolutePath),
    })),
  );
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

  const archive = await buildArchive(entries);
  const filename = `corsen-context-${version}.zip`;
  const outputPath = join(outputRoot, filename);
  const hash = createHash('sha256').update(archive).digest('hex');
  await mkdir(outputRoot, { recursive: true });
  await writeFile(outputPath, archive);
  await writeFile(`${outputPath}.sha256`, `${hash}  ${filename}\n`, 'utf8');

  console.log(`Built ${normalizedPath(relative(repositoryRoot, outputPath))}`);
  console.log(`Files: ${entries.length}`);
  console.log(`Bytes: ${archive.length}`);
  console.log(`SHA-256: ${hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'WordPress package build failed');
  process.exitCode = 1;
});
