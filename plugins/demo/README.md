# Demo

Minimal curated plugin used to verify the Lunaris plugin build and loading
pipeline. It contributes a view with a static greeting.

```sh
bun install
bun run typecheck
bun run build
```

External plugins run in opaque-origin sandboxed iframes and reach Lunaris only
through validated SDK capabilities. Keep source public and document every use
of workspace data or host-proxied networking.
