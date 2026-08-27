# Lunaris extension creator

Scaffold a community extension for [Lunaris](https://github.com/LunarisApp/lunaris).

```sh
npx @lunarisapp/create-extension my-extension
cd my-extension
bun install
bun run typecheck
bun run build
```

The target directory must be new or empty. Defaults come from its name. Override
extension metadata when needed:

```sh
npx @lunarisapp/create-extension my-extension \
  --id acme.my-extension \
  --name "My Extension" \
  --developer "Acme" \
  --description "Adds an Acme workflow to Lunaris"
```

Run `npx @lunarisapp/create-extension --help` for all options.

Generated extensions target `@lunarisapp/plugin-sdk` `^0.8.0`. The starter
keeps `manifest.json` to identity, API compatibility, and permissions, then
registers an explicitly launchable standalone view during activation.
Resource extensions declare named storage slots on their resource types and matching
`storageRequirements` on each resource view. They can provide active-view status
content through the resource view's `statusBar` renderer; status bars are not available
on standalone views.

Publish through your own public marketplace by adding a root `marketplace.json`.
GitHub repositories should commit `release.json` and executable assets, then reference
the descriptor through a full commit SHA on `raw.githubusercontent.com`. Generic static
hosts work too when every index, descriptor, and asset response allows CORS. See the
generated template README for complete one-extension and multi-extension examples.

## Development

```sh
bun install
bun test
bun run typecheck
bun run check
bun run build
npm pack --dry-run
```

The build copies the repository's root [`template`](../template) into `dist/template`,
so the published executable remains self-contained.
