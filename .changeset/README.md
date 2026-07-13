# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets).

To record a change for the next release, run:

```bash
pnpm changeset
```

Pick the affected packages and a semver bump (patch/minor/major), and describe the change. On merge to `main`, the release workflow opens a "Version Packages" PR; merging that PR publishes the updated packages to npm with provenance.
