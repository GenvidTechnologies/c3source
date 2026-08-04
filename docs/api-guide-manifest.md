# API Guide: Project Manifest Model and Drift Detection

Reference for the `project.c3proj` manifest model and structured drift detection
added in issues #19 and #21. For the SID traversal and editor-local classification
APIs see [api-guide.md](api-guide.md).

- [Types](#types)
- [Mapping tables](#mapping-tables)
- [Parsing](#parsing)
- [Validation](#validation)
- [Serialization & writing](#serialization--writing)
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
  bundleAddons?: boolean;
  usedAddons?: C3UsedAddon[];
  /** Name of C3's built-in functions object, configurable per project.
   *  Optional — absent means the project uses C3's default, `"Functions"`
   *  (`C3_DEFAULT_FUNCTIONS_NAME` in `src/references.ts`). Observed absent in
   *  5 of 14 real-world corpus projects. Before #60, c3source could not see
   *  this attribute at all — a renamed functions object silently produced
   *  false `event-class-unresolved` issues; see
   *  [api-guide-references.md](api-guide-references.md#domain-fact-tables). */
  functionsName?: string;
  [key: string]: unknown; // forward-compat: firstLayout, viewportWidth, …
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

There are two parse paths, sharing one shape-rule collector under the hood so
neither can drift from the other (see [ADR
0017](decisions/0017-tolerant-manifest-read.md)) — pick strict or tolerant per
call site, not per project:

| | Strict (default) | Tolerant (opt-in) |
|---|---|---|
| From a parsed value | `parseProjectManifest(json: unknown): C3ProjectManifest` | `parseProjectManifestTolerant(json: unknown): ManifestReadResult` |
| From a file path | `readProjectManifest(manifestPath: string): C3ProjectManifest` | `readProjectManifestTolerant(manifestPath: string): ManifestReadResult` |
| On a shape violation | Throws `Error("invalid project.c3proj: …")` using the **first** violation found | Never throws for a shape violation — returns every violation in `issues` |
| Absent modeled section (e.g. no `layouts`) | Tolerated, treated as empty (both paths) | Tolerated, treated as empty (both paths) |
| Unmodeled top-level fields | Pass through unchanged (both paths) | Pass through unchanged (both paths) |

`readProjectManifest`/`readProjectManifestTolerant` read the file at
`manifestPath` and delegate to their `parse*` counterpart. Strict remains the
default and unaffected by the tolerant path's existence — every existing
`parseProjectManifest`/`readProjectManifest` caller keeps throwing exactly the
same message it always did.

```ts
import { readProjectManifest } from "@genvidtech/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
console.log(m.name);             // "my-game"
console.log(m.savedWithRelease); // e.g. 48700
console.log(m.layouts.items);    // ["Main", "Battle", …]
```

**Two documented throw exceptions in tolerant mode** — tolerance is scoped to
*field-level shape*, not "is this a manifest at all", and not I/O:

1. A non-object top level (`42`, `null`, `[]`, …) still throws
   `invalid project.c3proj: top-level value must be an object` — there is no
   document to hand back.
2. `readProjectManifestTolerant` propagates `ENOENT` and `SyntaxError`
   unchanged, exactly like `readProjectManifest`. A caller that wants to own
   these composes `parseProjectManifestTolerant(JSON.parse(text))` itself.

```ts
import { readProjectManifestTolerant } from "@genvidtech/c3source";

const { manifest, issues } = readProjectManifestTolerant("./my-game/project.c3proj");
if (issues.length > 0) {
  console.warn(`project.c3proj has ${issues.length} shape issue(s):`, issues);
}
console.log(manifest.name); // present even when issues.length > 0
```

`manifest`/`m.usedAddons[0]`/etc. from either the strict or tolerant path is
**the same object that was parsed — never cloned or projected**, so mutating
it in place and passing it to `writeProjectManifest` keeps the round-trip
byte-fidelity described under [Serialization & writing](#serialization--writing).

## Validation

```ts
validateProjectManifest(json: unknown): ManifestValidationIssue[]
```

Detection-only — never throws, and returns `[]` for a well-formed manifest
(the same detect-don't-throw shape as `validateForEditor` in
`src/eventSheets.ts`, one level up the stack). It is the standalone building
block both parse paths above share: `parseProjectManifest` throws using
`issues[0]`; `parseProjectManifestTolerant` returns all of `issues` alongside
the document.

```ts
interface ManifestValidationIssue {
  path: string;              // e.g. "usedAddons[0].author", "" for the root
  rule: ManifestShapeRuleId; // discriminates every distinct shape check
  message: string;           // the exact text parseProjectManifest throws
                              // after the "invalid project.c3proj: " prefix
}
```

`ManifestShapeRuleId` is a string-literal union with one id per shape check
(e.g. `"saved-with-release-number"`, `"used-addon-author"`, `"file-entry-sid"`)
— see `src/manifest.ts` for the full list. It is what turns "tolerant" into
"tolerant *except these rules*": filter `issues` by `rule` to decide which
violations to act on and which to ignore.

```ts
import { readProjectManifestTolerant } from "@genvidtech/c3source";

const IGNORED_RULES = new Set(["saved-with-release-number", "used-addon-author"]);

const { manifest, issues } = readProjectManifestTolerant("./my-game/project.c3proj");
const actionable = issues.filter((i) => !IGNORED_RULES.has(i.rule));

if (actionable.length > 0) {
  throw new Error(`project.c3proj has unrepairable issues: ${actionable.map((i) => i.message).join("; ")}`);
}
// A missing savedWithRelease or usedAddons[].author is tolerated; everything else fails fast.
```

## Serialization & writing

```ts
serializeProjectManifest(m: C3ProjectManifest): string
writeProjectManifest(manifestPath: string, m: C3ProjectManifest): void
```

Serialize (or serialize-and-write) a manifest in the canonical `project.c3proj`
on-disk form: **tab-indented, and — the inverse of the usual text-file
convention — with no trailing newline.** This is a C3 domain fact, not a
c3source style choice: checked against the canonical `construct3-sample`
fixture, 25 of the 26 non-editor-local `.json`/`.c3proj` files satisfy
`serializeC3Json(JSON.parse(text)) === text`, and **none** ends with a
newline. (The one exception, `*.brush.json`, is project source that C3 writes
minified — see `isMinifiedSourcePath` in [api-guide.md](api-guide.md#minified-source-classification)
and [ADR 0018](decisions/0018-brush-json-minified-source-not-editor-local.md).)

```ts
import { readProjectManifest, writeProjectManifest } from "@genvidtech/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
m.usedAddons?.[0] && (m.usedAddons[0].version = "2.0.0");
writeProjectManifest("./my-game/project.c3proj", m);
```

**Does not validate.** Neither function calls `validateProjectManifest` —
call it yourself first if you need a write-safety gate:

```ts
const issues = validateProjectManifest(m);
if (issues.length > 0) throw new Error(`refusing to write an invalid manifest: ${issues[0].message}`);
writeProjectManifest(manifestPath, m);
```

This is deliberate, not an oversight: a validating writer would reject exactly
the repair workflow tolerant reads exist for — writing back a manifest that
was read tolerantly, partially fixed, and still doesn't fully conform. See
[ADR 0017](decisions/0017-tolerant-manifest-read.md).

**Byte-fidelity caveat.** Round-tripping a manifest byte-for-byte depends on
`m` being the **same object, mutated in place**, that a `parse*`/`read*` call
returned — not a rebuild via nested object spreads. `{ ...m, layouts: {
...m.layouts, items: [...] } }` reorders keys and drops any unmodeled field
not explicitly copied; it will not reproduce the original bytes. Prefer
in-place mutation (`m.layouts.items.push(...)`) when byte-fidelity matters.

> [!WARNING]
> **Dual-writer hazard.** Close the project in the **C3 editor** before
> writing `project.c3proj` externally. If the project is open, the editor's
> own next save clobbers your write — c3source cannot detect or prevent this;
> it is a caveat of writing a file the editor also owns, not a code defect.

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
import { readProjectManifest, collectManifestItemNames, collectManifestFileNames } from "@genvidtech/c3source";

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

/** A best-effort sub-detector that threw and was skipped. */
interface DriftDegradation {
  section: string; // the omitted section, e.g. "images"
  message: string; // the failure's message text
}

interface ManifestDrift {
  sections: SectionDrift[];       // empty when inSync
  inSync: boolean;                // sections.length === 0 — unaffected by degradation
  degraded?: DriftDegradation[];  // present only when a best-effort sub-detector threw
}
```

`degraded` is present only when a best-effort sub-detector — currently just
the images sub-detector, see [Images drift](#images-drift) — threw and was
skipped (#68); that sub-detector's section is then simply absent from `sections`
rather than silently missing with no explanation. This is how a caller tells
"verified, no drift" apart from "never verified": `inSync` does not change
meaning when a degradation occurs, it stays exactly `sections.length === 0`.
So `inSync === true` together with a populated `degraded` means "no drift
among the sections that were actually checked", not "no drift" — the
**absence** of `degraded` (not `inSync`) is the signal that every section was
verified.

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
For name-folder sections, editor-local entries (`uistate/`, `tsconfig.json`,
`*.uistate.json`) are filtered from the disk side before comparison via
`isEditorLocalPath`. `ts-defs/` is not reached by that filter at all: it lives
under `scripts`, a file-folder section walked by `walkDiskFileTree`, which
recurses manifest-declared subfolders only (see [Walk depth](#walk-depth)
below) — `ts-defs` is undeclared, so it is invisible to drift before
`isEditorLocalPath` ever gets a chance to run on it.

`detectManifestDrift` only reports what it finds. The caller decides what to do
about drift (warn, fail the build, sync). The images sub-detector is
best-effort and can throw (see [Images drift](#images-drift)); when it does,
`detectManifestDrift` still returns, but records the failure in
`ManifestDrift.degraded` rather than swallowing it.

```ts
import { detectManifestDrift, formatManifestPath } from "@genvidtech/c3source";

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
import { readProjectManifest, detectManifestDrift } from "@genvidtech/c3source";

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

This `dangling-ref` check is drift's **only** reference check — drift stays
membership-only otherwise (declared vs. on-disk names, not whether a
reference *resolves*). Reference integrity beyond containers (addon
declarations, family members, layout instance types, event `objectClass`)
lives in a separate module — see
[api-guide-references.md](api-guide-references.md).

### Images drift

When an `images/` directory exists in the project, `detectManifestDrift`
automatically appends an `images` section to the result. Expected images are
derived from all object-type JSON files in `objectTypes/`, then diffed
against the flat files in `images/`.

```ts
/** One expected on-disk image, as derived structurally from an object type. */
interface ExpectedImage {
  stem: string;    // filename stem, no extension: "bullet-default-000", "tiledbackground"
  ext?: string;     // resolved from fileType; absent for pre-r402 nodes that record no MIME
  context: string; // diagnostic locator: "TiledBackground" or "Bullet/Default#0"
}

deriveExpectedImages(objectType: Record<string, unknown>): ExpectedImage[]
deriveExpectedImageNames(objectType: Record<string, unknown>): string[]
```

`deriveExpectedImages` is the structured form — one `ExpectedImage` per
expected file, carrying `ext` separately so a caller can tell "resolved from a
known `fileType`" apart from "no `fileType` recorded" without string-parsing a
filename. `deriveExpectedImageNames` is a thin renderer over it: it joins
`stem` and `ext` into a plain filename string, always (see below for what it
renders when `ext` is absent). `detectImageDrift` calls the structured form
directly, for the reason covered below.

**Coverage:**

| Object type shape | Expected images |
|---|---|
| Has `image` field (NinePatch, TiledBackground, Tilemap, …) | `<lowercased-name>.<ext>` |
| Has `animations` field (Sprite, …) | `<lowercased-name>-<lowercased-animation>-<frame3>.<ext>` per frame |
| Neither (Text, JSON, …) | None |

The file extension `<ext>` is derived from each image member's `fileType` MIME via the exported
`IMAGE_FILE_TYPE_EXTENSIONS` map:

| MIME | Extension |
|---|---|
| `image/png` | `png` |
| `image/jpeg` | `jpg` |
| `image/svg+xml` | `svg` |
| `image/webp` | `webp` |

For the `image` case the MIME comes from the top-level `image.fileType` field. For the
`animations` case it comes from each individual frame's own `fileType` field (frames within the
same animation may differ in format).

Animation subfolders collapse: the subfolder name does not appear in the
filename. Animation names are unique within an object type. `frame3` is the
zero-based frame index zero-padded to 3 digits (`000`, `001`, …).

**Absent vs. unmapped `fileType` — two different cases (#68):**

- **Absent `fileType`.** C3 releases **before r402** serialize image nodes with
  no `fileType` (MIME) field at all — the on-disk file is still a real image,
  e.g. `bullet-default-000.png`. The pin is exact: diffing the editor's own
  serializer across `editor.construct.net/r{397…407}/projectResources.js`
  shows `fileType` first emitted at **r402**, and no `r401.x` sub-release
  exists. (Note `exportFormat`/`exportQuality` are **not** the older
  alternative — current C3 writes all three side by side, so their presence
  says nothing about a file's age.) This absent case is **not** treated as
  malformed: `ext` on the `ExpectedImage` is `undefined`, and the exported
  constant `C3_LEGACY_IMAGE_EXTENSION` (`"png"`) is what c3source assumes for
  these legacy nodes. That value is **not** a guess — C3's own project loader
  applies the identical fallback (`t.fileType ?? "image/png"`, unchanged from
  r402 through r447), so c3source is matching the editor's documented
  behaviour rather than inventing one.
- **Present but unmapped `fileType`** (e.g. `image/gif`) is still an error:
  `deriveExpectedImages`/`deriveExpectedImageNames` throw `unknown image
  fileType "..."`.

**Two APIs, two contracts, over the same absent-`fileType` case:**

- `deriveExpectedImageNames` answers *"what filename would C3 have
  written?"* — it must always answer with a concrete name, so an absent
  `fileType` renders as `<stem>.${C3_LEGACY_IMAGE_EXTENSION}` (e.g.
  `bullet-default-000.png`).
- `detectImageDrift` answers *"is anything missing or orphaned?"* — it must
  never *fabricate* a finding from that default, so it does **not** call
  `deriveExpectedImageNames`. It calls `deriveExpectedImages` directly and
  matches an entry with a known `ext` on the full filename `<stem>.<ext>`
  (exact — the #29 regression guard: a real extension mismatch still reports
  drift), but matches an entry with `ext: undefined` on its **stem** against
  the on-disk `images/` filenames: if some on-disk file shares that stem
  (whatever its actual extension), that file counts as present and no drift is
  reported; only if nothing on disk shares the stem does it fall back to
  `<stem>.${C3_LEGACY_IMAGE_EXTENSION}`, which then correctly reports as
  `missing`.

  `detectImageDrift` is strictly the **more conservative** of the two — the
  labelled default can never *manufacture* drift on its own.

**Do not read `exportFormat` as a format proxy anywhere.** It is an export
re-encoding setting (`"lossless"` / `"lossy"`), not the source MIME: a real
corpus project (`burbank`) carries `exportFormat: "lossy"` on 8,448 nodes
whose actual source format is `image/png`.

`detectManifestDrift` wraps image derivation in a try/catch, so a thrown
error (the present-but-unmapped `fileType` case above) degrades gracefully
rather than failing core drift: the `images` section is simply absent from
`ManifestDrift.sections`, and the failure is recorded in
[`ManifestDrift.degraded`](#result-types) instead of being silently
swallowed. Call `detectImageDrift` directly if you want the derivation error
to propagate instead of degrading.

**Known limits (intentionally incomplete; extensible in future releases):**

- Spritesheet/atlas packing: a sprite whose frames are packed into a single
  atlas sheet will not match the per-frame pattern.
- Collision-polygon and image-point sidecar files.

Detection is structural (field presence), not a plugin-id allowlist — robust to
third-party single-image plugins but may over-derive for unusual plugin shapes.

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
