# Lunaris extension registry

This directory owns the configuration and publishing tools for the static
registry at `https://plugins.lunaris.app`.

## Configuration

- `community-extensions.json` lists reviewed public extension repositories.
- `policy.json` controls the catalog kill switch and blocked
  `<extension-id>@<version>` entries.
- Curated extensions are discovered from `../extensions/*/manifest.json`.

Curated versions publish when their manifest version bump reaches `main`.
Community releases are discovered hourly from exact, non-draft GitHub release
tags. A published ID and version is immutable; change the manifest version
before changing its build output.

Manifests declare the compatible plugin API range `^0.3.0` and complete
declarative contributions and permissions; the repository tooling installs
`@lunarisapp/plugin-sdk` at `^0.3.0`. Catalog v1 publishes
`{ "kind": "iframe", "protocol": 1 }` on every descriptor and catalog version.
Immutable descriptors from before plugin API 0.3 remain on the Pages branch but
are omitted when the compatible catalog is rebuilt.

## GitHub Pages setup

GitHub Pages publishes from the root of the `gh-pages` branch. The repository
administrator must select **Deploy from a branch** as the Pages source, verify
`lunaris.app` for the `LunarisApp` organization, configure
`plugins.lunaris.app` as the custom domain, and point its DNS CNAME to
`lunarisapp.github.io`.

To deploy manually, build and stage the extension artifacts, run `publish.ts`
against a checkout of `gh-pages`, commit and push that generated tree, then
request the branch build:

```sh
EXTENSION_ARTIFACTS_DIR=extension-artifacts \
  REGISTRY_SITE_DIR=registry-site \
  bun registry/publish.ts
git -C registry-site add -A
git -C registry-site commit -m "Publish extension registry"
git -C registry-site push origin gh-pages
gh api --method POST repos/LunarisApp/plugins/pages/builds
```

Run the registry checks locally with:

```sh
cd registry
bun install --frozen-lockfile
bun test
bun run typecheck
bun run check
```
