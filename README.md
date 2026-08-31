# Lunaris extensions

Official extension marketplace for [Lunaris](https://github.com/LunarisApp/lunaris).
Lunaris reads [`marketplace.json`](./marketplace.json) directly from this repository.
There is no registry website or GitHub API dependency.

- [`extensions`](./extensions): official extension source
- [`artifacts`](./artifacts): versioned descriptors and executable assets
- [`registry`](./registry): artifact/index tools
- [`create-extension`](./create-extension): extension initializer
- [`template`](./template): extension starter and marketplace examples

## Publishing official extensions

Build and test an extension locally, then run `registry/build-artifact.ts`. Commit the
new `artifacts/<extension-id>/<version>` directory before updating the marketplace.
Run `bun registry/update-marketplace.ts` in a second commit so descriptor URLs contain
the full artifact commit SHA.

Published artifact directories are immutable by default, so every normal build requires
a new extension version. An explicitly authorized replacement release can be regenerated
with `registry/build-artifact.ts --overwrite`; its marketplace descriptor pins must also
be refreshed. Tags such as `<extension-id>@<version>` are optional and are not part of
the client trust model.

## Create another marketplace

Any public host can serve the same root JSON contract. GitHub users can point Lunaris
at `https://github.com/owner/repository`; Lunaris resolves its root `marketplace.json`.
Other hosts provide the complete HTTPS manifest URL. Descriptor URLs can be absolute or
relative to that URL. Descriptors and every executable asset are pinned by byte length
and SHA-256.

All manifest, descriptor, and asset responses must permit browser CORS, for example:

```http
Access-Control-Allow-Origin: *
Content-Type: application/json
```

See [`template/README.md`](./template/README.md) for one- and multi-extension layouts,
commit-pinned GitHub artifacts, and generic static hosting.

## Plugin SDK compatibility

Curated extension sources and the starter target Plugin SDK 0.8 and iframe sandbox
protocol 6. Published artifacts remain immutable unless an explicitly authorized
replacement uses the registry overwrite workflow. Excalidraw also contributes a
host-managed local search indexer for live canvas
text and named frames. Index storage, lifecycle, ranking, and search UI remain host-owned.
