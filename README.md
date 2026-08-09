# Lunaris plugin creator

Scaffold a community plugin for [Lunaris](https://github.com/LunarisApp/lunaris).

```sh
npx @lunarisapp/create-plugin my-plugin
cd my-plugin
bun install
bun run typecheck
bun run build
```

The target directory must be new or empty. Defaults come from its name. Override
plugin metadata when needed:

```sh
npx @lunarisapp/create-plugin my-plugin \
  --id acme.my-plugin \
  --name "My Plugin" \
  --developer "Acme" \
  --description "Adds an Acme workflow to Lunaris"
```

Run `npx @lunarisapp/create-plugin --help` for all options.

## Development

```sh
bun install
bun test
bun run typecheck
bun run check
bun run build
npm pack --dry-run
```

The publishable package includes the compiled Node.js executable and
`templates/plugin`.
