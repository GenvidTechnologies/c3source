---
type: decision-context
title: "ADR 0006 — Single canonical editor-local classifier; skip C3 r487 uistate/"
description: There is one canonical definition of editor-local vs. C3 source, isEditorLocalPath backed by the EDITOR_LOCAL_EXCLUSIONS table, consumed uniformly everywhere the four former inline skip sites used to duplicate the rule.
tags: [adr, layout-traversal, editor-local]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0006
    resource: ../../raw/adr-0006-editor-local-classifier-2026-08-20.md
    title: "ADR 0006 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0006 — Single canonical editor-local classifier; skip C3 r487 uistate/

**Status:** accepted
**Date:** 2026-06-02
**Issue:** #12, #19

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0006].

## Context

Construct 3 r487+ writes `uistate/` subfolders and `*.uistate.json` files
alongside layouts, object-types, and event-sheets. Source traversal that descends
into them crashes or mis-collects editor-local state as if it were C3 source. The
skip logic had been added inline at four separate sites — the `uistate/`
directory check in `find_all_files_path` plus the `.uistate.json` suffix checks
in the three named collectors — so the definition of "editor-local" was
duplicated and could drift.

## Decision

There is **one canonical definition** of "editor-local vs C3 source":
`isEditorLocalPath(name): boolean`, backed by the
`EDITOR_LOCAL_EXCLUSIONS: {dirs, fileSuffixes}` table. All four former inline
skip sites now consume it uniformly (#19): the walk skips `uistate/`
directories and the named collectors skip `*.uistate.json` files through the same
predicate.

## Compromise

Inline checks at each site are locally obvious but scatter the rule; a single
classifier adds one layer of indirection. We chose the classifier so the next
editor-local artifact C3 introduces is a one-line addition to
`EDITOR_LOCAL_EXCLUSIONS` rather than a four-site hunt-and-patch.

## Consequences

New editor-local artifacts extend one table. Downstream code can call
`isEditorLocalPath` to filter consistently, and drift detection reuses it (disk
walks are editor-local filtered). This sits on top of
[ADR 0005](/decisions/0005-single-canonical-traversal-walk.md): the walk owns *where* it
recurses; the classifier owns *what counts as* editor-local.

`isEditorLocalPath` is a **provenance** predicate (source vs. editor-local
scratch state); a file's serialization form (tab-indented vs. minified) is
*not* a membership criterion for this table, and never has been — see [ADR
0018](/decisions/0018-brush-json-minified-source-not-editor-local.md), which
declines to widen this classifier for `*.brush.json` on exactly that
distinction.

The classifier answers provenance only. It is not a reachability policy:
`find_all_files_path`'s default descent derives from this table, but a caller
may override it per-walk ([ADR 0020](/decisions/0020-caller-controlled-walk-descent.md)).
Overriding descent disables inherited classification for that subtree.

## Related

- [ADR 0005 — One canonical recursive walk per traversal](/decisions/0005-single-canonical-traversal-walk.md) — the walk this classifier's skip rule attaches to.
- [ADR 0018 — Brush JSON is minified source, not editor-local](/decisions/0018-brush-json-minified-source-not-editor-local.md) — the case argued explicitly against widening this classifier.
- [ADR 0020 — Caller-controlled walk descent](/decisions/0020-caller-controlled-walk-descent.md) — separates reachability from this classifier's provenance answer.
- [Layout Traversal](/layout-traversal.md) — describes isEditorLocalPath and EDITOR_LOCAL_EXCLUSIONS as they stand today.

[^adr-0006]: ADR 0006 (docs/decisions capture, 2026-08-20)
