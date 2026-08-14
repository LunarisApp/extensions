# Mini Apps

Mini Apps adds a document-less content type for running interactive,
self-contained HTML files inside Lunaris.

Install it from Workspace Settings, enable it for a project, create a Mini App,
then choose one `.html` or `.htm` file up to 5 MiB. The original source remains
downloadable and the hierarchy item title is never changed by upload.

## Security and privacy

Uploaded content runs without a host bridge in an opaque-origin iframe. It can
execute inline JavaScript and use inline CSS, data URLs, and local blob URLs. It
cannot make network requests, submit forms, open windows, navigate the host,
embed external frames, access devices, or persist state between panel sessions.

The plugin reads and writes only the attachment owned by the active Mini App
item. It does not send data to third parties.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```
