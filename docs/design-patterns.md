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

## Shallow vs recursive disk walk in detectManifestDrift

`detectManifestDrift` uses **two different walk depths** for its two manifest
section types:

- **Name-folder sections** (`layouts`, `eventSheets`, `objectTypes`, …) —
  recursive via `find_all_files_path`. These are C3 source trees where C3 itself
  writes files at arbitrary depth, so the full tree must be visited.
- **File-folder sections** (`rootFileFolders.script`, `.icon`, …) — **shallow**:
  `readdirSync(folder).filter(isFile)`. Manifest membership for file folders is
  itself flat (each `C3FileEntry` in the manifest is a top-level entry), and the
  corresponding on-disk directories can contain generated subdirectories
  (e.g. `scripts/ts-defs/` written by C3 for TypeScript definitions). A recursive
  walk would surface every file in `ts-defs/` as an untracked artifact. The
  shallow walk sidesteps this without needing an explicit exclusion for each
  generated subtree — a new generated subdir is simply invisible.

The invariant: **walk depth must match what the manifest can declare**. If C3
ever allows file-folder subfolders in the manifest, both the manifest model
(`C3FileFolder.subfolders`) and the disk walk (`diskFileFolderNames`) would need
to become recursive together.

## Testing: real-export ground truth + inline legibility

Schema-fidelity facts ("which fields does C3 actually write?", "what are a
default layer's keys?") are verified against a **real C3 project export**
committed under `test/fixtures/` (saved from the C3 editor, not hand-written).
A C3-emitted `.gitignore` inside the export excludes `*.uistate.json`.
Fixture-dependent tests self-skip via `fixtureExists(...)`/`this.skip()` so the
suite stays green as the export grows and so capabilities not yet present in
the fixture (e.g. a disabled condition) activate automatically once added.

Guard schema drift with a **key-parity test**: assert a generated structure's
key set equals a real export's (see `makeDefaultLayer.test.ts`). This catches C3
adding/removing fields without pinning brittle values.

Assertions whose expected values must stay legible — above all the event-counter
agreement test — use **small inline fixtures** where the expected numbers are
obvious (`Outer=1, Inner=2, …`), not a large real sheet where "why is this
event #47?" is opaque.
