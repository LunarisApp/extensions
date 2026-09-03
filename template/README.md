# Example Lunaris extension marketplace

Build the extension with `bun run typecheck && bun run build`. Publish `release.json`,
`main.js`, optional `styles.css`, and optional `icon.<extension>` at immutable public HTTPS
URLs. Each asset in `release.json` needs URL, byte length, media type, and SHA-256.
Asset URLs may be relative to the descriptor.

## One extension

```text
marketplace.json
artifacts/
  com.example.extension/
    1.0.0/
      release.json
      main.js
      styles.css
src/
manifest.json
```

```json
{
  "schemaVersion": 1,
  "name": "example",
  "displayName": "Example Extensions",
  "enabled": true,
  "generatedAt": "2026-08-26T00:00:00.000Z",
  "extensions": [{
    "id": "com.example.extension",
    "name": "Example",
    "description": "An example extension",
    "developer": "Example",
    "repository": "https://github.com/example/extensions",
    "latestVersion": "1.0.0",
    "versions": [{
      "version": "1.0.0",
      "api": "^0.9.0",
      "runtime": { "kind": "iframe", "protocol": 6 },
      "status": "active",
      "descriptor": {
        "url": "https://raw.githubusercontent.com/example/extensions/0123456789abcdef0123456789abcdef01234567/artifacts/com.example.extension/1.0.0/release.json",
        "bytes": 1234,
        "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      }
    }]
  }]
}
```

## Multiple extensions

Keep one root `marketplace.json`; place each extension in `extensions/<name>/`. IDs and
versions must be unique across the index. Store published builds under
`artifacts/<extension-id>/<version>/`.

## Resource views and status bars

SDK 0.8 resource views declare the named storage slots they consume. Use
`storageRequirements: {}` when a view needs no durable storage. Status content belongs
to the resource view that owns it; standalone views cannot provide a `statusBar`.

```tsx
import type { ResourceViewStatusProps } from "@lunarisapp/plugin-sdk";

function DocumentStatus({ resource }: ResourceViewStatusProps) {
  return <span>{resource.resourceId}</span>;
}

contributions.view({
  name: "Document",
  renderer: DocumentView,
  statusBar: DocumentStatus,
  storageRequirements: {},
  target: { kind: "resource", resourceTypeIds: ["com.example.document"] },
  viewId: "com.example.document",
});
```

When several related values are needed, keep a single `statusBar` renderer and return
them together in a React fragment.

## GitHub repositories

Commit a new artifact directory first. In a second commit, add its descriptor to
`marketplace.json` using a `raw.githubusercontent.com` URL containing the first commit's
full SHA. Commit-specific URLs are immutable and allow browser CORS. Tags such as
`<extension-id>@<version>` are optional; clients do not depend on tags or GitHub
Releases.

An artifact descriptor can keep its asset URLs transport-neutral:

```json
{
  "script": {
    "url": "./main.js",
    "bytes": 1234,
    "resource": "text/javascript",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

## Generic HTTPS hosting

Upload the same files to immutable or content-addressed paths on a static host. Serve
JSON as `application/json`, scripts/styles with correct media types, and include
`Access-Control-Allow-Origin: *` on the index, descriptors, icons, scripts, and styles.
