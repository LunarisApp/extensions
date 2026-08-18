# Excalidraw

Excalidraw adds collaborative drawings to Lunaris projects. Drawings use the
same `lunaris.excalidraw` content type and Yjs document layout as the former
bundled extension, so existing content opens without migration.

The extension supports live collaborative persistence, workspace permissions,
light and dark themes, localized Excalidraw controls, element counts, and image
output for compilation and PDF export.

## Security and privacy

The extension runs in Lunaris' opaque-origin extension sandbox. It reads and
writes only the active drawing's host-mediated Yjs document and does not make
network requests or send drawing data to third parties.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```
