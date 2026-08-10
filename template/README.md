# Example Lunaris plugin

1. Replace example metadata and implementation.
2. Run `bun install`, commit the lockfile, then run `bun run typecheck` and `bun run build`.
   The Vite helper validates `GITHUB_REF_NAME` automatically during tagged builds.
3. Tag the exact manifest version without a `v` prefix (for example `1.0.0`); the release workflow publishes it.
4. Submit the public repository to the curated Lunaris plugin registry.

External plugins run in opaque-origin sandboxed iframes and reach Lunaris only
through validated SDK capabilities. Keep source public and document every use
of workspace data or host-proxied networking.
