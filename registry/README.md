# Lunaris plugin registry

This directory owns the configuration and publishing tools for the static
registry at `https://plugins.lunaris.app`.

## Configuration

- `community-plugins.json` lists reviewed public plugin repositories.
- `policy.json` controls the catalog kill switch and blocked
  `<plugin-id>@<version>` entries.
- Curated plugins are discovered from `../plugins/*/plugin.json`.

Curated versions publish when their manifest version bump reaches `main`.
Community releases are discovered hourly from exact, non-draft GitHub release
tags. A published ID and version is immutable; change the manifest version
before changing its build output.

Catalog v1 requires SDK `0.0.3` sandbox builds and publishes
`{ "kind": "iframe", "protocol": 1 }` on every new descriptor and catalog
version. Older stored releases remain listed as blocked so old and new clients
fail closed until their owner selects a compatible patch release.

## GitHub Pages setup

GitHub Pages publishes from the root of the `gh-pages` branch. The repository
administrator must select **Deploy from a branch** as the Pages source, verify
`lunaris.app` for the `LunarisApp` organization, configure
`plugins.lunaris.app` as the custom domain, and point its DNS CNAME to
`lunarisapp.github.io`.

To deploy manually, build and stage the plugin artifacts, run `publish.ts`
against a checkout of `gh-pages`, commit and push that generated tree, then
request the branch build:

```sh
PLUGIN_ARTIFACTS_DIR=plugin-artifacts \
  REGISTRY_SITE_DIR=registry-site \
  bun registry/publish.ts
git -C registry-site add -A
git -C registry-site commit -m "Publish plugin registry"
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
