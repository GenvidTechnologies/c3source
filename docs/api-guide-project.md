# API Guide: C3Project Handle

Reference for `openProject` and the `C3Project` interface added in issues #36 and #38.
For the underlying manifest model and drift detection types see
[api-guide-manifest.md](api-guide-manifest.md).

- [Overview](#overview)
- [Opening a project](#opening-a-project)
- [Path fields](#path-fields)
- [Presence checks](#presence-checks)
- [Manifest access](#manifest-access)
- [File finders](#file-finders)
- [Drift detection](#drift-detection)
- [Relationship to the free functions](#relationship-to-the-free-functions)

---

## Overview

`C3Project` is a root-bound handle that unifies the previously-split API: the
free-function finders (`find_all_eventsheets_path`, `find_all_layouts_path`, …)
took a section directory; `readProjectManifest`/`detectManifestDrift` took a
project root. Callers had to assemble these paths themselves, which meant
hardcoding folder names like `"eventSheets"` or `"layouts"`.

`openProject(root)` replaces that pattern: it returns a single object whose
path fields are derived from the canonical tables `C3_SECTION_FOLDERS`,
`C3_ROOT_FILE_FOLDERS`, and the domain-fact constant `IMAGES_FOLDER`, and whose
methods delegate to the same underlying finders and detectors. The consumer never
hardcodes a section folder name.

`openProject` does **no I/O at construction** — all path fields are plain
string joins. The manifest is read lazily on the first call to `manifest()`.
It is safe to call `openProject` on a path that does not yet exist.

## Opening a project

```ts
import { openProject } from "@genvidtech/c3source";

const project = openProject("/abs/path/to/my-game");
```

`root` must be an already-resolved absolute path to the project directory
(the directory that contains `project.c3proj`). `openProject` performs no
root discovery — resolution from an explicit argument, an environment variable,
or a working-directory search is the caller's (or a higher-level tool's)
responsibility.

## Path fields

All fields are `readonly string`; they are computed once at construction.

```ts
project.root            // "/abs/path/to/my-game"
project.manifestPath    // "<root>/project.c3proj"

// C3_SECTION_FOLDERS — named JSON sections
project.eventSheetsDir  // "<root>/eventSheets"   (C3_SECTION_FOLDERS.eventSheets)
project.layoutsDir      // "<root>/layouts"        (C3_SECTION_FOLDERS.layouts)
project.objectTypesDir  // "<root>/objectTypes"    (C3_SECTION_FOLDERS.objectTypes)
project.familiesDir     // "<root>/families"       (C3_SECTION_FOLDERS.families)
project.timelinesDir    // "<root>/timelines"      (C3_SECTION_FOLDERS.timelines)
project.flowchartsDir   // "<root>/flowcharts"     (C3_SECTION_FOLDERS.flowcharts)
project.models3dDir     // "<root>/models3d"       (C3_SECTION_FOLDERS.models3d)

// C3_ROOT_FILE_FOLDERS — binary / file asset sections
project.scriptsDir      // "<root>/scripts"        (C3_ROOT_FILE_FOLDERS.script)
project.soundsDir       // "<root>/sounds"         (C3_ROOT_FILE_FOLDERS.sound)
project.musicDir        // "<root>/music"          (C3_ROOT_FILE_FOLDERS.music)
project.videosDir       // "<root>/videos"         (C3_ROOT_FILE_FOLDERS.video)
project.fontsDir        // "<root>/fonts"          (C3_ROOT_FILE_FOLDERS.font)
project.iconsDir        // "<root>/icons"          (C3_ROOT_FILE_FOLDERS.icon)
project.filesDir        // "<root>/files"          (C3_ROOT_FILE_FOLDERS.general)

// IMAGES_FOLDER — flat images directory (domain-fact constant, cf. TIMELINE_TRANSITIONS_FOLDER)
project.imagesDir       // "<root>/images"         (IMAGES_FOLDER)
```

The exact folder names come from the exported mapping tables and constants. Do
not hardcode the strings — read them from `C3_SECTION_FOLDERS`,
`C3_ROOT_FILE_FOLDERS`, or `IMAGES_FOLDER` if you need them outside the handle.

## Presence checks

```ts
// Named JSON sections
project.hasEventSheets(): boolean
project.hasLayouts(): boolean
project.hasObjectTypes(): boolean
project.hasFamilies(): boolean
project.hasTimelines(): boolean
project.hasFlowcharts(): boolean
project.hasModels3d(): boolean

// Binary / file asset sections
project.hasScripts(): boolean
project.hasSounds(): boolean
project.hasMusic(): boolean
project.hasVideos(): boolean
project.hasFonts(): boolean
project.hasIcons(): boolean
project.hasFiles(): boolean
project.hasImages(): boolean
```

Every path field has a corresponding `has*()` method. Each call evaluates
`existsSync` fresh on the corresponding path field. Results reflect current disk
state and are not cached; call them at the point you need to branch on presence.

## Manifest access

```ts
project.manifest(): C3ProjectManifest
project.writeManifest(m?: C3ProjectManifest): void
project.manifestTolerant(): ManifestReadResult
project.reloadManifest(): C3ProjectManifest
```

`manifest()` reads and parses `project.c3proj` on the first call, then returns
the same cached instance on every subsequent call. Throws on I/O or parse
failure (same as `readProjectManifest`).

```ts
const m = project.manifest();
console.log(m.name);             // "my-game"
console.log(m.savedWithRelease); // e.g. 48700
console.log(m.layouts.items);    // ["Main", "Battle", …]
```

**The cache rule: write-through, never invalidate.** `writeManifest(m?)`
writes `m` (or, called with no argument, the manifest `manifest()` already
has cached) via `writeProjectManifest`, and only *after* the write has
actually succeeded does it become the handle's cached manifest:

```ts
// Read-mutate-write, using the cache directly:
const m = project.manifest();
m.usedAddons?.[0] && (m.usedAddons[0].version = "2.0.0");
project.writeManifest(); // writes the cached m, then re-affirms the cache

// Or write an explicit document:
project.writeManifest(m); // writes m, then makes m the cached manifest
```

A throw during serialization or the write itself leaves both the on-disk file
and the cache untouched — the same "a throw is not memoized" property
`manifest()` already has. Like `serializeProjectManifest`/`writeProjectManifest`,
`writeManifest` does **not** validate — see [api-guide-manifest.md —
Serialization & writing](api-guide-manifest.md#serialization--writing) for the
validate-first recipe and the dual-writer (close-the-C3-editor) hazard.

The handle deliberately does **not** invalidate its cache on a successful
write. The seemingly more obvious rule — write, then drop the cache so the
next `manifest()` re-reads fresh — is a trap for a document obtained
*tolerantly*: invalidating would force that next read to go through
`readProjectManifest` **strictly**, so writing back a tolerantly-read,
partially-repaired manifest would turn a successful repair into a crash on the
very next `manifest()` call. Write-through avoids this: the cache simply
becomes whatever was actually written, valid or not. See [ADR
0016](decisions/0016-c3-source-json-serialization-form.md) for the full
rationale.

`manifestTolerant()` delegates to `readProjectManifestTolerant` and is
**cache-isolated in both directions** — it always reads fresh from disk and
never populates or consumes `manifest()`'s cache. This is deliberate: caching
the tolerant read's document here would let a later `manifest()` call
silently hand back an unvalidated document instead of validating strictly,
defeating the reason the two reads are kept separate. See
[api-guide-manifest.md — Parsing](api-guide-manifest.md#parsing) for
`ManifestReadResult`'s shape.

`reloadManifest()` is the cache's one true invalidation path: it discards
whatever is cached and re-reads `manifestPath` strictly via
`readProjectManifest`, caching and returning the fresh result. Reach for it
when something outside this handle — another tool, the C3 editor, a manual
edit — may have changed `project.c3proj` since it was last cached.

## File finders

Finders exist for the traversable `.json` name sections. Binary asset directories
(images, sounds, music, videos, fonts, icons, files) expose a path field and a
`has*()` check only — no `findAll*`.

```ts
project.findAllEventSheets(sub?: string): string[]
project.findAllLayouts(sub?: string): string[]
project.findAllObjectTypes(sub?: string): string[]
project.findAllFamilies(sub?: string): string[]
project.findAllTimelines(sub?: string): string[]
project.findAllFlowcharts(sub?: string): string[]
project.findAllModels3d(sub?: string): string[]
project.findAllScripts(sub?: string): string[]
```

Each method returns absolute paths to source files under the corresponding
section directory (or a subdirectory of it when `sub` is given). All return
`[]` when the target directory does not exist — they never throw for a missing
directory.

**`sub` parameter** (default `""`): when provided, the walk is rooted at
`<sectionDir>/<sub>` instead of the section directory itself. Useful for
scoping to an organizational subfolder:

```ts
// All event sheets:
project.findAllEventSheets();

// Only those under eventSheets/Common/:
project.findAllEventSheets("Common");

// All object types under objectTypes/tiles/:
project.findAllObjectTypes("tiles");

// All timelines:
project.findAllTimelines();
```

**Delegation and filtering:**

| Method | Delegates to | Filter |
|--------|-------------|--------|
| `findAllEventSheets` | `find_all_eventsheets_path` | `.json` non-editor-local files |
| `findAllLayouts` | `find_all_layouts_path` | non-editor-local files (all extensions) |
| `findAllObjectTypes` | `find_all_objectTypes_path` | non-editor-local files (all extensions) |
| `findAllFamilies` | `find_all_files_path` | `.json` non-editor-local files |
| `findAllTimelines` | `find_all_files_path` | `.json` non-editor-local files |
| `findAllFlowcharts` | `find_all_files_path` | `.json` non-editor-local files |
| `findAllModels3d` | `find_all_files_path` | `.json` non-editor-local files |
| `findAllScripts` | `find_all_files_path` | `.ts` source files only — excludes `.d.ts` declaration files (all of which live under `ts-defs/`) |

`findAllScripts` returns only `.ts` source files. The generated `ts-defs/`
subtree that C3 writes for TypeScript projects contains only `.d.ts` files, so
filtering to `.ts` naturally excludes it without requiring a directory-name
exclusion.

## Drift detection

```ts
project.detectManifestDrift(): ManifestDrift
project.detectImageDrift(): SectionDrift | null
```

These delegate to the free functions `detectManifestDrift` and `detectImageDrift`
with the project root. `detectManifestDrift` on the handle passes the cached
manifest (from `manifest()`) to avoid re-reading `project.c3proj`. For the
result types and semantics see [api-guide-manifest.md — Drift detection](api-guide-manifest.md#drift-detection).

```ts
const drift = project.detectManifestDrift();
if (drift.inSync) {
  console.log("Manifest matches disk.");
} else {
  for (const section of drift.sections) {
    for (const e of section.entries) {
      console.warn(`[${section.section}] ${e.kind}: ${e.name}`);
    }
  }
}

const imageDrift = project.detectImageDrift();
if (imageDrift) {
  console.log(imageDrift.entries);
}
```

## Relationship to the free functions

`openProject`/`C3Project` is additive. The free functions —
`find_all_eventsheets_path`, `find_all_layouts_path`, `find_all_objectTypes_path`,
`find_all_files_path`, `readProjectManifest`, `detectManifestDrift`,
`detectImageDrift` — remain exported and unchanged. The handle is a thin
consumer of those same functions; it adds nothing they cannot already do.

Use the handle when you are working with a project root across multiple
operations (finders, manifest reads, drift checks). Use the free functions
directly when you have an already-constructed path and only need one operation,
or when you need to pass a pre-parsed manifest explicitly to `detectManifestDrift`.
