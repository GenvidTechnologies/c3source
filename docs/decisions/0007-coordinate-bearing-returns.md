# 0007. Structured, coordinate-bearing returns over bare values

- **Status:** accepted
- **Date:** 2026-06-02
- **Issue:** #21 (see also #18, #23, #24)

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
[ADR 0005](0005-single-canonical-traversal-walk.md).
