# 0016. c3source owns the C3 source-JSON write form

- **Status:** accepted
- **Date:** 2026-07-29
- **Issue:** #57 (sibling: #58)
- **Amended by:** [ADR 0018](0018-brush-json-minified-source-not-editor-local.md)
  (#59) — `*.brush.json` is minified project *source*, not an editor-local file

## Context

`c3source` owns the `project.c3proj` **read** side entirely (`parseProjectManifest`
/ `readProjectManifest`) but had no serializer, even though the on-disk write form
is itself a C3 domain fact: **tab-indented, and — the inverse of the usual
text-file convention — with no trailing newline**. That absence is exactly why a
downstream doing the natural thing (appending `"\n"`, or running a formatter on
save) dirties `project.c3proj` on every write. This was motivated by
`construct3-chef#145` (`sync-addon-version`) going from one to two
`project.c3proj` writers with the invariant guarded only by a hand-maintained
cross-reference comment between them — exactly the "duplicated platform fact"
category [ADR 0008](0008-c3-domain-fact-tables.md) exists to close.

The domain fact was checked against the real corpus before being encoded: of the
29 `.json`/`.c3proj` files in the canonical `construct3-sample` fixture, 3 are
editor-local (skipped) and 26 are project source; **25 of those 26** satisfy
`serializeC3Json(JSON.parse(text)) === text`, and **none** ends with a newline.
The one exception is documented below rather than silently absorbed.

**2026-07-29:** the total/skipped counts above were originally measured against
a locally polluted checkout — `scripts/prep-fixture.mjs` copies the submodule's
working tree rather than only its tracked content, so gitignored editor-local
files present in a developer's checkout leak into the corpus (a hermetic fix is
tracked as a follow-up issue). Every leaked file is editor-local by
construction, so the **26**/**25 of those 26** figures above were unaffected
and needed no correction.

See [ADR 0017](0017-tolerant-manifest-read.md) for the sibling decision this one
feeds: 0017's conclusion to leave the manifest *write* path unvalidated depends on
this ADR's write surface actually existing.

## Decision

A new leaf module, `src/serialize.ts`, exports the general primitive:

- `C3_JSON_INDENT = "\t"`
- `serializeC3Json(value: unknown): string` — `JSON.stringify(value, undefined,
  C3_JSON_INDENT)`, i.e. tab-indented with no trailing newline
- `writeC3JsonFile(filePath: string, value: unknown): void`

It sits **below** `src/layouts.ts` in the module DAG (imports nothing from the
package), with thin typed wrappers in `src/manifest.ts`:

- `serializeProjectManifest(m: C3ProjectManifest): string`
- `writeProjectManifest(manifestPath: string, m: C3ProjectManifest): void`

`src/layouts.ts`'s previously-inline layout write (`writeFileSync(layout_path,
JSON.stringify(layout, undefined, "\t"))`) now routes through `writeC3JsonFile`,
byte-identically. After this change `src/` holds zero inline `JSON.stringify`
calls and zero inline tab literals outside `serialize.ts` — the single owner.

**The string form is the load-bearing half**, exported separately from the
file-writing form on purpose: a caller needing atomic rename, file-watcher
suppression, or a preserve-whatever-trailing-newline-was-there compatibility
policy (chef's actual need) composes it on top of the string. That policy is
deliberately caller-side, not built into the writer.

**The `C3Project` handle gains a write surface** (`writeManifest`,
`manifestTolerant`, `reloadManifest`), with a **write-through, never-invalidate**
cache rule: `writeManifest()` with no argument writes the already-cached
manifest; `writeManifest(m)` serializes `m`, writes the file, and *only then*
assigns `cachedManifest = m` — a throw at either step leaves both disk and cache
untouched. The rule deliberately does **not** invalidate the cache on a
successful write, because invalidation would force the next `manifest()` call to
re-read `manifestPath` **strictly**. If the caller just repaired a document
obtained *tolerantly* (see [ADR 0017](0017-tolerant-manifest-read.md)) and wrote
it back, that strict re-read throws — turning a successful repair into a crash on
the very next read. Write-through has no such trap: the cache simply becomes
whatever was actually written, valid or not.

**Explicit non-goal:** the **minified editor-local** form (`*.uistate.json`,
files under `uistate/`). c3source never writes an editor-local file, so owning
a serialization form nothing here emits would be speculative. `*.brush.json`
is **not** an instance of this non-goal — it is minified project *source*,
covered separately by [ADR 0018](0018-brush-json-minified-source-not-editor-local.md)'s
`isMinifiedSourcePath`. The two forms are orthogonal to provenance, not to each
other: C3 also writes editor-local `uistate/*.instancesBar.json` files
tab-indented, so "minified" alone never determines whether a file is source or
editor-local.

## Compromise

- **Host the serializer in `src/layouts.ts` instead of a new module** —
  rejected. `layouts.ts` is already the de-facto accretion leaf
  (`normalizeLineEndings`, `find_all_files_path`, `isEditorLocalPath` all live
  there), and adding one more general primitive there costs zero barrel/DAG
  churn. Against: `src/manifest.ts` and `src/project.ts` would then import their
  *serializer* from `./layouts.js`, which reads as a mistake at every call site,
  and it deepens the exact accretion [ADR 0012](0012-per-area-module-split.md)
  split the module apart to undo. A named leaf module makes the write surface a
  real seam instead of a fourth resident of the leftovers module — worth the one
  extra file for a primitive about to gain three consumers (`layouts.ts`,
  `manifest.ts`, the `C3Project` handle).
- **Invalidate the manifest cache on write, instead of write-through** —
  rejected. It is the more "obvious" rule (write, then drop the cache so the
  next read is fresh), but it directly conflicts with tolerant reads: a caller
  who wrote back a tolerantly-obtained, still-imperfect document would get a
  throw on their very next `manifest()` call, which is precisely backwards for a
  repair tool. Write-through avoids the trap at the cost of one documented
  consequence — see Consequences.

## Consequences

- `serializeC3Json`/`writeC3JsonFile` are the single owner of the C3 source-JSON
  write form; a future C3 release changing the form (e.g. adding a trailing
  newline) is a one-place fix, and the corpus round-trip test is the tripwire
  that would notice.
- Neither `serializeProjectManifest` nor `writeProjectManifest` nor
  `C3Project.writeManifest` validates the manifest before writing — see [ADR
  0017](0017-tolerant-manifest-read.md) for why that is deliberate rather than
  an oversight.
- `writeManifest(m)` where `m` still carries unrepaired shape violations (e.g.
  from `manifestTolerant()`) leaves the cache holding that same unvalidated
  document — coherent (cache == disk == exactly what the caller chose to
  write), but not itself a validity guarantee. This must be read from the
  JSDoc, not discovered by surprise.
- One documented corpus exception survives outside this decision's scope:
  `tilemapBrushes/**/*.brush.json` is minified and is *not* covered by
  `isEditorLocalPath`'s `EDITOR_LOCAL_EXCLUSIONS` (the [ADR
  0006](0006-editor-local-classifier.md) classifier) — and never will be: the
  file is project source, not editor-local, merely written in a second
  serialization form. Resolved by [ADR
  0018](0018-brush-json-minified-source-not-editor-local.md) (#59); the
  classifier is deliberately unchanged.
- Writing `project.c3proj` while the project is open in the C3 editor will be
  clobbered by the editor's own next save — c3source cannot fix this; it is a
  documented caveat in `docs/api-guide-manifest.md`'s write section, not a code
  behavior.
