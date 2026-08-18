# Links

Links adds a persistent Link content type to Lunaris. Create a Link in the
project hierarchy, paste an HTTP or HTTPS address, and choose **Save & open** to
load it in a separate panel. Saved items can be edited or reopened later, and
the item options menu can open it in the right dock.

## Development

```sh
bun install
bun run typecheck
bun run test
bun run build
```

The extension uses only public `@lunarisapp/plugin-sdk` capabilities. Link data
is stored in the item's Yjs document and compiles to a portable title and URL.
It makes no background requests and stores no credentials.

## Browser-panel limits

The page navigates inside Lunaris's sandboxed extension panel. A website can
decline to render there with `X-Frame-Options` or CSP `frame-ancestors`, and the
host sandbox can restrict forms, popups, sign-in state, and other browser
features. Those policies cannot be bypassed by an extension; the Link item and
its address remain available for editing when a page is incompatible.
