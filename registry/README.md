# Marketplace publishing

`build-artifact.ts` copies a built extension into its immutable artifact directory and
creates a hash-pinned `release.json` with relative asset URLs. `update-marketplace.ts`
merges committed artifacts into root `marketplace.json` using descriptor URLs pinned to
the full artifact commit SHA.

From the repository root:

```sh
cd extensions/example
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
cd ../..
EXTENSION_DIST=extensions/example/dist bun registry/build-artifact.ts
git add artifacts
git commit -m "feat: publish example 1.0.0"
bun registry/update-marketplace.ts
git add marketplace.json
git commit -m "chore: update marketplace"
```

The artifact commit and marketplace commit must remain separate: the second commit
records the first commit's full SHA. `build-artifact.ts` refuses to overwrite an
existing version. Use `--check` to compare a build with its committed artifact.

The root index is mutable discovery data. Installed extensions trust their persisted
descriptor URL, exact bytes, and SHA-256, not later index changes.
