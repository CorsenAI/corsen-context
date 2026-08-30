import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const EXPECTED_PACKAGE_NAMES = Object.freeze([
  '@corsenai/corsen-context',
  '@corsenai/corsen-context-nextjs',
  '@corsenai/corsen-context-astro',
  '@corsenai/corsen-context-cli',
]);

const EXPECTED_PACKAGE_SET = new Set(EXPECTED_PACKAGE_NAMES);
const PUBLIC_REGISTRY = 'https://registry.npmjs.org/';
const MAX_MANIFEST_BYTES = 2_048;

function fail(message) {
  throw new Error(message);
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateVersion(version) {
  if (
    typeof version !== 'string' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    fail('EXPECTED_VERSION is not a supported SemVer value.');
  }
  return version;
}

function validateExpectedIdentity(name, version, expectedVersion, source) {
  if (!EXPECTED_PACKAGE_SET.has(name) || version !== expectedVersion) {
    fail(`${source} contains an unexpected package identity or version: ${name}@${version}.`);
  }
}

function integrity(buffer, algorithm) {
  return `${algorithm}-${createHash(algorithm).update(buffer).digest('base64')}`;
}

function validateSha512(value, source) {
  if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    fail(`${source} does not contain a valid SHA-512 integrity.`);
  }
  const digest = Buffer.from(value.slice('sha512-'.length), 'base64');
  if (digest.length !== 64 || `sha512-${digest.toString('base64')}` !== value) {
    fail(`${source} does not contain a canonical SHA-512 integrity.`);
  }
  return value;
}

function resolveInside(root, candidate, label) {
  if (typeof candidate !== 'string' || candidate.length === 0 || isAbsolute(candidate)) {
    fail(`${label} is not a relative path.`);
  }
  const absoluteRoot = resolve(root);
  const absoluteCandidate = resolve(absoluteRoot, candidate);
  const relativePath = relative(absoluteRoot, absoluteCandidate);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    fail(`${label} escapes the approved pack directory.`);
  }
  return absoluteCandidate;
}

async function readTarballPackageJson(tarballPath) {
  const result = spawnSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(`Could not read package/package.json from ${tarballPath}: ${result.stderr.trim()}`);
  }
  return parseJson(result.stdout, `${tarballPath} package.json`);
}

export function validateCandidateManifest(manifest, expectedVersion) {
  validateVersion(expectedVersion);
  if (manifest === undefined || manifest === null) {
    fail('The candidate manifest must be an array.');
  }
  const raw = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  if (typeof raw !== 'string') {
    fail('The candidate manifest must be an array.');
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_MANIFEST_BYTES) {
    fail(`The candidate manifest exceeds ${MAX_MANIFEST_BYTES} bytes.`);
  }
  const records =
    typeof manifest === 'string' ? parseJson(manifest, 'Candidate manifest') : manifest;
  if (!Array.isArray(records)) {
    fail('The candidate manifest must be an array.');
  }

  const byName = new Map();
  for (const record of records) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      fail('The candidate manifest contains a non-object entry.');
    }
    const keys = Object.keys(record).sort();
    if (keys.join(',') !== 'integrity,name,version') {
      fail('Each candidate manifest entry must contain exactly name, version, and integrity.');
    }
    validateExpectedIdentity(
      record.name,
      record.version,
      expectedVersion,
      'The candidate manifest',
    );
    if (byName.has(record.name)) {
      fail(`The candidate manifest contains a duplicate package: ${record.name}.`);
    }
    validateSha512(record.integrity, `The candidate manifest entry for ${record.name}`);
    byName.set(record.name, {
      name: record.name,
      version: record.version,
      integrity: record.integrity,
    });
  }

  const missing = EXPECTED_PACKAGE_NAMES.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    fail(`The candidate manifest is missing: ${missing.join(', ')}.`);
  }
  if (byName.size !== EXPECTED_PACKAGE_NAMES.length) {
    fail('The candidate manifest must contain exactly the four approved packages.');
  }
  return byName;
}

export async function createCandidateManifest(tarballFiles, expectedVersion) {
  validateVersion(expectedVersion);
  if (!Array.isArray(tarballFiles)) {
    fail('Candidate tarball files must be an array.');
  }

  const pathsByName = new Map();
  for (const entry of tarballFiles) {
    if (!EXPECTED_PACKAGE_SET.has(entry?.name)) {
      fail(`Candidate tarball files contain an unexpected package: ${entry?.name}.`);
    }
    if (pathsByName.has(entry.name)) {
      fail(`Candidate tarball files contain a duplicate package: ${entry.name}.`);
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      fail(`Candidate tarball path is missing for ${entry.name}.`);
    }
    pathsByName.set(entry.name, entry.path);
  }

  const records = [];
  for (const name of EXPECTED_PACKAGE_NAMES) {
    const tarballPath = pathsByName.get(name);
    if (!tarballPath) fail(`Candidate tarball file is missing for ${name}.`);
    const bytes = await readFile(tarballPath);
    const packageJson = await readTarballPackageJson(tarballPath);
    validateExpectedIdentity(
      packageJson.name,
      packageJson.version,
      expectedVersion,
      'A candidate tarball',
    );
    if (packageJson.name !== name) {
      fail(`Candidate tarball content does not match its expected identity: ${name}.`);
    }
    records.push({ name, version: expectedVersion, integrity: integrity(bytes, 'sha512') });
  }

  validateCandidateManifest(records, expectedVersion);
  return records;
}

function requireCandidateManifestMap(candidateManifest, expectedVersion) {
  if (!(candidateManifest instanceof Map)) {
    fail('A validated complete candidate manifest is required.');
  }
  return validateCandidateManifest([...candidateManifest.values()], expectedVersion);
}

export function validatePublicationReceipt({
  published,
  publishedPackages,
  expectedVersion,
  plannedNames,
}) {
  validateVersion(expectedVersion);
  if (published !== 'true') {
    fail('Changesets did not report a publication during this run.');
  }

  const receipt =
    typeof publishedPackages === 'string'
      ? parseJson(publishedPackages || '[]', 'PUBLISHED_PACKAGES')
      : publishedPackages;
  if (
    !Array.isArray(receipt) ||
    receipt.length === 0 ||
    receipt.length > EXPECTED_PACKAGE_NAMES.length
  ) {
    fail('The publication receipt must contain a non-empty subset of the four approved packages.');
  }

  const approvedPlan = plannedNames === undefined ? undefined : new Set(plannedNames);
  const seen = new Set();
  for (const item of receipt) {
    if (typeof item !== 'object' || item === null) {
      fail('The publication receipt contains a non-object entry.');
    }
    validateExpectedIdentity(item.name, item.version, expectedVersion, 'The publication receipt');
    if (seen.has(item.name)) {
      fail(`The publication receipt contains a duplicate package: ${item.name}.`);
    }
    if (approvedPlan !== undefined && !approvedPlan.has(item.name)) {
      fail(
        `The publication receipt contains a package absent from the approved pack: ${item.name}.`,
      );
    }
    seen.add(item.name);
  }

  return receipt;
}

export async function validateApprovedPack(packDir, expectedVersion, candidateManifest) {
  validateVersion(expectedVersion);
  const completeManifest = requireCandidateManifestMap(candidateManifest, expectedVersion);
  const planPath = join(resolve(packDir), 'publish-plan.json');
  const planDocument = parseJson(await readFile(planPath, 'utf8'), 'Approved publish plan');
  if (planDocument?.version !== 1 || !Array.isArray(planDocument.plan)) {
    fail('The approved publish plan has an unsupported structure.');
  }

  const releases = planDocument.plan.flatMap((group) => {
    if (!Array.isArray(group)) fail('The approved publish plan contains an invalid group.');
    return group;
  });
  if (releases.length === 0 || releases.length > EXPECTED_PACKAGE_NAMES.length) {
    fail('The approved publish plan must contain a non-empty subset of the four packages.');
  }

  const tarballs = new Map();
  for (const release of releases) {
    if (typeof release !== 'object' || release === null || release.kind !== 'publish') {
      fail('The approved publish plan contains an unsupported release entry.');
    }
    validateExpectedIdentity(
      release.name,
      release.version,
      expectedVersion,
      'The approved publish plan',
    );
    if (release.access !== 'public' || release.tag !== 'latest') {
      fail(`The approved publish plan has unsafe publication settings for ${release.name}.`);
    }
    if (tarballs.has(release.name)) {
      fail(`The approved publish plan contains a duplicate package: ${release.name}.`);
    }

    const tarballPath = resolveInside(
      packDir,
      release.tarball?.path,
      `${release.name} tarball path`,
    );
    const bytes = await readFile(tarballPath);
    const sha256 = integrity(bytes, 'sha256');
    if (release.tarball?.integrity !== sha256) {
      fail(`The approved SHA-256 integrity does not match ${release.name}.`);
    }

    const packageJson = await readTarballPackageJson(tarballPath);
    validateExpectedIdentity(
      packageJson.name,
      packageJson.version,
      expectedVersion,
      'An approved tarball',
    );
    if (packageJson.name !== release.name || packageJson.version !== release.version) {
      fail(`The approved tarball content does not match its publish-plan entry: ${release.name}.`);
    }

    const sha512 = integrity(bytes, 'sha512');
    const candidate = completeManifest.get(release.name);
    if (!candidate || candidate.integrity !== sha512) {
      fail(
        `The Changesets tarball does not match the complete candidate manifest for ${release.name}.`,
      );
    }

    tarballs.set(release.name, {
      path: tarballPath,
      sha256,
      sha512,
    });
  }

  return tarballs;
}

async function inspectRegistryPackage({
  name,
  expectedVersion,
  fetchImpl,
  registry,
  allowNotFound = false,
}) {
  const metadataUrl = new URL(
    `${encodeURIComponent(name)}/${encodeURIComponent(expectedVersion)}`,
    registry,
  );
  const metadataResponse = await fetchImpl(metadataUrl, {
    headers: { accept: 'application/json' },
    redirect: 'error',
  });
  if (allowNotFound && metadataResponse.status === 404) {
    return { state: 'absent', name, version: expectedVersion };
  }
  if (metadataResponse.status !== 200) {
    throw new Error(`unexpected metadata HTTP ${metadataResponse.status}`);
  }

  const metadata = await metadataResponse.json();
  validateExpectedIdentity(metadata.name, metadata.version, expectedVersion, 'The npm registry');
  const registryIntegrity = validateSha512(
    metadata.dist?.integrity,
    `The npm registry entry for ${name}`,
  );

  const tarballUrl = new URL(metadata.dist?.tarball);
  if (
    tarballUrl.origin !== new URL(PUBLIC_REGISTRY).origin ||
    tarballUrl.username ||
    tarballUrl.password ||
    tarballUrl.search ||
    tarballUrl.hash
  ) {
    throw new Error('registry metadata contains an unexpected tarball URL');
  }

  const tarballResponse = await fetchImpl(tarballUrl, { redirect: 'error' });
  if (tarballResponse.status !== 200) {
    throw new Error(`unexpected tarball HTTP ${tarballResponse.status}`);
  }
  const tarball = Buffer.from(await tarballResponse.arrayBuffer());
  if (integrity(tarball, 'sha512') !== registryIntegrity) {
    throw new Error('downloaded tarball does not match registry integrity');
  }

  const extractDir = await mkdtemp(join(tmpdir(), 'corsen-npm-receipt-'));
  try {
    const tarballPath = join(extractDir, 'package.tgz');
    await writeFile(tarballPath, tarball);
    const packageJson = await readTarballPackageJson(tarballPath);
    validateExpectedIdentity(
      packageJson.name,
      packageJson.version,
      expectedVersion,
      'A registry tarball',
    );
    if (packageJson.name !== name) {
      fail(`The registry tarball identity does not match its metadata: ${name}.`);
    }
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }

  return {
    state: 'present',
    name,
    version: expectedVersion,
    integrity: registryIntegrity,
  };
}

async function inspectRegistryPackument({
  name,
  expectedVersion,
  fetchImpl,
  registry,
  allowNotFound = false,
}) {
  const packumentUrl = new URL(encodeURIComponent(name), registry);
  const response = await fetchImpl(packumentUrl, {
    headers: { accept: 'application/json' },
    redirect: 'error',
  });
  if (allowNotFound && response.status === 404) {
    return { state: 'absent', name };
  }
  if (response.status !== 200) {
    throw new Error(`unexpected packument HTTP ${response.status}`);
  }

  const packument = await response.json();
  if (
    typeof packument !== 'object' ||
    packument === null ||
    Array.isArray(packument) ||
    packument.name !== name ||
    (packument._id !== undefined && packument._id !== name)
  ) {
    fail(`The npm packument contains an unexpected package identity for ${name}.`);
  }
  const latest = packument['dist-tags']?.latest;
  if (typeof latest !== 'string' || latest.length === 0) {
    fail(`The npm packument has no valid dist-tags.latest for ${name}.`);
  }

  return { state: 'present', name, version: expectedVersion, latest };
}

async function fetchRegistryPackage({
  name,
  expectedVersion,
  fetchImpl,
  registry,
  attempts,
  delayMs,
}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await inspectRegistryPackage({
        name,
        expectedVersion,
        fetchImpl,
        registry,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
      }
    }
  }

  fail(
    `Could not verify ${name}@${expectedVersion} on npm after ${attempts} attempts: ${lastError.message}`,
  );
}

async function fetchRegistryPackument({
  name,
  expectedVersion,
  fetchImpl,
  registry,
  attempts,
  delayMs,
}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const packument = await inspectRegistryPackument({
        name,
        expectedVersion,
        fetchImpl,
        registry,
      });
      if (packument.latest !== expectedVersion) {
        throw new Error(`dist-tags.latest is ${packument.latest}, expected ${expectedVersion}`);
      }
      return packument;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
      }
    }
  }

  fail(
    `Could not verify dist-tags.latest for ${name} on npm after ${attempts} attempts: ${lastError.message}`,
  );
}

export async function verifyRegistryPreflight({
  expectedVersion,
  candidateManifest,
  plannedNames,
  requireExistingCandidate = false,
  fetchImpl = fetch,
  registry = PUBLIC_REGISTRY,
}) {
  validateVersion(expectedVersion);
  const completeManifest = requireCandidateManifestMap(candidateManifest, expectedVersion);
  if (registry !== PUBLIC_REGISTRY) {
    fail(`Registry must be ${PUBLIC_REGISTRY}.`);
  }
  if (!plannedNames || typeof plannedNames[Symbol.iterator] !== 'function') {
    fail('The approved publish plan names must be iterable.');
  }

  const planned = new Set();
  for (const name of plannedNames) {
    if (!EXPECTED_PACKAGE_SET.has(name)) {
      fail(`The approved publish plan contains an unexpected package: ${name}.`);
    }
    if (planned.has(name)) {
      fail(`The approved publish plan contains a duplicate package: ${name}.`);
    }
    planned.add(name);
  }
  if (planned.size === 0 || planned.size > EXPECTED_PACKAGE_NAMES.length) {
    fail('The approved publish plan must contain a non-empty subset of the four packages.');
  }

  const registryPackages = await Promise.all(
    EXPECTED_PACKAGE_NAMES.map(async (name) => {
      const [registryPackage, packument] = await Promise.all([
        inspectRegistryPackage({
          name,
          expectedVersion,
          fetchImpl,
          registry,
          allowNotFound: true,
        }),
        inspectRegistryPackument({
          name,
          expectedVersion,
          fetchImpl,
          registry,
          allowNotFound: true,
        }),
      ]);
      const isPlanned = planned.has(name);

      if (registryPackage.state === 'absent') {
        if (!isPlanned) {
          fail(
            `${name}@${expectedVersion} is absent from npm but missing from the approved publish plan.`,
          );
        }
        return registryPackage;
      }

      const candidate = completeManifest.get(name);
      if (!candidate || registryPackage.integrity !== candidate.integrity) {
        fail(
          `The npm SHA-512 integrity does not match the complete candidate manifest for ${name}.`,
        );
      }
      if (isPlanned) {
        fail(
          `${name}@${expectedVersion} is already visible on npm but remains in the approved publish plan; retry the workflow.`,
        );
      }
      if (packument.state !== 'present' || packument.latest !== expectedVersion) {
        fail(`The npm dist-tags.latest does not match ${expectedVersion} for ${name}.`);
      }
      return registryPackage;
    }),
  );
  if (
    requireExistingCandidate &&
    !registryPackages.some((registryPackage) => registryPackage.state === 'present')
  ) {
    fail(
      'An older main commit may publish only as a partial-release recovery with at least one matching version already on npm.',
    );
  }
  return registryPackages;
}

export async function verifyRegistryRelease({
  expectedVersion,
  candidateManifest,
  fetchImpl = fetch,
  registry = PUBLIC_REGISTRY,
  attempts = 20,
  delayMs = 3_000,
}) {
  validateVersion(expectedVersion);
  const completeManifest = requireCandidateManifestMap(candidateManifest, expectedVersion);
  if (registry !== PUBLIC_REGISTRY) {
    fail(`Registry must be ${PUBLIC_REGISTRY}.`);
  }

  return Promise.all(
    EXPECTED_PACKAGE_NAMES.map(async (name) => {
      const registryPackage = await fetchRegistryPackage({
        name,
        expectedVersion,
        fetchImpl,
        registry,
        attempts,
        delayMs,
      });
      const candidate = completeManifest.get(name);
      if (!candidate || registryPackage.integrity !== candidate.integrity) {
        fail(
          `The npm SHA-512 integrity does not match the complete candidate manifest for ${name}.`,
        );
      }
      const packument = await fetchRegistryPackument({
        name,
        expectedVersion,
        fetchImpl,
        registry,
        attempts,
        delayMs,
      });
      return { ...registryPackage, latest: packument.latest };
    }),
  );
}

async function main() {
  const expectedVersion = validateVersion(process.env.EXPECTED_VERSION);
  if (process.env.NPM_CONFIG_USERCONFIG !== '/dev/null') {
    fail('NPM_CONFIG_USERCONFIG must be /dev/null.');
  }
  if ((process.env.NPM_CONFIG_REGISTRY || PUBLIC_REGISTRY) !== PUBLIC_REGISTRY) {
    fail(`NPM_CONFIG_REGISTRY must be ${PUBLIC_REGISTRY}.`);
  }
  if (process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN) {
    fail('Long-lived npm credentials are not allowed.');
  }

  if (process.argv.includes('--create-manifest')) {
    const records = await createCandidateManifest(
      [
        { name: '@corsenai/corsen-context', path: process.env.CANDIDATE_CORE_TARBALL },
        {
          name: '@corsenai/corsen-context-nextjs',
          path: process.env.CANDIDATE_NEXTJS_TARBALL,
        },
        { name: '@corsenai/corsen-context-astro', path: process.env.CANDIDATE_ASTRO_TARBALL },
        { name: '@corsenai/corsen-context-cli', path: process.env.CANDIDATE_CLI_TARBALL },
      ],
      expectedVersion,
    );
    const manifest = JSON.stringify(records);
    if (Buffer.byteLength(manifest, 'utf8') > MAX_MANIFEST_BYTES) {
      fail(`The candidate manifest exceeds ${MAX_MANIFEST_BYTES} bytes.`);
    }
    if (!process.env.GITHUB_OUTPUT)
      fail('GITHUB_OUTPUT is required to emit the candidate manifest.');
    await appendFile(process.env.GITHUB_OUTPUT, `candidate_manifest=${manifest}\n`, 'utf8');
    console.log(`Created a complete ${records.length}-package candidate manifest.`);
    return;
  }

  const candidateManifest = validateCandidateManifest(
    process.env.CANDIDATE_MANIFEST,
    expectedVersion,
  );

  if (process.argv.includes('--registry-verification-only')) {
    const registryPackages = await verifyRegistryRelease({
      expectedVersion,
      candidateManifest,
      registry: process.env.NPM_CONFIG_REGISTRY || PUBLIC_REGISTRY,
    });
    for (const item of registryPackages) {
      console.log(
        `Verified existing npm release: ${item.name}@${item.version} (${item.integrity}, latest=${item.latest})`,
      );
    }
    return;
  }

  const packDir = process.env.APPROVED_PACK_DIR;
  if (!packDir) fail('APPROVED_PACK_DIR is required.');

  const approvedTarballs = await validateApprovedPack(packDir, expectedVersion, candidateManifest);
  if (process.argv.includes('--pack-only')) {
    console.log(`Verified ${approvedTarballs.size} approved package tarball(s).`);
    return;
  }
  if (process.argv.includes('--registry-preflight')) {
    const expectedCommit = process.env.EXPECTED_COMMIT;
    const dispatchHead = process.env.DISPATCH_HEAD;
    if (
      typeof expectedCommit !== 'string' ||
      !/^[0-9a-f]{40}$/.test(expectedCommit) ||
      typeof dispatchHead !== 'string' ||
      !/^[0-9a-f]{40}$/.test(dispatchHead)
    ) {
      fail('EXPECTED_COMMIT and DISPATCH_HEAD must be full lowercase SHAs.');
    }
    const registryPackages = await verifyRegistryPreflight({
      expectedVersion,
      candidateManifest,
      plannedNames: approvedTarballs.keys(),
      requireExistingCandidate: expectedCommit !== dispatchHead,
      registry: process.env.NPM_CONFIG_REGISTRY || PUBLIC_REGISTRY,
    });
    for (const item of registryPackages) {
      console.log(
        item.state === 'present'
          ? `Verified existing npm package: ${item.name}@${item.version} (${item.integrity})`
          : `Verified missing npm package is approved for publication: ${item.name}@${item.version}`,
      );
    }
    return;
  }

  const receipt = validatePublicationReceipt({
    published: process.env.PUBLISHED,
    publishedPackages: process.env.PUBLISHED_PACKAGES,
    expectedVersion,
    plannedNames: approvedTarballs.keys(),
  });
  for (const item of receipt)
    console.log(`Published during this run: ${item.name}@${item.version}`);

  const registryPackages = await verifyRegistryRelease({
    expectedVersion,
    candidateManifest,
    registry: process.env.NPM_CONFIG_REGISTRY || PUBLIC_REGISTRY,
  });
  for (const item of registryPackages) {
    console.log(`Verified on npm: ${item.name}@${item.version} (${item.integrity})`);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
