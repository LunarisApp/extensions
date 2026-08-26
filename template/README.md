# Example Lunaris extension marketplace

Build the extension with `bun run typecheck && bun run build`. Publish `release.json`,
`main.js`, optional `styles.css`, and optional `icon.png` at immutable public HTTPS
URLs. Each asset in `release.json` needs URL, byte length, media type, and SHA-256.

## One extension

```text
marketplace.json
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
      "api": "^0.4.0",
      "runtime": { "kind": "iframe", "protocol": 2 },
      "status": "active",
      "descriptor": {
        "url": "./releases/com.example.extension/1.0.0/release.json",
        "bytes": 1234,
        "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      }
    }]
  }]
}
```

## Multiple extensions

Keep one root `marketplace.json`; place each extension in `extensions/<name>/`. IDs and
versions must be unique across the index.

## GitHub Releases

Use tag `<extension-id>@<version>`. Create a draft release, upload descriptor/assets,
verify downloaded sizes and digests, publish it, then merge the index update. Enable
immutable releases. Lunaris reads the raw root index and downloads assets directly; it
does not use the Releases API.

## Generic HTTPS hosting

Upload the same files to immutable or content-addressed paths on a static host. Serve
JSON as `application/json`, scripts/styles with correct media types, and include
`Access-Control-Allow-Origin: *` on the index, descriptors, icons, scripts, and styles.
