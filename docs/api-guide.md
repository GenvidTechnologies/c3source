# API Guide: SID Traversal, Editor-Local Classification, and Project Manifest

Reference for three capability areas added in issues #18 and #19. Intended for
downstream consumers (build tools, analyzers, code generators) that work with
C3 folder-project files outside the editor.

- [SID traversal](#sid-traversal)
- [Editor-local classification](#editor-local-classification)
- [Project manifest model and drift detection](#project-manifest-model-and-drift-detection)

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
subdirectories (r487+) and `*.uistate.json` files. These are not C3 source and
must be excluded from any disk walk that feeds a parser or analyzer.

### Exports

```ts
const EDITOR_LOCAL_EXCLUSIONS: {
  dirs: readonly string[];        // currently: ["uistate"]
  fileSuffixes: readonly string[]; // currently: [".uistate.json"]
}

function isEditorLocalPath(name: string): boolean
```

`isEditorLocalPath` accepts a **bare basename** (no path separator) and returns
`true` if that name matches any excluded directory or file suffix. It covers
both forms so a single call replaces every skip site uniformly.

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

// "uistate"           → excluded (directory form)
// "Layout 1.uistate.json" → excluded (suffix form)
// "Layout 1.json"     → included
```

`find_all_files_path`, `find_all_layouts_path`, and the other named collectors
already call `isEditorLocalPath` internally. Use this function when you run
your own `readdirSync` loop rather than going through the collectors.

### Extending the exclusion set

If a future C3 release introduces a new editor-local convention, add it to
`EDITOR_LOCAL_EXCLUSIONS` — every call site inherits the change automatically.
Do not inline the predicate in new code.

---

## Project manifest model and drift detection

`project.c3proj` is the JSON manifest at the root of every C3 folder-project.
It lists every layout, event sheet, script file, and asset that the project
declares. The functions here parse it into typed structures and detect when the
on-disk source tree has diverged from what the manifest declares.

> These functions work with folder-projects only, not the single-file `.c3p`
> archive export. See the Compatibility section of the README.

### Types

```ts
/** A folder of named items (layouts, eventSheets, timelines, …). */
interface C3NameFolder {
  items: string[];
  subfolders: C3NameFolder[];
}

/** A single file entry in a rootFileFolders category. */
interface C3FileEntry {
  name: string;
  type: string;
  sid: number;
  [key: string]: unknown; // forward-compat: script-info, icon-info, …
}

/** A folder of file entries (scripts, icons, …). */
interface C3FileFolder {
  items: C3FileEntry[];
  subfolders: C3FileFolder[];
}

/** All seven rootFileFolders categories. */
interface C3RootFileFolders {
  script: C3FileFolder;
  sound: C3FileFolder;
  music: C3FileFolder;
  video: C3FileFolder;
  font: C3FileFolder;
  icon: C3FileFolder;
  general: C3FileFolder;
}

/** The parsed project.c3proj (folder-project format). */
interface C3ProjectManifest {
  projectFormatVersion: number;
  savedWithRelease: number;
  name: string;
  runtime: string;
  objectTypes: C3NameFolder;
  layouts: C3NameFolder;
  eventSheets: C3NameFolder;
  timelines: C3NameFolder;
  flowcharts: C3NameFolder;
  families: C3NameFolder;
  models3d: C3NameFolder;
  containers: unknown[];
  rootFileFolders: C3RootFileFolders;
  properties: Record<string, unknown>;
  [key: string]: unknown; // forward-compat: usedAddons, firstLayout, viewportWidth, …
}
```

### Mapping tables

These tables map manifest keys to their on-disk directory names. Pass them to
`detectManifestDrift` or use them when constructing your own paths.

```ts
/** Manifest section key → on-disk folder for name-folder sections. */
const C3_SECTION_FOLDERS: {
  layouts: "layouts";
  eventSheets: "eventSheets";
  objectTypes: "objectTypes"; // assumed flat; unconfirmed by empty fixture
  timelines: "timelines";
  flowcharts: "flowcharts";
}

/** Manifest rootFileFolders category → on-disk source folder. */
const C3_ROOT_FILE_FOLDERS: {
  script: "scripts";   // fixture-confirmed
  sound: "sounds";     // inferred
  music: "music";      // inferred
  video: "videos";     // inferred
  font: "fonts";       // inferred
  icon: "icons";       // fixture-confirmed
  general: "files";    // inferred
}
```

Note the singular→plural shift: the manifest uses `script`/`icon` as category
keys; the on-disk folders are `scripts`/`icons`. The five inferred mappings
(`sound`, `music`, `video`, `font`, `general`) follow the same pattern but have
not been validated against a fixture with those assets populated. If a mapping
is wrong for your project, open an issue.

### Parsing

```ts
parseProjectManifest(json: unknown): C3ProjectManifest
readProjectManifest(manifestPath: string): C3ProjectManifest
```

`readProjectManifest` reads the file at `manifestPath` and delegates to
`parseProjectManifest`. Both throw `Error("invalid project.c3proj: …")` on
shape violations. Absent modeled sections (e.g. `layouts` missing entirely) are
tolerated and treated as empty. Unmodeled top-level fields pass through
unchanged.

```ts
import { readProjectManifest } from "@genvid/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
console.log(m.name);             // "my-game"
console.log(m.savedWithRelease); // e.g. 48700
console.log(m.layouts.items);    // ["Layout 1", "Battle", …]
```

### Flatteners

```ts
collectManifestItemNames(folder: C3NameFolder): string[]
collectManifestFileNames(folder: C3FileFolder): string[]
```

Both recurse into `subfolders`, collecting all leaf names in depth-first order.

`collectManifestItemNames` returns item strings (layout names, event sheet
names, etc.). `collectManifestFileNames` returns item `name` fields (filenames
like `"main.js"`).

```ts
import { readProjectManifest, collectManifestItemNames, collectManifestFileNames } from "@genvid/c3source";

const m = readProjectManifest("./my-game/project.c3proj");

// All layout names, including those in subfolders:
const layoutNames = collectManifestItemNames(m.layouts);
// ["Layout 1", "Battle", "Cutscene/Intro", …]

// All script filenames, including those in script subfolders:
const scriptFiles = collectManifestFileNames(m.rootFileFolders.script);
// ["main.js", "importsForEvents.js", …]
```

### Drift detection

```ts
interface SectionDrift {
  section: string;      // e.g. "layouts", "rootFileFolders.script"
  folder: string;       // on-disk folder, e.g. "layouts", "scripts"
  missingOnDisk: string[]; // declared in manifest, no file on disk
  untracked: string[];     // file on disk, not declared in manifest
}

interface ManifestDrift {
  sections: SectionDrift[]; // empty when inSync
  inSync: boolean;
}

detectManifestDrift(projectDir: string, manifest?: C3ProjectManifest): ManifestDrift
```

Compares manifest-declared membership against on-disk source files. When
`manifest` is omitted, reads `projectDir/project.c3proj` automatically.
Editor-local entries (`uistate/`, `*.uistate.json`) are filtered from the disk
side before comparison.

`detectManifestDrift` only reports what it finds. The caller decides what to do
about drift (warn, fail the build, sync).

```ts
import { detectManifestDrift } from "@genvid/c3source";

const drift = detectManifestDrift("./my-game");

if (drift.inSync) {
  console.log("Manifest matches disk.");
} else {
  for (const section of drift.sections) {
    if (section.missingOnDisk.length) {
      console.warn(`[${section.section}] declared but not on disk: ${section.missingOnDisk.join(", ")}`);
    }
    if (section.untracked.length) {
      console.warn(`[${section.section}] on disk but not declared: ${section.untracked.join(", ")}`);
    }
  }
}
```

To inject a pre-parsed manifest (e.g. after modifying it in memory for testing):

```ts
import { readProjectManifest, detectManifestDrift } from "@genvid/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
// m.layouts.items.push("NewLayout"); // hypothetical modification
const drift = detectManifestDrift("./my-game", m);
```

#### Walk depth

Name-folder sections (`layouts`, `eventSheets`, `objectTypes`, etc.) use the
same recursive `find_all_files_path` walk as the source collectors, so nested
layout directories are handled correctly. File-folder sections (`scripts`,
`icons`, etc.) use a **shallow** one-level walk. This matches how the manifest
declares file entries (flat, not nested by subdirectory) and avoids surfacing
generated subtrees like `scripts/ts-defs/` as untracked files.

For the design rationale, see [design-patterns.md — Shallow vs recursive disk walk in detectManifestDrift](design-patterns.md#shallow-vs-recursive-disk-walk-in-detectmanifestdrift).
