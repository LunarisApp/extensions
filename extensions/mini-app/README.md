# Mini Apps

Bring a self-contained HTML tool into your Lunaris workspace. Upload a single file
and use its interactive interface alongside your documents.

## Use cases

- Keep a calculator or estimator next to your project notes.
- Explore a dashboard with data embedded in the HTML file.
- Share an interactive prototype that needs no server or external assets.

## Features

- **One-file upload:** open an `.html` or `.htm` file up to 5 MiB.
- **Interactive content:** run inline JavaScript and CSS inside the workspace.
- **Source access:** download the original HTML whenever you need it.
- **Stable naming:** uploading a file keeps the resource's existing name.

## Try it

1. Install Mini Apps from **Organization Settings** and enable it for a workspace.
2. Create a **Mini App** resource.
3. Choose a self-contained `.html` or `.htm` file.

Include scripts, styles, and data in the file itself. External libraries, fonts,
and API requests will not load. App state does not persist between panel sessions.

## Technology

Mini Apps uses the Lunaris Plugin SDK to register a file-backed resource type and
React view. The host stores the HTML file; a separate sandboxed iframe runs it.

### Permissions and privacy

Uploaded content runs without a host bridge in an opaque-origin iframe. It can
execute inline JavaScript and use inline CSS, data URLs, and local blob URLs. It
cannot make network requests, submit forms, open windows, navigate the host,
embed external frames, access devices, or persist state between panel sessions.

The extension reads and writes only the file owned by the active Mini App
resource. It does not send data to third parties.

## Development

Run from `extensions/mini-app`:

```sh
bun install
bun run test
bun run typecheck
bun run build
```
