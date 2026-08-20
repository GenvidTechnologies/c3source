---
type: decision-context
title: "ADR 0007 — Structured, coordinate-bearing returns over bare values"
description: Primitives return structured, coordinate-bearing records (path-bearing drift entries, SID paths, signature-carrying extraction results) instead of bare values, so a consumer never has to re-walk the structure to relocate what a primitive already found.
tags: [adr, api-design, drift, sids]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0007
    resource: ../../raw/adr-0007-coordinate-bearing-returns-2026-08-20.md
    title: "ADR 0007 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0007 — Structured, coordinate-bearing returns over bare values

**Status:** accepted
**Date:** 2026-06-02
**Issue:** #21 (see also #18, #23, #24)

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0007].

## Context

Early primitives returned bare values — a flat list of SIDs, drift as flat name
lists. A consumer that then needed to *locate* an item (to edit it, or report its
position) had to re-walk the structure or re-derive the coordinate the primitive
had already computed and thrown away.

## Decision

Primitives return **structured records that carry their coordinates**.

- **Drift:** structured, path-bearing detection (#21). Each `DriftEntry` has a
  `kind` (`missing` | `untracked` | `moved` | `folder-missing` |
  `folder-untracked` | `dangling-ref`) and path-segment arrays (`manifestPath`,
  `diskPath`) that locate the item within the subfolder nesting without
  re-walking; `diffNameMaps` treats a same-name/different-path leaf as a *move*,
  not a delete + add.
- **SIDs:** `collectSidsWithPaths` returns `{sid, SidPathSegment[]}`; `walkSids`
  delivers both the sid and its structured segments; `formatSidPath` renders
  segments back to the canonical dotted/indexed string.
- **Extraction:** `ExtractedFunction` carries its `params` + `returnType`
  signature; `IncludeReference` is `includeSheet` + `jsonPath`; non-counting
  events expose `jsonPath`.

## Compromise

Bare returns are a smaller API with less allocation, but the coordinate is the
expensive thing to recompute, so returning it once beats every consumer
re-deriving it. Restructuring drift was a breaking change (`feat!:` #21). We
accepted larger return shapes and a small formatting layer (`formatSidPath`) to
render structure back to strings when a caller wants a flat form.

## Consequences

Consumers locate and edit without a second walk. Rendering choices — a dotted
path, or a semantic label at the root — stay caller-side by driving the walk
directly. This sets a returns convention that later features follow. Consumers of
the old flat 0.x drift shape had to migrate. Builds on the canonical walks of
[ADR 0005](/decisions/0005-single-canonical-traversal-walk.md).

## Related

- [ADR 0005 — One canonical recursive walk per traversal](/decisions/0005-single-canonical-traversal-walk.md) — the canonical walks these structured returns are built on.
- [Project Manifest](/project-manifest.md) — the current shape of the path-bearing `DriftEntry`/`SectionDrift` model.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — the current SID and extraction-record shapes this record established.

[^adr-0007]: ADR 0007 (docs/decisions capture, 2026-08-20)
