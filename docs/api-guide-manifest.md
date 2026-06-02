# API Guide: Project Manifest Model and Drift Detection

Reference for the `project.c3proj` manifest model and structured drift detection
added in issues #19 and #21. For the SID traversal and editor-local classification
APIs see [api-guide.md](api-guide.md).

- [Types](#types)
- [Mapping tables](#mapping-tables)
- [Parsing](#parsing)
- [Flatteners](#flatteners)
- [Drift detection](#drift-detection)
- [Migrating from 0.x](#migrating-from-0x)

---

`project.c3proj` is the JSON manifest at the root of every C3 folder-project.
It lists every layout, event sheet, script file, and asset that the project
declares. The functions here parse it into typed structures and detect when the
on-disk source tree has diverged from what the manifest declares.

> These functions work with folder-projects only, not the single-file `.c3p`
> archive export.

## Types

```ts
/** A folder of named items (layouts, eventSheets, timelines, …) in the manifest.
 *  `name` is the organizational subfolder name, matching the on-disk subdirectory.
 *  Absent on the section root and on degenerate empty subfolders C3 writes without a name. */
interface C3NameFolder {
  items: string[];
  subfolders: C3NameFolder[];
  name?: string;
}

/** A single file entry in a rootFileFolders category. */
interface C3FileEntry {
  name: string;
  type: string;
  sid: number;
  [key: string]: unknown; // forward-compat: script-info, icon-info, …
}

/** A folder of file entries in the manifest (scripts, icons, …).
 *  `name` is the organizational subfolder name, matching the on-disk subdirectory.
 *  Absent on the category root and on degenerate empty subfolders. */
interface C3FileFolder {
  items: C3FileEntry[];
  subfolders: C3FileFolder[];
  name?: string;
}

/** A container declaration: a set of object-type names that travel together. */
interface C3Container {
  members: string[];
  [key: string]: unknown;
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
  containers: C3Container[];
  rootFileFolders: C3RootFileFolders;
  properties: Record<string, unknown>;
  [key: string]: unknown; // forward-compat: usedAddons, firstLayout, viewportWidth, …
}
```

## Mapping tables

These tables map manifest keys to their on-disk directory names. Pass them to
`detectManifestDrift` or use them when constructing your own paths.

```ts
/** Manifest section key → on-disk folder for name-folder sections.
 *  Every section uses flat <Name>.json files in named organizational subfolders
 *  (confirmed by real export, including objectTypes — no per-type directory).
 *  `containers` is intentionally absent: it is declared inline, with no on-disk folder. */
const C3_SECTION_FOLDERS: {
  layouts: "layouts";
  eventSheets: "eventSheets";
  objectTypes: "objectTypes";
  timelines: "timelines";
  flowcharts: "flowcharts";
  families: "families";
  models3d: "models3d";
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

## Parsing

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
console.log(m.layouts.items);    // ["Main", "Battle", …]
```

## Flatteners

```ts
collectManifestItemNames(folder: C3NameFolder): string[]
collectManifestFileNames(folder: C3FileFolder): string[]
```

Both recurse into `subfolders`, collecting all leaf names in depth-first order.
These are thin consumers of the underlying walk primitives.

`collectManifestItemNames` returns item strings (layout names, event sheet
names, etc.). `collectManifestFileNames` returns item `name` fields (filenames
like `"main.ts"`).

```ts
import { readProjectManifest, collectManifestItemNames, collectManifestFileNames } from "@genvid/c3source";

const m = readProjectManifest("./my-game/project.c3proj");

// All layout names, including those in subfolders:
const layoutNames = collectManifestItemNames(m.layouts);
// ["Main", "Battle", "Cutscene/Intro", …]

// All script filenames, including those in script subfolders:
const scriptFiles = collectManifestFileNames(m.rootFileFolders.script);
// ["main.ts", "importsForEvents.ts", …]
```

## Drift detection

### Result types

```ts
/** A path segment locating an item within the manifest/disk subfolder tree (a subfolder name). */
type ManifestPathSegment = string;

/** The kind of drift a DriftEntry represents. */
type DriftKind = "missing" | "untracked" | "moved" | "folder-missing" | "folder-untracked" | "dangling-ref";

/** A structured drift entry that locates an item within the manifest/disk subfolder nesting. */
interface DriftEntry {
  kind: DriftKind;
  name: string;
  /** Ancestor subfolder names in the MANIFEST tree.
   *  Present on: missing, moved, folder-missing, dangling-ref. */
  manifestPath?: ManifestPathSegment[];
  /** Ancestor subfolder names on DISK.
   *  Present on: untracked, moved, folder-untracked. */
  diskPath?: ManifestPathSegment[];
}

interface SectionDrift {
  section: string; // e.g. "layouts", "rootFileFolders.script", "containers", "images"
  folder: string;  // on-disk folder, e.g. "layouts", "scripts" (empty for "containers")
  entries: DriftEntry[];
}

interface ManifestDrift {
  sections: SectionDrift[]; // empty when inSync
  inSync: boolean;
}
```

**Drift kind semantics:**

| Kind | `name` | `manifestPath` | `diskPath` | Meaning |
|------|--------|----------------|------------|---------|
| `missing` | item name | path in manifest | — | Declared in manifest; no file on disk |
| `untracked` | item name | — | path on disk | File on disk; not declared in manifest |
| `moved` | item name | path in manifest | path on disk | Same name, different subfolder on each side |
| `folder-missing` | subfolder name | path in manifest | — | Subfolder declared in manifest; not on disk |
| `folder-untracked` | subfolder name | — | path on disk | Subfolder on disk; not declared in manifest |
| `dangling-ref` | missing type name | `["#<i>"]` (container index) | — | Container member names a non-existent object type |

```ts
formatManifestPath(segments: ReadonlyArray<ManifestPathSegment>): string
```

Renders path segments into a slash-joined string. Empty segments → `""` (item
at the section root). Mirrors `formatSidPath` for manifest paths.

### `detectManifestDrift`

```ts
detectManifestDrift(projectDir: string, manifest?: C3ProjectManifest): ManifestDrift
```

Compares manifest-declared membership against on-disk source files. When
`manifest` is omitted, reads `projectDir/project.c3proj` automatically.
Editor-local entries (`uistate/`, `ts-defs/`, `tsconfig.json`, `*.uistate.json`)
are filtered from the disk side before comparison.

`detectManifestDrift` only reports what it finds. The caller decides what to do
about drift (warn, fail the build, sync).

```ts
import { detectManifestDrift, formatManifestPath } from "@genvid/c3source";

const drift = detectManifestDrift("./my-game");

if (drift.inSync) {
  console.log("Manifest matches disk.");
} else {
  for (const section of drift.sections) {
    for (const e of section.entries) {
      switch (e.kind) {
        case "missing":
          console.warn(
            `[${section.section}] declared but not on disk: ${e.name}` +
              (e.manifestPath?.length ? ` (in ${formatManifestPath(e.manifestPath!)})` : ""),
          );
          break;
        case "untracked":
          console.warn(
            `[${section.section}] on disk but not declared: ${e.name}` +
              (e.diskPath?.length ? ` (at ${formatManifestPath(e.diskPath!)})` : ""),
          );
          break;
        case "moved":
          console.warn(
            `[${section.section}] ${e.name} moved: manifest has ${formatManifestPath(e.manifestPath!)} ` +
              `but disk has ${formatManifestPath(e.diskPath!)}`,
          );
          break;
        case "dangling-ref":
          console.warn(
            `[containers] container ${e.manifestPath![0]} references unknown object type "${e.name}"`,
          );
          break;
        default:
          console.warn(`[${section.section}] ${e.kind}: ${e.name}`);
      }
    }
  }
}
```

**Example output for a project with several drift conditions:**

```ts
[
  {
    section: "objectTypes",
    folder: "objectTypes",
    entries: [
      // Sprite was declared under "images/" in the manifest but moved to "tiles/" on disk:
      { kind: "moved", name: "Sprite", manifestPath: ["images"], diskPath: ["tiles"] },
      // PlayerHUD was declared but the file was deleted:
      { kind: "missing", name: "PlayerHUD", manifestPath: ["global"] },
      // EnemyAI.json exists on disk but was never added to the manifest:
      { kind: "untracked", name: "EnemyAI", diskPath: ["global"] },
    ]
  },
  {
    section: "containers",
    folder: "",
    entries: [
      // Container #0 references "Sprite2" which isn't in the manifest's objectTypes:
      { kind: "dangling-ref", name: "Sprite2", manifestPath: ["#0"] },
    ]
  }
]
```

The `manifestPath`/`diskPath` segment arrays let a sync tool place a mutation
(add a manifest entry, delete an entry, update a subfolder reference) in the
correct tree position without re-walking the manifest.

To inject a pre-parsed manifest (e.g. after modifying it in memory for testing):

```ts
import { readProjectManifest, detectManifestDrift } from "@genvid/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
// m.layouts.items.push("NewLayout"); // hypothetical modification
const drift = detectManifestDrift("./my-game", m);
```

### Containers drift

`containers` are declared inline in the manifest with no on-disk folder.
`detectManifestDrift` performs a **referential integrity** check: any container
member that names an object type absent from the manifest is reported as a
`dangling-ref` entry. The `manifestPath` carries `["#<i>"]` (the container's
index) so the caller can locate which container holds the stale reference.

### Images drift

When an `images/` directory exists in the project, `detectManifestDrift`
automatically appends an `images` section to the result. Expected image
filenames are derived from all object-type JSON files in `objectTypes/` (see
`deriveExpectedImageNames`), then diffed against the flat files in `images/`.

**Coverage:**

| Object type shape | Expected images |
|---|---|
| Has `image` field (NinePatch, TiledBackground, Tilemap, …) | `<lowercased-name>.png` |
| Has `animations` field (Sprite, …) | `<lowercased-name>-<lowercased-animation>-<frame3>.png` per frame |
| Neither (Text, JSON, …) | None |

Animation subfolders collapse: the subfolder name does not appear in the
filename. Animation names are unique within an object type. `frame3` is the
zero-based frame index zero-padded to 3 digits (`000`, `001`, …).

**Known limits (intentionally incomplete; extensible in future releases):**

- Spritesheet/atlas packing: a sprite whose frames are packed into a single
  atlas sheet will not match the per-frame pattern.
- Custom export formats or non-`png` file types.
- Collision-polygon and image-point sidecar files.

Detection is structural (field presence), not a plugin-id allowlist — robust to
third-party single-image plugins but may over-derive for unusual plugin shapes.

If image derivation throws (e.g. a malformed object-type JSON), `detectManifestDrift`
silently omits the images section rather than failing core drift. Call
`detectImageDrift` directly if you want to surface derivation errors.

### Walk depth

**Name-folder sections** (`layouts`, `eventSheets`, `objectTypes`, `families`,
`models3d`, etc.) walk fully recursively through both the manifest subfolder
tree and the on-disk directory tree. All files at any depth are compared.

**File-folder sections** (`scripts`, `icons`, etc.) recurse only into
subdirectories whose name matches a declared subfolder in the manifest. An
undeclared directory is simply not walked. This means a generated tree like
`scripts/ts-defs/` — which is not a declared subfolder in `rootFileFolders.script`
— is never surfaced as untracked, without requiring an explicit exclusion for it.

For the design rationale, see [design-patterns.md — Declared-subfolder recursion for file-folder walks](design-patterns.md#declared-subfolder-recursion-for-file-folder-walks).

### Walk primitives

These are exported for callers that need the raw `{ name, path }` lists or want
to build a custom diff:

```ts
walkManifestNameTree(folder: C3NameFolder, basePath?: ManifestPathSegment[]): Array<{ name: string; path: ManifestPathSegment[] }>
walkManifestFileTree(folder: C3FileFolder, basePath?: ManifestPathSegment[]): Array<{ name: string; path: ManifestPathSegment[] }>
walkDiskNameTree(diskFolder: string, basePath?: ManifestPathSegment[]): Array<{ name: string; path: ManifestPathSegment[] }>
walkDiskFileTree(diskFolder: string, declaredSubfolders: C3FileFolder[], basePath?: ManifestPathSegment[]): Array<{ name: string; path: ManifestPathSegment[] }>

diffNameMaps(
  manifestItems: Array<{ name: string; path: ManifestPathSegment[] }>,
  diskItems: Array<{ name: string; path: ManifestPathSegment[] }>,
): DriftEntry[]
```

`diffNameMaps` produces `missing`/`untracked`/`moved` entries only (not
folder-level drift). Results are sorted deterministically by kind then name.

For the design rationale behind name→path map diffing and move detection, see
[design-patterns.md — Path-bearing drift via name→path map diffing](design-patterns.md#path-bearing-drift-via-namepath-map-diffing).

---

## Migrating from 0.x

Version 1.0.0 is a **breaking major**. The only breaking change is in
`SectionDrift`: the `missingOnDisk: string[]` and `untracked: string[]` fields
are removed and replaced by `entries: DriftEntry[]`.

**Before (0.x):**

```ts
for (const section of drift.sections) {
  section.missingOnDisk; // string[]
  section.untracked;     // string[]
}
```

**After (1.x):**

```ts
for (const section of drift.sections) {
  const missingOnDisk = section.entries.filter((e) => e.kind === "missing").map((e) => e.name);
  const untracked     = section.entries.filter((e) => e.kind === "untracked").map((e) => e.name);
}
```

The structured result additionally exposes:

- **Moves** — same name, different subfolder between manifest and disk (`kind: "moved"`, both `manifestPath` and `diskPath` present).
- **Folder-level drift** — subfolders present on only one side (`kind: "folder-missing"` / `kind: "folder-untracked"`).
- **Container referential integrity** — container members naming absent object types (`kind: "dangling-ref"`, `section: "containers"`).
- **Images drift** — expected vs actual `images/` files derived from object types (`section: "images"`).
- **`families` and `models3d`** sections (previously omitted from drift detection).
