# 0005. One canonical recursive walk per traversal; collectors, finders, and visitors are thin consumers

- **Status:** accepted
- **Date:** 2026-05-31
- **Issue:** #10, #14, #16 (see also #19)

## Context

Traversal logic had grown parallel implementations. Three `find_all_*_path`
collectors each re-implemented the recursion, the skip rules, and the ordering;
the layer walk descended only one level; the finders and visitors each re-walked
the tree. Parallel recursion drifts on the next skip-rule fix — a change in one
copy silently diverges from the others.

## Decision

Each traversal has **one recursive owner**, and everything else is a thin
consumer.

- **Layer traversal** lives in one internal generator, `walkLayerEntries`, which
  yields a `LayerEntry` per layer (bare `name`, dotted/global-resetting
  `fullName`, root-first `ancestors`, `parent` sibling array, `index`). The walk
  is **fully recursive** through `subLayers`. `visitLayers` / `visitLayout` /
  `visitInstances` and the finder family (`findLayer`, `findLayerEntry`,
  `findLayerByName`, `findLayerEntryInLayout`) are all thin consumers — the
  finders stop on the first predicate hit.
- **File collection** is owned by the exported generic primitive
  `find_all_files_path(dir, predicate)`, the single recursive walk that owns the
  recursion, the `uistate/` skip, and the per-level `readdirSync().sort()`
  ordering. It is **exported** so downstream can discover non-source artifacts
  (e.g. generated `.dsl.txt`) through the same walk instead of maintaining a
  parallel collector that drifts on the next skip-rule fix (#16); the named
  collectors are thin wrappers over it.

The same shape recurs in the manifest walks (`walkManifestNameTree` /
`walkManifestFileTree`) and SID traversal (`walkSids`).

## Compromise

Per-consumer bespoke walks are each self-contained with no shared abstraction,
but they duplicate the recursion and invite drift. We chose one generator plus
thin consumers so skip-rule and ordering fixes land once, accepting a slightly
more abstract core (generators, `predicate` parameters) and consumers coupled to
the entry shape.

## Consequences

A skip-rule change — e.g. a new editor-local directory
([ADR 0006](0006-editor-local-classifier.md)) — is a one-place fix. New
traversals should consume the existing walk rather than add a parallel collector
(the drift #16 fixed). This generalizes the single-source principle first
established for event numbering in [ADR 0002](0002-canonical-event-numbering.md).
