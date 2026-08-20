---
type: reference
title: C3Project Handle
description: openProject(root) is a no-I/O-at-construction, root-bound handle over the full canonical set of C3 on-disk subfolders, wrapping the free-function finders and detectors and adding a write-through, never-invalidate manifest cache.
tags: [c3project, openproject, handle, manifest-cache]
status: stable
stale_after: 2027-08-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide-project
    resource: ../raw/docs-api-guide-project-2026-08-20.md
    title: "docs/api-guide-project.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# C3Project Handle

## `openProject(root)`

`openProject(root): C3Project` is a root-bound handle that unifies what was
previously a split API: callers no longer assemble section paths by
hardcoding strings like `"eventSheets"`/`"layouts"`, because the handle
derives all path fields from `C3_SECTION_FOLDERS`/`C3_ROOT_FILE_FOLDERS` at
construction time (issues #36, #38)[^claude-md]. `root` must already be an
absolute, resolved path to the project directory containing
`project.c3proj` — `openProject` performs no root discovery itself; finding
the root from an argument, an environment variable, or a working-directory
search is the caller's (or a higher-level tool's) job[^api-guide-project].

**Construction does no I/O.** Path fields are plain string joins; `manifest()`
reads lazily and caches on first call; `has*()` methods call `existsSync`
fresh every time they're called[^claude-md][^api-guide-project]. It is safe
to call `openProject` on a path that does not yet exist.

## Full canonical subfolder coverage

The handle covers the **full canonical set of C3 on-disk subfolders**: every
key in `C3_SECTION_FOLDERS` (event sheets, layouts, object types, families,
timelines, flowcharts, 3D models) and every key in `C3_ROOT_FILE_FOLDERS`
(scripts, sounds, music, videos, fonts, icons, files), plus the flat
`images/` folder via the exported domain-fact constant `IMAGES_FOLDER =
"images"` (cf. `TIMELINE_TRANSITIONS_FOLDER`)[^claude-md]. Every directory
gets a `*Dir` path field and a `has*()` presence check; the exact folder
name strings should be read from the mapping tables/constants themselves,
never hardcoded a second time[^api-guide-project].

## Which sections get finders

`findAll*(sub?)` finders exist only for the traversable `.json` name
sections: event sheets, layouts, object types, families, timelines,
flowcharts, and 3D models, plus scripts. Binary asset directories (images,
sounds, music, videos, fonts, icons, files) expose only a `*Dir` path field
and a `has*()` check — no `findAll*`[^claude-md][^api-guide-project].

Every finder is **graceful-empty**: it returns `[]` when the target
directory does not exist, never throwing for a missing directory[^claude-md].
Each accepts an optional `sub` parameter (default `""`) that roots the walk
at `<sectionDir>/<sub>` instead of the section directory itself, for scoping
to an organizational subfolder (e.g. `findAllEventSheets("Common")`)[^api-guide-project].

`findAllFamilies` filters `.json` via `find_all_files_path`; `findAllScripts`
selects both `.js` and `.ts` source via `isScriptSourceName` (excluding
`.d.ts` — all generated declaration files live under `ts-defs/`), then drops
any generated `.js` sharing a basename with a `.ts` sibling via
`filterAuthoredScriptPaths` — see [Layout Traversal — Script source
classification](/layout-traversal.md) for the underlying rule
(issues #73, #74)[^claude-md].

| Method | Delegates to | Filter |
|---|---|---|
| `findAllEventSheets` | `find_all_eventsheets_path` | `.json` non-editor-local |
| `findAllLayouts` | `find_all_layouts_path` | `.json` non-editor-local |
| `findAllObjectTypes` | `find_all_objectTypes_path` | `.json` non-editor-local |
| `findAllFamilies` | `find_all_section_items_path` | `.json` non-editor-local |
| `findAllTimelines` | `find_all_section_items_path` | `.json` non-editor-local |
| `findAllFlowcharts` | `find_all_section_items_path` | `.json` non-editor-local |
| `findAllModels3d` | `find_all_section_items_path` | `.json` non-editor-local |
| `findAllScripts` | `find_all_files_path` + `filterAuthoredScriptPaths` | `.js`/`.ts` authored source, `.d.ts` excluded, generated `.js` dropped |

The free functions remain exported — names, arities, and types unchanged —
and the handle stays additive; the one exception is `find_all_layouts_path`/
`find_all_objectTypes_path`'s 2.0.0 result-set narrowing (see [Layout
Traversal](/layout-traversal.md#the-2.0.0-narrowing-and-how-to-recover-the-old-behaviour)),
a behavioural change the handle's `findAllLayouts`/`findAllObjectTypes`
inherit automatically since they delegate to those same functions[^claude-md].

## Exported domain-fact constants defined here

`PROJECT_MANIFEST_FILE = "project.c3proj"` (issue #36) and `IMAGES_FOLDER`
(issue #38) are defined in this module as C3 domain facts[^claude-md].

## Drift delegation

`detectManifestDrift()` and `detectImageDrift()` delegate to the free
functions, passing the cached manifest — avoiding a second read of
`project.c3proj`. `detectStrayFiles()` delegates likewise but, unlike those
two, passes **no** manifest — it works even on a project whose
`project.c3proj` is missing or malformed[^claude-md][^api-guide-project].
`detectReferenceIntegrity(options?)` delegates the same way, passing the
project root and the cached manifest. See [Project Manifest](/project-manifest.md)
for the result types and semantics.

## The write surface

```ts
project.manifest(): C3ProjectManifest
project.writeManifest(m?: C3ProjectManifest): void
project.manifestTolerant(): ManifestReadResult
project.reloadManifest(): C3ProjectManifest
```

`writeManifest(m?)` writes `m` (or, with no argument, the already-cached
manifest) via `writeProjectManifest`, and **only after the write succeeds**
assigns `cachedManifest = m` — a **write-through, never-invalidate** cache
rule, not the more obvious write-then-drop-cache[^claude-md]. A throw during
serialization or the write itself leaves both the on-disk file and the cache
untouched, the same "a throw is not memoized" property `manifest()` already
has[^api-guide-project].

**Why write-through, not invalidate:** invalidating would force the next
`manifest()` call to re-read strictly via `readProjectManifest`. That is a
trap specifically for a document obtained *tolerantly*: writing back a
tolerantly-read, partially-repaired manifest would turn a **successful
repair** into a **crash on the very next `manifest()` call**, since the
strict re-read would hit whatever shape violations the tolerant read had
been quietly accepting. Write-through has no such trap — the cache simply
becomes whatever was actually written, valid or not[^claude-md][^api-guide-project].
See [ADR 0016](/decisions/0016-c3-source-json-serialization-form.md)
for the full rationale.

`manifestTolerant()` delegates to `readProjectManifestTolerant`, always
reading fresh from disk and touching `cachedManifest` in **neither**
direction — isolated on read *and* write. This is deliberate: caching the
tolerant read's document here would let a later `manifest()` call silently
hand back an unvalidated document instead of validating strictly, defeating
the reason the two reads are kept separate[^claude-md][^api-guide-project].

`reloadManifest()` is the cache's **one true invalidation path** — it
discards `cachedManifest` and re-reads `manifestPath` strictly. Reach for it
when something outside this handle (another tool, the C3 editor, a manual
edit) may have changed `project.c3proj` since it was last cached[^claude-md][^api-guide-project].

```ts
// Read-mutate-write, using the cache directly:
const m = project.manifest();
m.usedAddons?.[0] && (m.usedAddons[0].version = "2.0.0");
project.writeManifest(); // writes the cached m, then re-affirms the cache

// Or write an explicit document:
project.writeManifest(m); // writes m, then makes m the cached manifest
```

## Related

- [Project Manifest](/project-manifest.md) — the underlying manifest model, strict/tolerant parse, serializer, and drift result types this handle wraps.
- [Layout Traversal](/layout-traversal.md) — the finder primitives (`find_all_files_path` family) the handle's `findAll*` methods delegate to.
- [Module Architecture](/module-architecture.md) — `project` sits at the top of the module DAG, importing all six other modules.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide-project]: docs/api-guide-project.md (c3source API guide, 2026-08-20 capture)
</content>
