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

## GitHub Pages setup

The repository administrator must select **GitHub Actions** as the Pages
source, verify `lunaris.app` for the `LunarisApp` organization, configure
`plugins.lunaris.app` as the custom domain, point its DNS CNAME to
`lunarisapp.github.io`, and enable HTTPS. The workflow retains the complete
published tree on the `gh-pages` branch and deploys that tree through the Pages
artifact workflow.

Run the registry checks locally with:

```sh
cd registry
bun install --frozen-lockfile
bun test
bun run typecheck
bun run check
```
