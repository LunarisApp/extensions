# Lunaris extensions

Official extension marketplace for [Lunaris](https://github.com/LunarisApp/lunaris).
Lunaris reads [`marketplace.json`](./marketplace.json) directly from this repository.
There is no registry website or GitHub API dependency.

- [`extensions`](./extensions): official extension source
- [`registry`](./registry): manual release/index tools
- [`create-extension`](./create-extension): extension initializer
- [`template`](./template): extension starter and marketplace examples

## Publishing official releases

Merge a tested extension version bump to `main`. Build it locally, create
`<extension-id>@<version>` as a draft GitHub Release, upload and verify `release.json`
plus its assets, then publish it. Run `bun registry/update-marketplace.ts` and commit
the root index only after the Release exists.

Enable GitHub immutable releases in repository settings. Released files and tags must
never be replaced. Marketplace Release snapshots are optional audit artifacts only.

## Create another marketplace

Any public host can serve the same root JSON contract. GitHub users can point Lunaris
at `https://github.com/owner/repository`; Lunaris resolves its root `marketplace.json`.
Other hosts provide the complete HTTPS manifest URL. Descriptor URLs can be absolute or
relative to that URL. Descriptors and every executable asset are pinned by byte length
and SHA-256.

All manifest, descriptor, and asset responses must permit browser CORS, for example:

```http
Access-Control-Allow-Origin: *
Content-Type: application/json
```

See [`template/README.md`](./template/README.md) for one- and multi-extension layouts,
GitHub Releases, and generic static hosting.
