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

Generated extensions target `@lunarisapp/plugin-sdk` `^0.4.0`. The starter
keeps `manifest.json` to identity, API compatibility, and permissions, then
registers an explicitly launchable standalone view during activation.

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
