# API Guide

Reference for downstream consumers (build tools, analyzers, code generators)
that work with C3 folder-project files outside the editor.

- [SID traversal](#sid-traversal) — collect and path-label every `sid` in a JSON subtree
- [Editor-local classification](#editor-local-classification) — filter `uistate/`, `ts-defs/`, generated files
- [Project manifest model and drift detection](api-guide-manifest.md) — parse `project.c3proj`, detect manifest/disk divergence
- [Event-sheet extraction](api-guide-extraction.md) — visitEvents, extractScriptsFromSheet, extractFunctions, extractIncludes, walkScriptActions

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
import { walkSids, formatSidPath, readFileSync } from "@genvid/c3source";
import type { SidPathSegment } from "@genvid/c3source";

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
import { isEditorLocalPath } from "@genvid/c3source";

function listSourceEntries(dir: string): string[] {
  return readdirSync(dir).filter((name) => !isEditorLocalPath(name));
}

// "uistate"               → excluded (directory form)
// "ts-defs"               → excluded (directory form)
// "tsconfig.json"         → excluded (exact name)
// "Layout 1.uistate.json" → excluded (suffix form)
// "Layout 1.json"         → included
```

`find_all_files_path`, `find_all_layouts_path`, and the other named collectors
already call `isEditorLocalPath` internally. Use this function when you run
your own `readdirSync` loop rather than going through the collectors.

### Extending the exclusion set

If a future C3 release introduces a new editor-local convention, add it to
`EDITOR_LOCAL_EXCLUSIONS` — every call site inherits the change automatically.
Do not inline the predicate in new code.
