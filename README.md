# Lunaris plugins

The curated plugin registry and tools for building community plugins for
[Lunaris](https://github.com/LunarisApp/lunaris).

- [`plugins`](./plugins): curated plugins maintained in this registry
- [`registry`](./registry): catalog configuration and GitHub Pages publishing tools
- [`create-plugin`](./create-plugin): npm plugin initializer
- [`template`](./template): canonical plugin starter

## Curated plugins

Each curated plugin lives in its own directory under `plugins/` and follows the
same structure as the canonical template. The initial registry fixture is
[`demo`](./plugins/demo), a synthetic SaaS operations console that exercises
both view and content-type loading through the public plugin SDK.

## Published registry

The registry is published as static files at
[`plugins.lunaris.app`](https://plugins.lunaris.app). Curated plugin versions are
published after their manifest version bump reaches `main`. Community authors
submit a reviewed `{ "id", "repository" }` entry to
[`registry/community-plugins.json`](./registry/community-plugins.json); the
hourly workflow builds new non-draft GitHub releases from their exact tags.

Published `<plugin-id>@<version>` descriptors and assets are immutable. To
disable the complete catalog or block an already-published version, update
[`registry/policy.json`](./registry/policy.json) through review.
