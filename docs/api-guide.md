# API Guide

Reference for downstream consumers (build tools, analyzers, code generators)
that work with C3 folder-project files outside the editor.

- [SID traversal](#sid-traversal) — collect and path-label every `sid` in a JSON subtree
- [Editor-local classification](#editor-local-classification) — filter `uistate/`, `ts-defs/`, generated files
- [Minified-source classification](#minified-source-classification) — identify project source C3 writes minified (`*.brush.json`)
- [Project handle](api-guide-project.md) — openProject(root), C3Project path fields, file finders, drift delegation
- [Project manifest model and drift detection](api-guide-manifest.md) — parse `project.c3proj`, detect manifest/disk divergence
- [Event-sheet extraction](api-guide-extraction.md) — visitEvents, extractScriptsFromSheet, extractFunctions, extractIncludes, walkScriptActions
- [Addon domain layer](api-guide-addons.md) — usedAddons, addon attribution, `.c3addon` discovery + reader, aces.json/addon.json parsing

---

## SID traversal

Every object in a C3 event sheet carries a numeric `sid` (stable identifier).
These functions let you collect, locate, and path-label every sid in a JSON
subtree without writing your own recursive walk.

### Types

```ts
/** A path segment: object key (string) or array index (number). */
type SidPathSegment = string | number;
```

### Functions

```ts
walkSids(node: unknown, visit: (sid: number, segments: SidPathSegment[]) => void): void
```

The exported primitive. Recursively visits every object carrying a numeric `sid`
field, calling `visit` with the sid value and a structured path from the root of
`node` to that object. `segments` is a fresh array per call (safe to store).

Path encoding: string segments are object keys, number segments are array
indices. When `node` itself carries a `sid`, `segments` is empty (`[]`).

```ts
formatSidPath(segments: ReadonlyArray<SidPathSegment>): string
```

Renders a segment array into a canonical dotted/indexed string:

- Array index → `[i]`
- Object key → `.key`, except the first key segment has no leading dot
- Empty segments → `""` (the root object)

```ts
collectSids(node: unknown): Set<number>
collectSidsWithPaths(node: unknown): Array<{ sid: number; path: string }>
```

Convenience consumers built on `walkSids`. `collectSids` returns a flat set of
all sids. `collectSidsWithPaths` returns each sid paired with its
`formatSidPath` string.

### When to drive `walkSids` directly

`collectSidsWithPaths` returns `""` for the root object. If you need a semantic
label there (e.g. the sheet name instead of an empty string), drive `walkSids`
directly:

```ts
import { walkSids, formatSidPath, readFileSync } from "@genvidtech/c3source";
import type { SidPathSegment } from "@genvidtech/c3source";

// Build a sid → label registry for an event sheet, labelling the root sid
// with the sheet name rather than the empty-string formatSidPath returns.
const sheet = JSON.parse(readFileSync("eventSheets/GamePlay.json", "utf-8"));
const registry = new Map<number, string>();

walkSids(sheet, (sid: number, segments: SidPathSegment[]) => {
  const label = segments.length === 0 ? `sheet:${sheet.name}` : formatSidPath(segments);
  registry.set(sid, label);
});
// registry.get(sheet.sid)  → "sheet:GamePlay"
// registry.get(201)        → "events[0]"
// registry.get(200)        → "events[0].conditions[0]"
```

This is the pattern issue #18 requested: a downstream tool building a
SID registry where the file-root sid shows a meaningful label.

### Path format reference

Given a sheet `{ sid: 100, events: [{ sid: 201, conditions: [{ sid: 200 }] }] }`:

| sid | segments | `formatSidPath` output |
|-----|----------|------------------------|
| 100 | `[]` | `""` |
| 201 | `["events", 0]` | `"events[0]"` |
| 200 | `["events", 0, "conditions", 0]` | `"events[0].conditions[0]"` |

### Design note

For the rationale behind separating traversal (`walkSids`) from rendering
(`formatSidPath`), see [design-patterns.md — Traversal-vs-rendering split for SIDs](design-patterns.md#traversal-vs-rendering-split-for-sids).

---

## Editor-local classification

C3 writes editor UI state alongside project source files — `uistate/`
subdirectories (r487+) and `*.uistate.json` files. For TypeScript projects it
also writes `tsconfig.json` and a `ts-defs/` subtree, both overwritten by the
editor on each save. These are not C3 source and must be excluded from any disk
walk that feeds a parser or analyzer.

### Exports

```ts
const EDITOR_LOCAL_EXCLUSIONS: {
  dirs: readonly string[];        // ["uistate", "ts-defs"]
  fileSuffixes: readonly string[]; // [".uistate.json"]
  exactNames: readonly string[];  // ["tsconfig.json"]
}

function isEditorLocalPath(name: string): boolean
```

`isEditorLocalPath` accepts a **bare basename** (no path separator) and returns
`true` if that name matches any excluded directory, exact filename, or file
suffix. It covers every form so a single call replaces every skip site uniformly.

### Usage: filtering a disk enumeration

The canonical use case (issue #19 / construct3-chef#36): a tool that walks a
project directory itself and wants to exclude editor-local entries without
re-deriving the skip rule:

```ts
import { readdirSync, statSync } from "node:fs";
import { isEditorLocalPath } from "@genvidtech/c3source";

function listSourceEntries(dir: string): string[] {
  return readdirSync(dir).filter((name) => !isEditorLocalPath(name));
}

// "uistate"                → excluded (directory form)
// "ts-defs"                → excluded (directory form)
// "tsconfig.json"          → excluded (exact name)
// "Layout 1.uistate.json"  → excluded (suffix form)
// "Layout 1.json"          → included
// "Tilemap.brush.json"     → included (project source, minified — see below)
```

`find_all_files_path`, `find_all_layouts_path`, and the other named collectors
already call `isEditorLocalPath` internally. Use this function when you run
your own `readdirSync` loop rather than going through the collectors.

`find_all_files_path` also accepts an optional third parameter that
overrides which directories it descends into, independently of this
classifier — see [Reachability is not classification](#reachability-is-not-classification)
below.

### Extending the exclusion set

If a future C3 release introduces a new editor-local convention, add it to
`EDITOR_LOCAL_EXCLUSIONS` — every call site inherits the change automatically.
Do not inline the predicate in new code.

### Reachability is not classification

`isEditorLocalPath` used to answer two different questions with one predicate:
*"is this directory C3 source?"* (classification) and *"may a disk walk enter
it?"* (reachability). Because `ts-defs` is in `EDITOR_LOCAL_EXCLUSIONS.dirs`,
`scripts/ts-defs/**` was unreachable through `find_all_files_path` no matter
what `predicate` a caller passed — the directory-descent rule was hardcoded,
not just the default.

`find_all_files_path` now takes an optional third parameter, `descend`, that
controls directory entry separately from `predicate` (which still only
selects files). It defaults to the editor-local rule, so every existing
2-argument call is unaffected. A caller that genuinely needs a C3-generated,
non-source directory's contents (e.g. `ts-defs/`'s `.d.ts` files, for
TypeScript symbol resolution) can opt in:

```ts
import { find_all_files_path, isEditorLocalPath, C3_TS_DEFS_FOLDER } from "@genvidtech/c3source";

const tsDefs = find_all_files_path(
  scriptsDir,
  (name) => name.endsWith(".d.ts"),
  (dirname) => dirname === C3_TS_DEFS_FOLDER || !isEditorLocalPath(dirname),
);
```

**Overriding `descend` disables inherited editor-local classification for the
entered subtree** — the caller's `predicate` becomes the only filter, and it
sees bare basenames that `isEditorLocalPath` will not flag (e.g.
`objects.d.ts`, `Main Layout.instancesBar.json`). Write the `predicate`
defensively if the opened subtree could contain such names.

See [ADR 0020](decisions/0020-caller-controlled-walk-descent.md) (issue #63)
for why the classifier itself is unchanged and only reachability became
overridable.

**Deliberately not covered here.** `tilemapBrushes/**/*.brush.json` is *not* an
editor-local artifact — `isEditorLocalPath` correctly returns `false` for it —
even though C3 writes it in the same minified byte form as `*.uistate.json`.
It is project source, just serialized a second way. See [Minified-source
classification](#minified-source-classification) below.

---

## Minified-source classification

C3 writes almost all project source tab-indented (see [ADR
0016](decisions/0016-c3-source-json-serialization-form.md)), but
`tilemapBrushes/**/*.brush.json` is a documented exception: it is hand-authored
project source — tilemap brush definitions, with no generator that would
recreate them — that C3 nonetheless writes minified
(`JSON.stringify(value)`, no indent, no trailing newline). This is orthogonal
to editor-local classification (above): a file's serialization form does not
determine its provenance. See [ADR
0018](decisions/0018-brush-json-minified-source-not-editor-local.md) for the
full rationale.

### Exports

```ts
const C3_MINIFIED_SOURCE_SUFFIXES: readonly string[] // [".brush.json"]

function isMinifiedSourcePath(name: string): boolean
```

`isMinifiedSourcePath` accepts a **bare basename**, matching
`isEditorLocalPath`'s argument contract, and returns `true` for a known
minified-source suffix. It answers a narrower question than
`isEditorLocalPath`: "is this file project source that happens to be
minified?" — not "is this file minified at all." `*.uistate.json` files are
also minified on disk, but `isMinifiedSourcePath` returns `false` for them,
because they are editor-local and therefore out of this predicate's scope
(`isEditorLocalPath` already classifies them).

Detection only — c3source ships no minified writer. A caller that needs to
write a `.brush.json` file composes `JSON.stringify(value)` directly.
