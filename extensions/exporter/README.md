# Exporter

Turn workspace content into a PDF you can share or print. Choose supported documents
and folders, put them in order, and set the appearance in one saved Exporter resource.

## Use cases

- Assemble project notes and drawings into a handoff document.
- Prepare a report with consistent typography and page layout.
- Keep a saved selection and style settings for your next export.

## Features

- **Choose the content:** select supported documents and folders from your workspace.
- **Control the order:** arrange documents in the sequence you want readers to follow.
- **Set the style:** customize page layout, typography, spacing, colors, and page numbers.
- **Preview and download:** review the document preview before saving the PDF.
- **Reuse your setup:** selections and appearance settings persist with the resource.

## Try it

With the extension enabled in your workspace, create an **Exporter** resource.

1. Choose content in **Documents**.
2. Arrange it in **Order**.
3. Adjust the layout in **Appearance**, then download the PDF.

Preview pagination is approximate; the downloaded PDF is authoritative. Resource
types need a supported export representation to be included.

## Technology

The extension uses React for its interface and `pdf-lib` for PDF generation in a
worker. Lunaris key-value storage holds the Exporter resource's settings.

### Integrate another extension

The npm package `@lunarisapp/exporter` exposes the semantic export contract owned
by this extension. To contribute content, declare an optional dependency on
`lunaris.exporter` in your extension manifest and register an
`exporterRepresentations` contribution.

See the [contract source](https://github.com/LunarisApp/extensions/blob/main/extensions/exporter/src/contract.ts)
and the [Excalidraw integration](https://github.com/LunarisApp/extensions/blob/main/extensions/excalidraw/src/exporter-integration.ts)
for the types and a working example.

### Permissions

The extension requests `content.read` to access selected content, `content.write`
to save its configuration, and `downloads.write` to save the generated PDF.

## Development

Run from `extensions/exporter`:

```sh
bun install
bun run test
bun run typecheck
bun run build
```

The build produces both the extension bundle and the npm contract entry point.
To build only the contract, run `bun run build:sdk`.
