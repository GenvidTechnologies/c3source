---
type: decision-context
title: "ADR 0010 — C3Project root-bound handle; derive paths from mapping tables, no I/O at construction"
description: openProject(root) is a root-bound handle that derives every on-disk path from the C3_SECTION_FOLDERS/C3_ROOT_FILE_FOLDERS mapping tables at construction, does no I/O until asked, and wraps the free-function finders/detectors additively.
tags: [adr, c3project-handle]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0010
    resource: ../../raw/adr-0010-c3project-root-handle-2026-08-20.md
    title: "ADR 0010 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0010 — C3Project root-bound handle; derive paths from mapping tables, no I/O at construction

**Status:** accepted
**Date:** 2026-06-17
**Issue:** #36, #38

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0010].

## Context

The free-function API made callers assemble section paths by hardcoding folder
names (`"eventSheets"`, `"layouts"`, …) and thread the project root through every
call. That duplicated the on-disk folder-name knowledge across consumer code and
was easy to get wrong.

## Decision

`openProject(root): C3Project` is a **root-bound handle** that derives all path
fields from the mapping tables `C3_SECTION_FOLDERS` / `C3_ROOT_FILE_FOLDERS` at
construction. It covers the full canonical set of on-disk subfolders — event
sheets, layouts, object types, families, timelines, flowcharts, 3D models,
scripts, sounds, music, videos, fonts, icons, files — plus the flat `images/`
folder via `IMAGES_FOLDER`. Every directory gets a `*Dir` path field and a
`has*()` presence check; `findAll*(sub?)` finders exist for the traversable
`.json` name sections and are graceful-empty (return `[]` when the directory is
absent). Construction does **no I/O** — path fields are string joins, `manifest()`
reads lazily and caches, `has*()` calls `existsSync` fresh. `detectManifestDrift()`
and `detectImageDrift()` delegate to the free functions, passing the cached
manifest. The handle is purely **additive** — the free functions remain exported
and unchanged.

## Compromise

Keeping only the free functions adds no new surface, but leaves folder-name
knowledge in caller code. A stateful handle risks staleness (a cached manifest)
and a second way to do the same thing. We mitigated both — no I/O at construction
(cheap and safe to create), a lazily-cached `manifest()`, a fresh `existsSync` per
`has*()`, and unchanged free functions so the handle is strictly additive — and
chose the handle for ergonomics: folder-name knowledge now lives in the mapping
tables, not in every caller.

## Consequences

Callers stop hardcoding folder names; a new C3 subfolder is a mapping-table
addition surfaced everywhere at once. The cached `manifest()` can go stale if the
file changes mid-handle-life (re-open to refresh). Binary asset dirs expose
`*Dir` + `has*()` only, no `findAll*`. This builds on the domain-fact tables of
[ADR 0008](/decisions/0008-c3-domain-fact-tables.md) and the canonical walks of
[ADR 0005](/decisions/0005-single-canonical-traversal-walk.md).

## Related

- [ADR 0008 — C3 domain facts owned as exported tables in c3source](/decisions/0008-c3-domain-fact-tables.md) — the mapping tables this handle derives its paths from.
- [ADR 0005 — One canonical recursive walk per traversal](/decisions/0005-single-canonical-traversal-walk.md) — the canonical walks this handle's finders wrap.
- [C3Project Handle](/c3project-handle.md) — the current, fuller surface of openProject, including the later write-through manifest cache.

[^adr-0010]: ADR 0010 (docs/decisions capture, 2026-08-20)
