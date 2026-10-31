---
type: decision-context
title: "ADR 0035 — File-folder drift walks undeclared subdirectories and reports folder entries; walkDiskFileTree keeps declared-only as its default"
description: detectManifestDrift walks every non-editor-local subdirectory of a rootFileFolders category and emits folder-missing / folder-untracked for file sections, so a file moved into an undeclared subfolder reads as moved rather than missing. walkDiskFileTree gains an opt-in walkUndeclared option and keeps declared-only descent as its default, so the change is a non-breaking minor. Partially supersedes ADR 0020's remark that ts-defs/ is invisible to drift by a second mechanism.
tags: [adr, manifest, drift-detection, traversal]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-31T12:00:00Z }
sources:
  - id: issue-110-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/110
    title: "c3source#110 — file-section drift ignores undeclared subfolders and emits no folder entries"
---

# ADR 0035 — File-folder drift walks undeclared subdirectories and reports folder entries; `walkDiskFileTree` keeps declared-only as its default

**Status:** accepted
**Date:** 2026-10-31
**Issue:** [#110](https://github.com/GenvidTechnologies/c3source/issues/110)

Partially supersedes [ADR 0020](/decisions/0020-caller-controlled-walk-descent.md): only its remark that `ts-defs/` was invisible to drift "by a second, independent mechanism" (declared-only descent). Everything else in 0020 stands.

## Context

Issue #110 collected three probes from construct3-chef against 3.0.0[^issue-110-upstream]:

- **P1** a file moved from `files/` into a new, undeclared `files/sub/` read as `missing`, not `moved`, and the file under `sub/` was invisible;
- **P2** the same move into an already-declared `sub/` read as `moved`, correctly;
- **P3** `x.txt` declared in `a/` and `b/`, on disk in `a/` and a new `c/`, read as `missing` in `b/` only: `c/x.txt` was never seen.

The issue also noted that a new file in an undeclared subfolder was not reported at all, and that file sections emitted no `folder-missing` / `folder-untracked` entries, though the name sections do.

The undeclared-subfolder blind spot traces to one rule. File-folder disk walks (`walkDiskFileTree`) recursed only into subfolders the manifest declares (see [Design Patterns](/design-patterns.md#declared-subfolder-recursion-for-file-folder-walks)). That rule existed so a new C3-generated subtree under a file folder, such as `scripts/ts-defs/`, never produced drift noise. But a user's own undeclared subfolder is indistinguishable from it by that rule, and the cost fell on real edits.

## Decision

**Drift walks every non-editor-local subdirectory of a file folder, and `isEditorLocalPath` is the sole exclusion for file-folder drift.** `detectManifestDrift` calls `walkDiskFileTree` with `walkUndeclared: true` for each `rootFileFolders.<category>` section and diffs folder paths with the same `diffFolderPaths` the name sections use, so file sections now emit `folder-missing` and `folder-untracked`. A file moved into a new subfolder reads as `moved`, accompanied by `folder-untracked`.

**`walkDiskFileTree` keeps declared-only descent as its default.** Its signature is `walkDiskFileTree(diskFolder, declaredSubfolders, basePath = [], options?: { walkUndeclared?: boolean })`. With the option unset, behaviour is unchanged; with `walkUndeclared: true` it recurses into every directory that is not `isEditorLocalPath`. No options type is exported.

## Compromise

- **Opt-in option, chosen.** Add an options argument defaulting to the declared-only behaviour; `detectManifestDrift` passes the opt-in. It does not break existing callers, so it ships as a minor feat (3.1.0). It is implemented as the boolean `walkUndeclared` rather than a string enum, since there are only two modes.
- **Change the default, rejected.** `walkDiskFileTree` always walks every non-editor-local subdirectory. Simpler API, but a breaking change: `feat!` and 4.0.0, days after 3.0.0.
- **Keep declared-only for drift, rejected.** It is the rule that produced the wrong `missing` in P1 and the unseen `c/x.txt` in P3.

## Evidence

Corpus measurement, 2026-10-31: a scan of the 38 local `project.c3proj` copies under `C:\repos` (about 14 distinct projects, since most are duplicates) found **0** undeclared non-editor-local subdirectories and **0** declared-but-absent subdirectories under any file-folder root. Positive control: burbank declares 22 `scripts/` and 2 `files/` subfolders, and all are present on disk. So the corpus holds no case where the new walk would add noise.

Blast radius: no known consumer (burbank, construct3-chef, c3-domain-manager) calls `walkDiskFileTree` directly, and construct3-chef's sync skips `rootFileFolders.*` drift sections.

## Consequences

- A future C3-generated subtree under a file folder now surfaces as drift until its name is added to `EDITOR_LOCAL_EXCLUSIONS`. That table becomes the single place to fix it.
- A declared but empty file subfolder in a git checkout (git cannot hold empty directories) reads `folder-missing`, as the name sections already do.
- Semver: non-breaking, minor.
- The wiki states the shipped behaviour in [Project Manifest](/project-manifest.md#drift-detection).

## Related

- [ADR 0020 — Editor-local classification does not imply walk unreachability](/decisions/0020-caller-controlled-walk-descent.md) — partially superseded, see above.
- [ADR 0006 — Single canonical editor-local classifier](/decisions/0006-editor-local-classifier.md) — the classifier that is now the only exclusion.
- [Design Patterns](/design-patterns.md) — the declared-subfolder pattern, now the function default only.
- [Project Manifest](/project-manifest.md) — drift detection in context.

[^issue-110-upstream]: c3source#110 — file-section drift ignores undeclared subfolders and emits no folder entries
