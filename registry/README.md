# Marketplace publishing

## Automatic delivery

Merging an extension version bump into `main` publishes it after CI succeeds.
Update both `extensions/<name>/manifest.json` and its `package.json`, and commit
its public-dependency `bun.lock`. Versions must increase. CI builds and validates
all enabled extensions; only versions without an artifact directory are published.
Source changes without a version bump are tested but do not release anything.

Do not build or commit `artifacts/` in a feature PR. CI rejects artifact changes;
the publication job generates those files. Existing versions and descriptor URLs
remain immutable. No platform deployment or registry server is needed: Lunaris
already reads root `marketplace.json` from this repository.

The workflow in [ci.yml](../.github/workflows/ci.yml) performs:

1. Registry tests, types, formatting, catalog integrity, and release planning.
2. Creator tests, types, formatting, build, and npm package inspection.
3. Each enabled extension's tests, types, build, and bundle validation. The build
   checks executable size, icon validity, runtime metadata, and expected identity.
4. The aggregate **CI** check requires every validation job to succeed. Extension
   builds may be skipped only when the release plan has no enabled sources.
5. On `LunarisApp/extensions`'s `main` only, **Publish marketplace** downloads new
   bundles from that same run, verifies their manifests and asset hashes, commits
   the artifacts, then commits an index with full artifact-commit SHA URLs.
6. One fast-forward push publishes both commits. The job summary records the
   source and published commits. A failed push leaves the remote catalog unchanged.

PR jobs have read-only permissions and do not persist Git credentials. Only the
publication job has `contents: write`. It uses `GITHUB_TOKEN`; no deployment token
or extra service is required. GitHub does not start another push workflow for
commits made with this token, preventing a publication loop. Publication runs are
serialized; PR runs cancel superseded PR validation.

The Bun version comes from `create-extension/package.json`'s `packageManager`.
Action versions are SHA-pinned; Dependabot proposes weekly action updates.

## Repository setup

Enable GitHub Actions and allow the publication job's `GITHUB_TOKEN` to write
repository contents. A default read-only workflow setting is compatible with the
job's explicit write permission, unless organization policy prohibits it.

If branch rules require PRs or status checks on every commit, this workflow's direct
bot push will be rejected. Arrange an approved bot publication path before enabling
such rules; this workflow does not bypass protection. When configuring required
checks, use the stable **CI** check. The workflow currently publishes only from
`LunarisApp/extensions`; a fork must intentionally change that repository guard.

These workflows publish marketplace extensions. npm publication of
`@lunarisapp/create-extension` and `@lunarisapp/exporter` remains separate.

## Paused candidates

[`releases.json`](./releases.json) is the explicit list of source IDs excluded from
build validation and automatic publication. Each pause needs a reason. Unknown IDs
and empty reasons fail CI; an enabled source without a lockfile also fails CI.
All sources may be paused to allow emergency policy updates while builds are
unavailable. Catalog integrity and creator checks still run.

Spreadsheet's current source remains paused while its SDK 0.11 dependency, public
lockfile, and [release gates](../extensions/spreadsheet/BENCHMARKS.md) are pending.
Its existing catalog entry and historical artifact remain intact and receive
integrity checks. Remove the pause only after those prerequisites are complete,
and bump the source version to publish the candidate.

## Recovery and rollback

If validation fails, fix the source and merge the correction. If publication fails,
inspect **Publish marketplace**, fix the reported condition, and run **CI** manually
on current `main` with **Run workflow**. This reruns validation before publishing.
Do not dispatch an older branch or ref; it cannot publish.
Rerunning all jobs within the same run replaces its temporary uploaded bundles,
so prior uploads do not cause name conflicts. Published artifacts stay immutable.

The job checks that `main` still equals its validated source. If another merge or
publication advanced `main`, let its newer run finish, or dispatch on current
`main`. It never rebases generated commits (which would invalidate pins), forces a
push, or overwrites a version. GitHub may replace a queued run with a newer one;
that newer run plans all currently unpublished source versions.

A retry after successful publication sees the existing versions and makes no new
artifact commits. If a catalog change is still needed, it creates only the index
commit. The artifact and index commits must remain separate because the latter
records the former's SHA.

To withdraw a bad release, add `id@version` to `registry/policy.json`'s
`blockedVersions`, then merge. Automatic publication updates its status and selects
the newest active version. If all versions are blocked, the catalog retains a
latest-version pointer to a blocked version; it does not make one installable.
This affects marketplace availability, not already-installed extension bytes.
Release a higher fixed version to deliver a correction. Set `enabled: false` to
disable the entire marketplace through the same pipeline.

## Local validation and low-level tools

From the repository root:

```sh
(cd registry && bun install --frozen-lockfile && bun test && bun run typecheck && bun run check)
bun registry/verify-artifacts.ts
bun registry/release-plan.ts
```

For each enabled extension, run `bun install --frozen-lockfile`, `bun run test`,
`bun run typecheck`, and `bun run build` in its directory. Validate its bundle into
an unused temporary directory without changing published artifacts:

```sh
EXTENSION_DIST=extensions/example/dist \
EXTENSION_ARTIFACTS_ROOT=/tmp/lunaris-release-check \
  bun registry/build-artifact.ts
```

`build-artifact.ts --check` compares a build with an existing artifact.
`build-artifact.ts --overwrite` and `update-marketplace.ts --overwrite` remain
explicit low-level recovery tools; automatic delivery never uses them. Normal PRs
cannot replace artifacts. Prefer a new version to preserve installed clients' pins.

`publish.ts <input-directory> <validated-source-sha>` prepares local commits only
and requires a clean checkout at that SHA. Inputs are directories of
`<extension-id>/<version>/` bundles outside the checkout. The workflow owns the
push. `update-marketplace.ts` preserves existing descriptor URLs when their bytes
match, including historical replacement releases, and rejects changed bytes.
Catalog verification and pin preservation require descriptor URLs to use the
configured repository, a full commit SHA, and the matching artifact path.
