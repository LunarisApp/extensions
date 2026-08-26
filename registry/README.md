# Manual marketplace publishing

`create-release.ts` creates a hash-pinned `release.json` from an extension build.
`update-marketplace.ts` reads local extension builds and merges their published,
hash-pinned descriptors into root `marketplace.json`. Publishing is manual; no GitHub
Actions or GitHub Releases API is used by Lunaris discovery.

For each extension: install, test, typecheck, audit, build, run `stage-build.ts`, run
`create-release.ts`, create a draft `<extension-id>@<version>` Release with `gh`, upload
all generated assets, download and verify them, then publish. After every Release
exists, run `bun registry/update-marketplace.ts` and commit the root index.

The root index is mutable discovery data. Installed extensions trust their persisted
descriptor URL, exact bytes, and SHA-256, not later index changes.
