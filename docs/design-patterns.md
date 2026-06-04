# Design Patterns

Conventions and reusable patterns specific to `c3source`. For the high-level
architecture and the two functional areas (layout traversal, event-sheet
extraction), see `CLAUDE.md`.

## Single-source event numbering

C3 assigns each "counting" event (group / block / function-block /
custom-ace-block — **not** variable / comment / include) a 1-based,
depth-first, pre-order number. That number is what the C3 editor shows and what
`generateFunctionName` bakes into generated script names, so anything that
reports event coordinates **must** agree with it.

There is exactly one walk that owns this counter: `visitEvents`, which exposes
each event's number via `EventVisitContext.eventNumber` (`null` for
non-counting events). Consumers that also need the number — e.g.
`extractScriptsFromSheet` — do **not** keep their own counter. Instead they run
`visitEvents` once to build a `Map<EventSheetEvent, number>` keyed by object
reference, then read each event's number from the map:

```ts
const eventNumbers = new Map<EventSheetEvent, number>();
visitEvents(sheet.events, (event, ctx) => {
  if (ctx.eventNumber !== null) eventNumbers.set(event, ctx.eventNumber);
});
// ...later, during the scope-aware traversal:
const currentEventIndex = eventNumbers.get(event)!; // counting events are always present
```

Map-by-reference is safe because every parsed event is a distinct object. The
payoff: `eventNumber`, `eventIndex`, and `generateFunctionName` cannot drift,
because the numbering rule (`isCountingEvent` + pre-order descent) lives in one
place. When adding a new walk that needs C3 coordinates, build it on
`visitEvents`; never re-implement the counter.

**Regression guard.** The invariant is pinned by two test sets that any counter
refactor must keep green: the `visitEvents` ↔ `extractScriptsFromSheet`
agreement test in `test/eventCounter.test.ts` (asserts `eventNumber` equals
`eventIndex` for every counting event on a multi-group/nested fixture, plus the
absolute values `Outer=1, Inner=2, …`), and the original extraction tests in
`test/extractEventSheetScripts.test.ts`, which fix the exact event/scope
coordinates. If you touch the numbering or the traversal order, those tests are
the proof it still matches C3 — do not weaken them.

## One traversal, everything else is a thin consumer

The layer walk has a single recursive implementation: the internal
`walkLayerEntries` generator. It yields a `LayerEntry` per layer — bare `name`,
the dotted/global-resetting `fullName`, the root-first `ancestors` chain
(excludes the layer itself), the `parent` sibling array, and the `index`. Every
public walker/finder is a thin consumer of that one generator:

- `visitLayers` / `visitLayout` / `visitInstances` iterate it and **sum the
  `LayerVisitor` mutation count** (no early-exit — they walk the whole tree).
- `findLayerEntry` / `findLayer` / `findLayerByName` / `findLayerEntryInLayout`
  iterate it and **stop on the first predicate hit** (the generator halts when
  the consumer `return`s). `findLayerEntry` is the core; the others are
  conveniences (layer-only, bare-name match, layout-name-seeded). Callers build
  any name shape the generator does not hardcode — e.g. a `>`-separated,
  non-resetting display name — from the `ancestors` chain.

The file-based `visit_*_in_layouts` wrap the visitors — read → parse → call the
in-memory visitor → **write only when the summed mutation count is > 0**
(tab-indented, to match C3). The "write-if-changed" rule stays in the file
wrapper, never in the in-memory visitor. Add new traversal behavior to
`walkLayerEntries` (or a new thin consumer of it) so every path inherits it;
never re-implement the recursion.

The walk is **fully recursive** through `subLayers` (an earlier version
descended only one level). `visitLayout`/`findLayerEntryInLayout` seed the
dotted prefix with the layout name (`LayoutName.LayerName`); a layer flagged
`global` resets the prefix to `global`.

## One file-walker, three collectors

The on-disk collectors `find_all_layouts_path`, `find_all_objectTypes_path`,
and `find_all_eventsheets_path` share one internal recursive walk,
`find_all_files_path(dir, predicate)`. It owns the recursion and the skip rules
every collector needs: it never descends into `uistate/` subfolders (C3 r487+
writes editor UI state there, and its non-source `.json` would crash the
parsers) and it applies a per-file `predicate`. The public collectors are
one-line wrappers differing only in that predicate (event sheets additionally
require a `.json` extension). Add a new collector as another wrapper; never
re-implement the recursion or the `uistate/` / `.uistate.json` skip —
duplicating it is exactly how a self-recursion bug once slipped in
(`find_all_objectTypes_path` recursing via the layouts collector).

## One canonical editor-local filter

`isEditorLocalPath(name: string): boolean` is the single definition of
"editor-local artifact vs C3 source". It checks both the directory form (`name`
in `EDITOR_LOCAL_EXCLUSIONS.dirs`, currently `["uistate"]`) and the file-suffix
form (`EDITOR_LOCAL_EXCLUSIONS.fileSuffixes`, currently `[".uistate.json"]`).
Before this was extracted (#19), the skip logic was inlined at four sites:
the `uistate/` directory guard in `find_all_files_path` and the `.uistate.json`
suffix checks in the three named collectors. That duplication was the direct
path to the bug this replaced: a downstream tool that re-derived the skip rule
from the collector source could easily miss the directory form, silently
including `uistate/` children in its walk. All four sites now call
`isEditorLocalPath`; any future addition to C3's editor-local convention is a
one-line change in `EDITOR_LOCAL_EXCLUSIONS`.

Never inline the skip predicate. Add any new editor-local pattern to
`EDITOR_LOCAL_EXCLUSIONS` so every site inherits it automatically.

## Traversal-vs-rendering split for SIDs

`walkSids(node, visit: (sid, segments) => void)` is the exported primitive for
SID discovery; `formatSidPath(segments)` is its paired renderer. This follows
the same principle as `find_all_files_path` + predicate: the traversal is
separated from what the caller does with each result.

`collectSids` and `collectSidsWithPaths` are thin consumers — they call
`walkSids` once and accumulate into a `Set` or `Array`. Callers that need a
different output shape (e.g. a semantic root label when `segments.length === 0`
instead of the empty string `formatSidPath` returns) drive `walkSids` directly
rather than post-processing `collectSidsWithPaths` output.

`SidPathSegment = string | number` uses `number` for array indices and `string`
for object keys. `formatSidPath` emits `[i]` for numbers and `.key` for
strings, with no leading dot on the first string segment (so the root object's
keys render as `key`, not `.key`). The empty-segments case (`segments.length ===
0`) returns `""`, which callers can intercept to substitute a semantic label.

## Path-bearing drift via name→path map diffing

Manifest drift detection for name-folder sections (layouts, objectTypes,
eventSheets, families, …) is built on a single canonical walk per side, paired
with a name→path map diff. The invariant that enables this: **leaf names are
unique within each section** (a C3 guarantee). No two layouts share a name, no
two objectTypes share a name, and so on within each category.

**One walk per side.** `walkManifestNameTree(folder)` and `walkDiskNameTree(dir)`
each return `Array<{ name: string; path: ManifestPathSegment[] }>`. Every item
carries the chain of ancestor subfolder names as `path` — e.g. a layout declared
inside a manifest subfolder named `"cutscenes"` has `path: ["cutscenes"]`; a
layout at the section root has `path: []`. The disk walk preserves the same
structure: `path` segments are the subdirectory names relative to the section root.

**One diff, three outcomes.** `diffNameMaps(manifestItems, diskItems)` converts
each list into a `Map<name, path>` and computes:

- name in manifest only → `{ kind: "missing", name, manifestPath }` — the caller
  knows where in the manifest tree to find the stale entry.
- name on disk only → `{ kind: "untracked", name, diskPath }` — the caller knows
  where on disk the orphan lives.
- name on both sides, paths differ → `{ kind: "moved", name, manifestPath, diskPath }` —
  same object, different organizational subfolder. A sync tool can apply this as
  a relocation rather than delete+add, because name uniqueness means there is no
  ambiguity about which manifest entry matches which disk file.

**Folder-level drift** (subfolders present on only one side) is diffed separately
via `collectManifestFolderPaths` / `collectDiskFolderPaths` + `diffFolderPaths`,
producing `folder-missing` and `folder-untracked` entries. These are merged with
the item-level entries and sorted deterministically by kind then name before the
`SectionDrift` is emitted.

**Rendering.** `formatManifestPath(segments)` renders a segment array as a
slash-joined string (`""` for root, `"global/images"` for `["global", "images"]`),
mirroring `formatSidPath` for manifest paths. Callers can use the raw segment
arrays for tree mutations or `formatManifestPath` for display. The two are kept
separate for the same reason `walkSids` / `formatSidPath` are: the traversal
should not dictate the rendering.

## Declared-subfolder recursion for file-folder walks

`detectManifestDrift` uses **two different walk strategies** for its two manifest
section types, unified by one invariant: **walk depth must match what the manifest
can declare**.

- **Name-folder sections** (`layouts`, `eventSheets`, `objectTypes`, `families`,
  `models3d`, …) — walk recursively through the full disk tree
  (`walkDiskNameTree`). These are C3 source trees where C3 itself writes
  `<Name>.json` files at arbitrary subfolder depth. Both the manifest walk
  (`walkManifestNameTree`) and the disk walk descend fully, so no item is missed.

- **File-folder sections** (`rootFileFolders.script`, `.icon`, …) — recurse
  **only into subdirectories whose name matches a declared subfolder** in the
  manifest (`walkDiskFileTree(dir, folder.subfolders)`). Undeclared
  subdirectories are never entered. This makes generated trees like
  `scripts/ts-defs/` — which C3 writes for TypeScript projects but never
  declares in `rootFileFolders.script` — permanently invisible to drift
  detection without requiring an explicit exclusion entry for each one.

The practical effect: adding a new C3-generated subtree under `scripts/` (or
`icons/`, etc.) never breaks drift detection. The walk simply does not descend
there because the subtree has no matching declaration in the manifest.

The invariant is preserved symmetrically: `walkManifestFileTree` recurses into
declared subfolders; `walkDiskFileTree` recurses into the same declared
subfolders on disk. If C3 were to introduce file-folder nesting in a future
release, updating `C3FileFolder.subfolders` in the manifest model (and ensuring
the manifest file carries the `name` field) is sufficient — both walk functions
already handle the recursive case.

## Testing: real-export ground truth + inline legibility

Schema-fidelity facts ("which fields does C3 actually write?", "what are a
default layer's keys?") are verified against a **real C3 project export**
committed under `test/fixtures/` (saved from the C3 editor, not hand-written).
A C3-emitted `.gitignore` inside the export excludes `*.uistate.json` and
`ts-defs`.
Fixture-dependent tests self-skip via `fixtureExists(...)`/`this.skip()` so the
suite stays green as the export grows and so capabilities not yet present in
the fixture (e.g. a disabled condition) activate automatically once added.

Three hazards come with this strategy when the export is **enriched** (the
fixture is a real C3 project, so it carries more than data):

- **Generated code in the fixture breaks the gate.** A real export includes
  C3-generated TypeScript — `scripts/*.ts`, `tsconfig.json`, and a
  `ts-defs/**/*.d.ts` tree whose codegen uses `var` and `Function`. ESLint and
  `tsc` scan `test/`, so they would fail on it. `test/fixtures/` is therefore
  **excluded from both** (`ignorePatterns` in `.eslintrc.cjs`, `exclude` in
  `tsconfig.test.json`). Fixtures are test *data*, never linted/typechecked.
- **The self-skip pattern has an inverse hazard.** Renaming or deleting a
  fixture file silently re-skips its `fixtureExists`-gated tests — a coverage
  loss that is invisible unless you watch the **pending count** (mocha reports
  it). After changing fixture filenames, confirm the pending count did not rise;
  repoint the gated tests to the new names.
- **Gitignored fixture content is absent in CI.** `*.uistate.json` and `ts-defs`
  are gitignored, so a test that needs them present (e.g. to prove the `uistate/`
  / `ts-defs/` skip is real, not vacuous) must `git add -f` a representative
  slice. Note the suffix patterns are exact: `*.uistate.json` does **not** match
  the `uistate/` directory's `*.instancesBar.json` files.
- **Fixture images must be real, not faked.** The image-drift tests key only on
  *filenames*, so a placeholder whose bytes don't match its extension and declared
  `fileType` (e.g. a PNG renamed to `.jpg` alongside `fileType: image/jpeg`) passes
  the suite yet is no longer a loadable C3 export — the editor fails to decode it.
  To exercise a non-PNG format, add a **genuinely-exported** object backed by real
  bytes of that format and keep the JSON `width`/`height` matching the actual image,
  even though a new objectType/family costs manifest-membership churn (item counts,
  name-tree `deep.equal`s, `inSync`). Fidelity beats minimizing churn — this was the
  #29 regression, where a renamed-PNG fixture passed every test but corrupted the
  export.

Guard schema drift with a **key-parity test**: assert a generated structure's
key set equals a real export's (see `makeDefaultLayer.test.ts`). This catches C3
adding/removing fields without pinning brittle values.

Assertions whose expected values must stay legible — above all the event-counter
agreement test — use **small inline fixtures** where the expected numbers are
obvious (`Outer=1, Inner=2, …`), not a large real sheet where "why is this
event #47?" is opaque.
