# Spreadsheet

`lunaris.spreadsheet` provides collaborative, editable workbooks in Lunaris using
Univer 0.25.1, SheetJS CE 0.20.3, and host-managed Yjs storage. It requires plugin
SDK **0.11.0**, plugin API **0.10**, and sandbox protocol **7**.

**Release status: integration candidate, not published.** See [BENCHMARKS.md](BENCHMARKS.md)
for measured results and outstanding release gates.

## Development

After SDK 0.11 is published:

```sh
bun install
bun run typecheck
bun run test
bun run build
bun run test:browser
bun run benchmark
bun run benchmark:browser
```

Before publication, build against the coordinated Lunaris checkout:

```sh
bun run install:local-sdk /path/to/lunaris/packages/plugin-sdk
```

The installer temporarily resolves the local SDK, restores the public dependency
in `package.json`, and does not retain a machine-specific lockfile. Generate and
commit `bun.lock` against the published SDK before enabling the immutable release
in CI. Playwright Chromium must be installed (`bunx playwright install chromium`).
Browser tests use port 4382 and write local evidence into the workspace's ignored
`.context/spreadsheet-qa` directory. The scale suite needs a native fixture:

```sh
bun src/benchmark.ts 100000 ../../.context/spreadsheet-qa/large.lunaris.json
```

## Storage and editing

One `content` Yjs slot is the working document. The host owns SQLite persistence,
workspace sync, permissions, and persistence status. There is no new database,
sync server, or network permission. Files are interchange and backup formats.

Sheets and axes have stable IDs. Imported cells live in immutable UTF-8 blocks
of 256 rows, with individual Y.Map overrides for subsequent edits. Clearing an
imported cell creates a null override. This avoids millions of initial CRDT
records while retaining independent cell conflicts and small live updates.
Formatting is separate from inputs. Row/column tombstones hide concurrent edits
and retain formula anchors. Native backup includes these identities/tombstones.
Concurrent duplicate sheet names resolve to deterministic display names. If
concurrent deletions remove every sheet or axis, the editor offers a blank-grid
recovery action without restoring deleted values.

Formula inputs contain stable reference tokens, including absolute/relative flags.
A1 strings and calculated values are local projections. Unsupported formulas keep
their source and show `#NAME?`; cycles show `#CYCLE!`. The supported functions are
listed in `src/formulas.ts`. Dynamic arrays, names, volatile functions, external
links, charts, macros, pivots, merged cells, and axis dragging are unsupported.
Unimplemented editor commands are hidden or rejected rather than persisted partly.

Value edits, pastes, fill, range sorting, basic formats, sheet operations, resizing,
freeze panes, and axis insertion/deletion flow through the adapter. Ordinary cell
changes update affected cells. Structural changes rebuild the projection and
restore local selection, scrolling, and filter criteria. Filters and views are not
shared. Local-origin Yjs undo excludes remote edits. Presence/cursors are deferred.

Catalog metadata is localized in five languages. The first editor bundle includes
English Univer controls; additional editor locales are not bundled.

## Files and limits

| Format | Contract |
| --- | --- |
| CSV / TSV | Active sheet; delimiter/type/header preview; calculated-value export |
| XLSX / ODS | Multiple sheets; typed values, supported formulas and number formats; conversion notes |
| JSON records/arrays | Scalar records or rows; active-sheet records on export, first row supplies unique headers |
| Native `.lunaris.json` | Versioned backup of every supported durable feature |

Import always creates a new resource. CSV formula-like strings are text; leading
zeros and integers unsafe for numeric conversion stay text. CSV export protects
formula-like text with an apostrophe. Native JSON is the exact-string backup.
XLSX/ODS visual formatting is not lossless; the conversion report explains loss.

Limits: 100,000 rows per sheet, 16,384 columns, 2 million populated cells per
workbook, 64 MiB source files, 128 MiB decoded input/formula text, and 256 MiB
exports. Parsing and conversion run in cancellable inline workers. Oversized files
and decoded data are rejected without truncation. ZIP directory expansion is
checked before workbook conversion; ZIP64 is rejected.
The conversion worker prepares a sparse Yjs update for the internal import
handoff. The storage initializer validates decoded cells in blocks, avoiding a
second full cell-object graph in the UI. Native JSON remains the portable backup.
Import and local edit limits do not reserve capacity between offline peers;
concurrent offline additions can exceed the total after merging. All edits remain
stored; reduce the combined workbook below the limits before exporting it.

## Build and release

The measured `dist/main.js` includes both inline workers. The SDK and registry
retain the 10 MiB executable gate. `vite.config.ts` removes only the pinned Univer
renderer table of word-processor hyphenation dictionaries; spreadsheets do not use
paragraph hyphenation. The transform fails if that upstream table changes.

Release the updated SDK and web/desktop host first. Then resolve the public SDK,
commit its lockfile, rebuild, and use `registry/build-artifact.ts` to create a new
immutable version. Commit artifacts before updating the marketplace's commit pins.
Do not publish this candidate until the remaining benchmark and application smoke
gates in BENCHMARKS.md are complete.
