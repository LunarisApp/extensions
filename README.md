# Lunaris extensions

Add drawings, spreadsheets, interactive HTML tools, and PDF exports to your
[Lunaris](https://github.com/LunarisApp/lunaris) workspace. This repository contains
the official extension marketplace, extension source, and tools for building your own.

## Explore the extensions

| Extension | What you can do |
| --- | --- |
| [Excalidraw](extensions/excalidraw/README.md) | Sketch ideas, map workflows, and collaborate on diagrams. |
| [Exporter](extensions/exporter/README.md) | Choose, order, and style workspace content for a PDF. |
| [Mini Apps](extensions/mini-app/README.md) | Run a self-contained HTML tool inside your workspace. |
| [Spreadsheet](extensions/spreadsheet/README.md) | Edit shared workbooks and exchange tabular data. **Integration candidate; not published.** |
| [Northstar Pulse (Demo)](extensions/demo/README.md) | Learn the extension lifecycle through a dashboard with synthetic data. |

Each extension README covers use cases, features, usage, and the technology behind it.

## How the marketplace works

Lunaris reads [`marketplace.json`](./marketplace.json) directly from this repository.
There is no registry website or GitHub API dependency.

- [`extensions`](./extensions): official extension source
- [`artifacts`](./artifacts): versioned descriptors and executable assets
- [`registry`](./registry): artifact/index tools
- [`create-extension`](./create-extension): extension initializer
- [`template`](./template): extension starter and marketplace examples

## Publishing official extensions

Build and test the extension, create an artifact with `registry/build-artifact.ts`,
and commit it. Then run `bun registry/update-marketplace.ts` and commit the index
separately so descriptor URLs contain the artifact commit's full SHA.

Published versions are immutable by default. See the [publishing guide](registry/README.md)
for commands, verification, and the explicit replacement workflow.

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

The extension sources and starter use Plugin SDK 0.10. The registry supports iframe
sandbox protocols 6 and 7; protocol-7 builds require a compatible Lunaris host.
The SDK emits runtime metadata during the build. Older builds without runtime metadata
retain protocol 6.

## License

This repository is licensed under [Apache-2.0](LICENSE). The creator and starter include
copies of the license so they remain available in published packages and generated projects.
