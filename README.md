# Lunaris extensions

The curated extension registry and tools for building community extensions for
[Lunaris](https://github.com/LunarisApp/lunaris).

- [`extensions`](./extensions): curated extensions maintained in this registry
- [`registry`](./registry): catalog configuration and GitHub Pages publishing tools
- [`create-extension`](./create-extension): npm extension initializer
- [`template`](./template): canonical extension starter

## Curated extensions

Each curated extension lives in its own directory under `extensions/` and follows the
same structure as the canonical template. The initial registry fixture is
[`demo`](./extensions/demo), a synthetic SaaS operations console that exercises
both standalone views and durable resources through the public extension SDK.

## Published registry

The registry is published as static files at
[`plugins.lunaris.app`](https://plugins.lunaris.app). Curated extension versions are
published after their manifest version bump reaches `main`. Community authors
submit a reviewed `{ "id", "repository" }` entry to
[`registry/community-extensions.json`](./registry/community-extensions.json); the
hourly workflow builds new non-draft GitHub releases from their exact tags.

Published `<extension-id>@<version>` descriptors and assets are immutable. To
disable the complete catalog or block an already-published version, update
[`registry/policy.json`](./registry/policy.json) through review.
