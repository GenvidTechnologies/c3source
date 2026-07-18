# 0006. Single canonical editor-local classifier; skip C3 r487 `uistate/`

- **Status:** accepted
- **Date:** 2026-06-02
- **Issue:** #12, #19

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
[ADR 0005](0005-single-canonical-traversal-walk.md): the walk owns *where* it
recurses; the classifier owns *what counts as* editor-local.
