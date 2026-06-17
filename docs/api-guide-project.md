# API Guide: C3Project Handle

Reference for `openProject` and the `C3Project` interface added in issue #36.
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
path fields are derived from the canonical tables `C3_SECTION_FOLDERS` and
`C3_ROOT_FILE_FOLDERS`, and whose methods delegate to the same underlying
finders and detectors. The consumer never hardcodes a section folder name.

`openProject` does **no I/O at construction** — all path fields are plain
string joins. The manifest is read lazily on the first call to `manifest()`.
It is safe to call `openProject` on a path that does not yet exist.

## Opening a project

```ts
import { openProject } from "@genvid/c3source";

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
project.eventSheetsDir  // "<root>/eventSheets"   (C3_SECTION_FOLDERS.eventSheets)
project.layoutsDir      // "<root>/layouts"        (C3_SECTION_FOLDERS.layouts)
project.objectTypesDir  // "<root>/objectTypes"    (C3_SECTION_FOLDERS.objectTypes)
project.familiesDir     // "<root>/families"       (C3_SECTION_FOLDERS.families)
project.scriptsDir      // "<root>/scripts"        (C3_ROOT_FILE_FOLDERS.script)
```

The exact folder names come from the exported mapping tables. Do not hardcode
the strings — read them from `C3_SECTION_FOLDERS` / `C3_ROOT_FILE_FOLDERS` if
you need them outside the handle.

## Presence checks

```ts
project.hasEventSheets(): boolean
project.hasLayouts(): boolean
project.hasObjectTypes(): boolean
project.hasFamilies(): boolean
project.hasScripts(): boolean
```

Each call evaluates `existsSync` fresh on the corresponding path field. Results
reflect current disk state and are not cached; call them at the point you need
to branch on presence.

## Manifest access

```ts
project.manifest(): C3ProjectManifest
```

Reads and parses `project.c3proj` on the first call, then returns the same
cached instance on every subsequent call. Throws on I/O or parse failure (same
as `readProjectManifest`).

```ts
const m = project.manifest();
console.log(m.name);             // "my-game"
console.log(m.savedWithRelease); // e.g. 48700
console.log(m.layouts.items);    // ["Main", "Battle", …]
```

## File finders

```ts
project.findAllEventSheets(sub?: string): string[]
project.findAllLayouts(sub?: string): string[]
project.findAllObjectTypes(sub?: string): string[]
project.findAllFamilies(sub?: string): string[]
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
```

**Delegation and filtering:**

| Method | Delegates to | Filter |
|--------|-------------|--------|
| `findAllEventSheets` | `find_all_eventsheets_path` | `.json` non-editor-local files |
| `findAllLayouts` | `find_all_layouts_path` | non-editor-local files (all extensions) |
| `findAllObjectTypes` | `find_all_objectTypes_path` | non-editor-local files (all extensions) |
| `findAllFamilies` | `find_all_files_path` | `.json` non-editor-local files |
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
