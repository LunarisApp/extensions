# Integration evidence

Machine: Apple M1 Pro, 16 GiB RAM. Local Chromium, actual production sandbox
artifact, restrictive opaque-origin iframe policy, inline formula/conversion
workers. The parent test page simulates host storage/RPC using real Yjs. It does
not run the real SQLite provider, network sync backend, or native desktop shell.

## Recorded full-size run

100,000 rows × 20 populated cells, including 20,000 arithmetic formulas and mixed
short strings/numbers. Formula inputs reference numeric columns B and C.

| Measurement | Result | Target / interpretation |
| --- | ---: | --- |
| Interactive grid open | 8,756 ms | ≤10,000 ms; calculated results continue loading |
| All initial calculation applied | 14,131 ms | Exceeds 10 seconds if cold-open includes complete calculation |
| Ordinary edit feedback p95 | 18.9 ms | ≤100 ms; 20 sequential edits, keydown to two animation frames |
| Canvas redraws during wheel scrolling | 59.8 FPS | ≥45 FPS; frames with draw calls on the visible grid canvas |
| One-cell Yjs update | ≤40 bytes | Deltas, not full-workbook snapshots |
| Browser process-tree RSS increase after load | 1,301 MiB | ≤1,536 MiB |
| Native import preview | 9,583 ms | 46 MiB fixture, 2 million inputs |
| Import through sandbox storage initialization | 13,099 ms | ≤30,000 ms; SQLite persistence/new-view rendering excluded |
| Sampled import peak RSS increase | 1,929 MiB | **Fails ≤1,536 MiB**; 200 ms samples |

Scrolling measures frames containing canvas draw calls, not only animation callbacks.
Import uses the actual extension initialization handler and applies its Yjs result
to a new host replica. It does not merely acknowledge the creation RPC.
The review reruns exposed an unreliable memory result: the earlier 1,469 MiB pass
was followed by 1,762 and 1,929 MiB peaks. Releasing worker-owned decoded inputs
earlier does not establish a passing memory gate. Publication remains blocked on
bounded-memory import work and repeatable measurements, including older engines
using the base64 fallback. Do not use the earlier passing run as release evidence.
RSS sums browser descendants, including iframe/worker processes; shared pages may
be double-counted. These are measurements from one local run, not broad guarantees.

The model-only benchmark separately measured approximately 1.1 seconds to build
2 million cells, 22 ms for replica hydration, 39-byte edits, and 452 MiB RSS increase.
It does not include rendering or calculation and must not stand in for the release
benchmark.

## Verification and release gates

- Unit tests cover concurrent inputs/styles, conflicts, overlapping offline pastes,
  reordered/duplicate updates, structural references, deletion, renaming, undo,
  formula copying/cycles/errors, typed format round trips, and limit rejection.
- Browser tests cover two isolated editors, remote formula results, UI row insertion,
  collaborative undo, CSV export, TSV import/new-resource initialization, import
  cancellation, persistence-error display, and read-only keyboard editing.
- SDK tests cover incremental hydration/resync and chunked-download validation,
  cancellation, and cleanup. Host tests cover protocol 6/7 and scoped permissions.
- Registry tests cover protocol metadata and immutable artifact verification.
- Extension typecheck/build and 35 tests pass; SDK build and 130 tests pass;
  affected host typecheck and 27 tests pass; registry checks and 10 tests pass.
  Web and desktop frontend builds pass, including PWA/native-PowerSync checks.
  The reviewed executable is 9,814,417 bytes (9.36 MiB), including workers and notices.
- Review regressions cover typed boolean edits, quoted sheet references, copying
  ranges with deleted anchors, overlapping cycles, Excel row-window truncation and
  error codes, sparse record conversion, sparse export bounds, stalled download
  cancellation, and revisions arriving during sync completion. A separate 20,000
  range-formula dependency check completed in 41 ms.

Still required before publication: real application web/desktop smoke, persistence
failure/reload and network-offline reconnect through the actual backend, and a
cold-open decision/optimization for the 14.1-second initial calculation, plus the
failed import-memory gate above. The
standalone web preview currently fails its region-manifest request because the API
rejects the localhost preview origin via CORS; this is not a passing app smoke.
Retest memory with the native host process included. Large
XLSX/ODS and full-workbook pastes need additional peak-memory measurements; the
recorded import uses native JSON.

No SDK, host deployment, extension artifact, or marketplace version has been
published by this task. Local source and build outputs remain reviewable.
