# Changesets release process

Add a changeset for every change that affects a published package:

```bash
pnpm changeset
```

Choose the affected packages, select the SemVer bump, and describe the public change. A push to
`main` may create or update the version PR, but it can never publish to npm. Merge that version PR
before starting a publication.

## One-time trusted-publishing setup

1. In GitHub Actions settings, allow workflows to create pull requests so the version PR can be
   maintained automatically.
2. Create a GitHub environment named `npm-publish`.
3. Restrict it to `main` and configure a required reviewer.
4. For each of the four `@corsenai` packages on npm, configure the trusted publisher with:
   - organization: `CorsenAI`
   - repository: `corsen-context`
   - workflow filename: `release.yml`
   - environment: `npm-publish`
   - allowed action: `npm publish`
5. Remove any npm publication token from GitHub Actions secrets. The workflow rejects `NPM_TOKEN`
   and `NODE_AUTH_TOKEN` rather than using them.

## Manual publication

From GitHub Actions, open the `Release` workflow and choose **Run workflow** on `main`. Supply:

- the exact 40-character commit SHA from `main` to release;
- the exact shared version from the four package manifests;
- the confirmation text `PUBLISH NPM`.

The workflow requires that exact commit to be checked out and to remain an ancestor of
`origin/main`; a SHA from a fork, another branch, or rewritten history is rejected. It then verifies
package identities, version, quality gates, and Changesets state without OIDC permission. This
includes all nine examples using local candidate tarballs and a clean install of the core and CLI
tarballs with version and help smoke checks. It packs that verified release, then waits at the
`npm-publish` environment gate. Only the final approved job receives `id-token: write`; it installs
release tooling with lifecycle scripts disabled and publishes the exact packed artifacts through
npm trusted publishing. Before leaving the preparation job, it also builds all four candidate
tarballs and emits a bounded manifest of their exact names, versions, and SHA-512 integrities. The
workflow uses the public npm registry with a null user config and rejects long-lived npm
credentials. Immediately before the publish action, it reconciles the approved Changesets plan
with all four exact versions and package documents on the public registry. An absent version must
be planned. An existing version must match the complete candidate manifest, must not remain in the
plan, and must already be the package's `dist-tags.latest` version. An older `latest` tag is allowed
before publication only for a package whose requested version is still absent and planned.

## Retry after a partial npm publication

If npm accepts only some packages before the publish job fails, do not change versions, manifests,
or the confirmed commit. Wait until the accepted packages are visible on the public npm registry,
then dispatch the same workflow again with the same commit, version, and confirmation. Changesets
will pack and publish only the missing packages. Select `main` when dispatching; if `main` has
advanced since the partial release, the original confirmed commit is still accepted only while it
is an exact ancestor of the current `origin/main`. An older ancestor may enter `publish` mode only
after the preflight proves that at least one exact version already exists and matches its candidate
integrity; four absent versions are treated as a new release and rejected before OIDC publication.

The pre-publication registry check stops before npm receives any package if an existing version has
different bytes, if a missing version is absent from the approved plan, or if a planned version has
become visible since Changesets created the pack. In the last case, wait for registry propagation
and dispatch the same commit and version again so Changesets produces a fresh smaller plan. A
redirect, authentication error, rate limit, server error, malformed integrity, or unexpected
tarball URL is never treated as an absent package; the run fails closed and must be retried.

The final receipt deliberately accepts that newly published subset only when every reported name
and version belongs to the approved release. It then independently verifies that all four exact
package versions exist on the public registry, downloads each registry tarball, checks its SHA-512
integrity and embedded package identity, compares all four packages with the complete manifest from
the confirmed commit, and requires all four public package documents to have
`dist-tags.latest` set to the expected version. The retry's smaller Changesets pack must also match
the corresponding entries in that manifest. A retry must not use a new commit or a bumped version.
An unexpected package, version, registry, tarball, tag, or integrity still fails closed.

If all four versions were accepted but the publish response or final check was lost, dispatch the
same confirmed commit and version again. Changesets then reports `none`; the preparation job runs a
verification-only recovery without entering the `npm-publish` environment, requesting an OIDC
token, or invoking npm publication. It succeeds only when all four registry tarballs match the
complete candidate manifest and all four `dist-tags.latest` values equal the expected version. A
missing version, mismatched tarball, stale tag, or `published=false` result during an actual
`publish` mode is still an error.
