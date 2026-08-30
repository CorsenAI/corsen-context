import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';

import {
  EXPECTED_PACKAGE_NAMES,
  validateApprovedPack,
  validateCandidateManifest,
  validatePublicationReceipt,
  verifyRegistryPreflight,
  verifyRegistryRelease,
} from './verify-npm-release.mjs';

const version = '2.0.0';
const completeReceipt = EXPECTED_PACKAGE_NAMES.map((name) => ({ name, version }));
const sri = (algorithm, bytes) =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;
const sha512 = (bytes) => sri('sha512', bytes);
const completeManifest = EXPECTED_PACKAGE_NAMES.map((name) => ({
  name,
  version,
  integrity: sha512(Buffer.from(`candidate:${name}`)),
}));

describe('npm publication receipt recovery', () => {
  it('accepts an initial release that publishes all four approved packages', () => {
    assert.deepEqual(
      validatePublicationReceipt({
        published: 'true',
        publishedPackages: JSON.stringify(completeReceipt),
        expectedVersion: version,
        plannedNames: EXPECTED_PACKAGE_NAMES,
      }),
      completeReceipt,
    );
  });

  it('accepts a retry that publishes only the remaining approved subset', () => {
    const retryReceipt = completeReceipt.slice(2);
    assert.deepEqual(
      validatePublicationReceipt({
        published: 'true',
        publishedPackages: JSON.stringify(retryReceipt),
        expectedVersion: version,
        plannedNames: retryReceipt.map(({ name }) => name),
      }),
      retryReceipt,
    );
  });

  it('rejects an unexpected identity even when its version matches', () => {
    assert.throws(
      () =>
        validatePublicationReceipt({
          published: 'true',
          publishedPackages: JSON.stringify([{ name: '@unexpected/package', version }]),
          expectedVersion: version,
          plannedNames: EXPECTED_PACKAGE_NAMES,
        }),
      /unexpected package identity or version/,
    );
  });

  it('does not accept published=false in publish mode', () => {
    assert.throws(
      () =>
        validatePublicationReceipt({
          published: 'false',
          publishedPackages: '[]',
          expectedVersion: version,
          plannedNames: EXPECTED_PACKAGE_NAMES,
        }),
      /did not report a publication/,
    );
  });
});

describe('complete candidate manifest', () => {
  it('accepts exactly the four approved names, versions, and SHA-512 integrities', () => {
    const validated = validateCandidateManifest(JSON.stringify(completeManifest), version);
    assert.deepEqual([...validated.keys()], EXPECTED_PACKAGE_NAMES);
  });

  it('rejects a duplicate package', () => {
    assert.throws(
      () =>
        validateCandidateManifest(
          [completeManifest[0], completeManifest[0], ...completeManifest.slice(1, 3)],
          version,
        ),
      /duplicate package/,
    );
  });

  it('rejects a missing package', () => {
    assert.throws(
      () => validateCandidateManifest(completeManifest.slice(0, 3), version),
      /candidate manifest is missing/,
    );
  });
});

async function createTarball(root, name, marker) {
  const fixtureDir = join(root, `${name.replace(/[^A-Za-z0-9]/g, '_')}-${marker}`);
  const packageDir = join(fixtureDir, 'package');
  const tarballPath = join(fixtureDir, 'package.tgz');
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version }), 'utf8');
  await writeFile(join(packageDir, 'marker.txt'), marker, 'utf8');
  const packed = spawnSync('tar', ['-czf', tarballPath, '-C', fixtureDir, 'package'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (packed.status !== 0) throw new Error(packed.stderr);
  const bytes = await readFile(tarballPath);
  return { bytes, integrity: sha512(bytes) };
}

describe('pre-publish npm registry preflight', () => {
  let fixtureRoot;
  let candidateManifest;
  let candidateTarballs;
  let differentCoreTarball;

  before(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'corsen-release-preflight-test-'));
    candidateTarballs = new Map();
    const candidateRecords = [];
    for (const name of EXPECTED_PACKAGE_NAMES) {
      const candidate = await createTarball(fixtureRoot, name, 'candidate');
      candidateTarballs.set(name, candidate);
      candidateRecords.push({ name, version, integrity: candidate.integrity });
    }
    differentCoreTarball = await createTarball(
      fixtureRoot,
      '@corsenai/corsen-context',
      'different-registry-bytes',
    );
    candidateManifest = validateCandidateManifest(candidateRecords, version);
  });

  after(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  function createRegistryFetch({
    presentNames = [],
    registryTarballs = candidateTarballs,
    metadataStatuses = new Map(),
    integrityOverrides = new Map(),
    tarballUrlOverrides = new Map(),
    packumentStatuses = new Map(),
    latestOverrides = new Map(),
  } = {}) {
    const present = new Set(presentNames);
    return async (input) => {
      const url = new URL(input);
      if (url.pathname.startsWith('/mock-tarball/')) {
        const name = decodeURIComponent(url.pathname.slice('/mock-tarball/'.length, -4));
        return new Response(registryTarballs.get(name).bytes, { status: 200 });
      }

      const pathParts = url.pathname.slice(1).split('/');
      const [encodedName] = pathParts;
      const name = decodeURIComponent(encodedName);
      if (pathParts.length === 1) {
        if (packumentStatuses.has(name)) {
          return new Response(null, { status: packumentStatuses.get(name) });
        }
        return new Response(
          JSON.stringify({
            _id: name,
            name,
            'dist-tags': {
              latest: latestOverrides.get(name) ?? (present.has(name) ? version : '1.3.0'),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (metadataStatuses.has(name)) {
        return new Response(null, { status: metadataStatuses.get(name) });
      }
      if (!present.has(name)) return new Response(null, { status: 404 });

      const registryTarball = registryTarballs.get(name);
      return new Response(
        JSON.stringify({
          name,
          version,
          dist: {
            integrity: integrityOverrides.get(name) ?? registryTarball.integrity,
            tarball:
              tarballUrlOverrides.get(name) ??
              `https://registry.npmjs.org/mock-tarball/${encodeURIComponent(name)}.tgz`,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
  }

  it('accepts an initial release when all four versions are absent and planned', async () => {
    const result = await verifyRegistryPreflight({
      expectedVersion: version,
      candidateManifest,
      plannedNames: EXPECTED_PACKAGE_NAMES,
      fetchImpl: createRegistryFetch(),
    });

    assert.deepEqual(
      result.map(({ name, state }) => ({ name, state })),
      EXPECTED_PACKAGE_NAMES.map((name) => ({ name, state: 'absent' })),
    );
  });

  it('accepts a retry when existing versions match and only absent versions are planned', async () => {
    const existingNames = EXPECTED_PACKAGE_NAMES.slice(0, 2);
    const plannedNames = EXPECTED_PACKAGE_NAMES.slice(2);
    const result = await verifyRegistryPreflight({
      expectedVersion: version,
      candidateManifest,
      plannedNames,
      fetchImpl: createRegistryFetch({ presentNames: existingNames }),
    });

    assert.deepEqual(
      result.map(({ name, state }) => ({ name, state })),
      EXPECTED_PACKAGE_NAMES.map((name) => ({
        name,
        state: existingNames.includes(name) ? 'present' : 'absent',
      })),
    );
  });

  it('rejects an older main commit when all four versions are absent', async () => {
    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES,
        requireExistingCandidate: true,
        fetchImpl: createRegistryFetch(),
      }),
      /older main commit may publish only as a partial-release recovery/,
    );
  });

  it('accepts an older main commit for a proven partial-release recovery', async () => {
    const existingNames = EXPECTED_PACKAGE_NAMES.slice(0, 1);
    const result = await verifyRegistryPreflight({
      expectedVersion: version,
      candidateManifest,
      plannedNames: EXPECTED_PACKAGE_NAMES.slice(1),
      requireExistingCandidate: true,
      fetchImpl: createRegistryFetch({ presentNames: existingNames }),
    });

    assert.equal(result.filter(({ state }) => state === 'present').length, 1);
  });

  it('rejects a mismatched pre-existing version before publication', async () => {
    const coreName = '@corsenai/corsen-context';
    const registryTarballs = new Map(candidateTarballs);
    registryTarballs.set(coreName, differentCoreTarball);

    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES.slice(1),
        fetchImpl: createRegistryFetch({ presentNames: [coreName], registryTarballs }),
      }),
      /complete candidate manifest for @corsenai\/corsen-context/,
    );
  });

  it('rejects a planned package that became visible after the pack was created', async () => {
    const coreName = '@corsenai/corsen-context';
    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES,
        fetchImpl: createRegistryFetch({ presentNames: [coreName] }),
      }),
      /already visible on npm but remains in the approved publish plan/,
    );
  });

  it('rejects an absent package outside the approved publish plan', async () => {
    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES.slice(1),
        fetchImpl: createRegistryFetch(),
      }),
      /absent from npm but missing from the approved publish plan/,
    );
  });

  it('fails closed on an unexpected registry status', async () => {
    const coreName = '@corsenai/corsen-context';
    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES,
        fetchImpl: createRegistryFetch({ metadataStatuses: new Map([[coreName, 503]]) }),
      }),
      /unexpected metadata HTTP 503/,
    );
  });

  it('fails closed on an unexpected registry tarball URL', async () => {
    const coreName = '@corsenai/corsen-context';
    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES.slice(1),
        fetchImpl: createRegistryFetch({
          presentNames: [coreName],
          tarballUrlOverrides: new Map([[coreName, 'https://example.com/package.tgz']]),
        }),
      }),
      /unexpected tarball URL/,
    );
  });

  it('fails closed on a malformed registry integrity', async () => {
    const coreName = '@corsenai/corsen-context';
    await assert.rejects(
      verifyRegistryPreflight({
        expectedVersion: version,
        candidateManifest,
        plannedNames: EXPECTED_PACKAGE_NAMES.slice(1),
        fetchImpl: createRegistryFetch({
          presentNames: [coreName],
          integrityOverrides: new Map([[coreName, 'sha512-not-canonical']]),
        }),
      }),
      /does not contain a canonical SHA-512 integrity|does not contain a valid SHA-512 integrity/,
    );
  });

  it('accepts verification-only recovery when exact4 tarballs and latest tags match', async () => {
    const requested = [];
    const registryFetch = createRegistryFetch({ presentNames: EXPECTED_PACKAGE_NAMES });
    const fetchImpl = async (input, options) => {
      requested.push(new URL(input));
      return registryFetch(input, options);
    };

    const result = await verifyRegistryRelease({
      expectedVersion: version,
      candidateManifest,
      fetchImpl,
      attempts: 1,
      delayMs: 0,
    });

    assert.equal(result.length, EXPECTED_PACKAGE_NAMES.length);
    assert.ok(result.every(({ latest }) => latest === version));
    const packumentNames = requested
      .filter((url) => !url.pathname.startsWith('/mock-tarball/'))
      .filter((url) => url.pathname.slice(1).split('/').length === 1)
      .map((url) => decodeURIComponent(url.pathname.slice(1)));
    assert.deepEqual(packumentNames.sort(), [...EXPECTED_PACKAGE_NAMES].sort());
  });

  it('rejects verification-only recovery when an exact version is missing', async () => {
    await assert.rejects(
      verifyRegistryRelease({
        expectedVersion: version,
        candidateManifest,
        fetchImpl: createRegistryFetch({ presentNames: EXPECTED_PACKAGE_NAMES.slice(1) }),
        attempts: 1,
        delayMs: 0,
      }),
      /unexpected metadata HTTP 404/,
    );
  });

  it('rejects verification-only recovery when an existing tarball mismatches', async () => {
    const coreName = '@corsenai/corsen-context';
    const registryTarballs = new Map(candidateTarballs);
    registryTarballs.set(coreName, differentCoreTarball);

    await assert.rejects(
      verifyRegistryRelease({
        expectedVersion: version,
        candidateManifest,
        fetchImpl: createRegistryFetch({
          presentNames: EXPECTED_PACKAGE_NAMES,
          registryTarballs,
        }),
        attempts: 1,
        delayMs: 0,
      }),
      /complete candidate manifest for @corsenai\/corsen-context/,
    );
  });

  it('rejects verification-only recovery when a latest tag is stale', async () => {
    const coreName = '@corsenai/corsen-context';
    await assert.rejects(
      verifyRegistryRelease({
        expectedVersion: version,
        candidateManifest,
        fetchImpl: createRegistryFetch({
          presentNames: EXPECTED_PACKAGE_NAMES,
          latestOverrides: new Map([[coreName, '1.2.0']]),
        }),
        attempts: 1,
        delayMs: 0,
      }),
      /dist-tags\.latest is 1\.2\.0, expected 2\.0\.0/,
    );
  });
});

it('accepts a matching Changesets retry pack that contains only the missing subset', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'corsen-release-subset-test-'));
  try {
    const candidateRecords = [];
    let retryTarball;
    for (const name of EXPECTED_PACKAGE_NAMES) {
      const candidate = await createTarball(fixtureRoot, name, 'candidate');
      candidateRecords.push({ name, version, integrity: candidate.integrity });
      if (name === '@corsenai/corsen-context-cli') retryTarball = candidate;
    }
    const candidateManifest = validateCandidateManifest(candidateRecords, version);
    const packDir = join(fixtureRoot, 'retry-pack');
    const packagesDir = join(packDir, 'packages');
    await mkdir(packagesDir, { recursive: true });
    await writeFile(join(packagesDir, 'cli.tgz'), retryTarball.bytes);
    await writeFile(
      join(packDir, 'publish-plan.json'),
      JSON.stringify({
        version: 1,
        plan: [
          [
            {
              kind: 'publish',
              name: '@corsenai/corsen-context-cli',
              version,
              access: 'public',
              tag: 'latest',
              tarball: {
                path: 'packages/cli.tgz',
                integrity: sri('sha256', retryTarball.bytes),
              },
            },
          ],
        ],
      }),
      'utf8',
    );

    const approved = await validateApprovedPack(packDir, version, candidateManifest);
    assert.deepEqual([...approved.keys()], ['@corsenai/corsen-context-cli']);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

it('rejects different registry bytes for a package already published outside the retry subset', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'corsen-release-test-'));
  try {
    const candidateRecords = [];
    const registryTarballs = new Map();
    for (const name of EXPECTED_PACKAGE_NAMES) {
      const candidate = await createTarball(fixtureRoot, name, 'candidate');
      const registry =
        name === '@corsenai/corsen-context'
          ? await createTarball(fixtureRoot, name, 'different-registry-bytes')
          : candidate;
      candidateRecords.push({ name, version, integrity: candidate.integrity });
      registryTarballs.set(name, registry);
    }
    const candidateManifest = validateCandidateManifest(candidateRecords, version);
    const retrySubset = new Set(EXPECTED_PACKAGE_NAMES.slice(1));
    assert.equal(retrySubset.has('@corsenai/corsen-context'), false);

    const fetchImpl = async (input) => {
      const url = new URL(input);
      if (url.pathname.startsWith('/mock-tarball/')) {
        const name = decodeURIComponent(url.pathname.slice('/mock-tarball/'.length, -4));
        return new Response(registryTarballs.get(name).bytes, { status: 200 });
      }
      const pathParts = url.pathname.slice(1).split('/');
      const [encodedName] = pathParts;
      const name = decodeURIComponent(encodedName);
      if (pathParts.length === 1) {
        return new Response(JSON.stringify({ _id: name, name, 'dist-tags': { latest: version } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const registry = registryTarballs.get(name);
      return new Response(
        JSON.stringify({
          name,
          version,
          dist: {
            integrity: registry.integrity,
            tarball: `https://registry.npmjs.org/mock-tarball/${encodeURIComponent(name)}.tgz`,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    await assert.rejects(
      verifyRegistryRelease({
        expectedVersion: version,
        candidateManifest,
        fetchImpl,
        attempts: 1,
        delayMs: 0,
      }),
      /complete candidate manifest for @corsenai\/corsen-context/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
