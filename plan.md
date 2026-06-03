# Plan: Issue 28 — timelines `transitions/` unnamed subfolder

**Branch:** `fix/timeline-transitions-unnamed-subfolder`
**Issue:** genvid-holdings/c3source#28 (companion: construct3-chef#62)

## Problem

C3 serializes the on-disk `timelines/transitions/` directory ("Eases" in the editor)
as an **unnamed** subfolder under `timelines` in `project.c3proj` (no `name` key).
`detectManifestDrift`'s manifest-side walks treat a nameless subfolder as contributing
*no* path segment, while the disk walk yields `transitions` as a real directory segment.
The two sides disagree → false `moved` / `folder-untracked` / `folder-missing` drift, which
downstream `sync-project` "fixes" by appending a `"name":"transitions"` folder — duplicating
items and corrupting `project.c3proj`.

c3source has no manifest writer; its responsibility here is drift **detection** only.
Removing the false drift removes the trigger for the corrupting sync.

## Fix

Keep the in-memory model faithful (unnamed subfolder stays unnamed → round-trip stable).
Teach only the drift walks the timelines exception:

- `export const TIMELINE_TRANSITIONS_FOLDER = "transitions";` — the C3 domain fact, owned here.
- `walkManifestNameTree` and `collectManifestFolderPaths` gain an optional `unnamedSubfolderName?`
  param. A nameless subfolder uses `sub.name ?? unnamedSubfolderName`. The param is **not**
  propagated into recursion → applies to direct children of the section root only (matches C3:
  the transitions container is always a top-level child).
- `detectManifestDrift` passes `TIMELINE_TRANSITIONS_FOLDER` only for `section === "timelines"`.

## Tasks (each commit green)

- [x] Setup: stash issue-29 fixtures (JPEGTileBackground.json, jpegtilebackground.jpg,
      LevelMaps.json) → `git stash@{0}`; revert their two `project.c3proj` lines. Working tree
      holds only timelines fixtures.
- [ ] Prep commit: this `plan.md`.
- [ ] Fix commit `fix: model timelines/transitions as unnamed subfolder in drift detection (#28)`:
  - `src/c3source.ts`: constant + 2 walk params + detector wiring + doc-comment fixes.
  - Timelines fixtures: `transitions/`, `Real subfolder/`, timelines hunk of `project.c3proj`.
  - Tests: update R-C4 names, R-C16/F1-7 comments; add with-param mapping test
    (`["transitions"]` / `["transitions","Other Eases"]`), clean-fixture `inSync`, no false
    timelines drift.
  - CLAUDE.md sentence on the exception.
- [ ] Chore commit `chore: rename test fixture sample-project → c3source-fixture`:
  - Filesystem-move the dir; update `name` in `project.c3proj` + `project.uistate.json`;
    update 5 test files + README. Watch skipped-test count (fixtureExists-gated).
- [ ] Gates: validator after fix + after rename; code-reviewer at end; tech-writer if flagged.
- [ ] PR: remove `plan.md`.

## Issue-29 recovery

`git stash@{0}` holds the image fixtures. After this branch renames the fixture, recovery for
issue 29 = `git stash pop`, then `git mv` the 3 files from `sample-project/` into
`c3source-fixture/`, and re-add `JPEGTileBackground` to `objectTypes.tiles.items` and
`LevelMaps` to `families.items` in `project.c3proj`.
