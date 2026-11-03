---
type: decision-context
title: "ADR 0037 — Disk walks never follow links below a walk root; skipped links are an advisory ManifestDrift.links"
description: Every project-tree walk (find_all_files_path and so every collector, walkDiskNameTree, walkDiskFileTree, collectDiskFolderPaths and the images walk) classifies entries with lstatSync, so a symbolic link or junction below the walk root is neither followed nor counted, while a walk root that is itself a link is still followed. Skipped links are reported in the advisory ManifestDrift.links, omitted when empty and never counted by inSync. Supersedes ADR 0035's consequence about an unguarded ELOOP on links.
tags: [adr, manifest, drift-detection, traversal, symbolic-links]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-03T12:00:00Z }
sources:
  - id: issue-114-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/114
    title: "c3source#114 — disk walks throw on link loops and dangling links, and import the contents of links pointing outside the project"
  - id: libuv-win-fs
    resource: https://github.com/libuv/libuv/blob/v1.51.0/src/win/fs.c
    title: "libuv v1.51.0 src/win/fs.c (scandir and lstat reparse-point handling)"
---

# ADR 0037 — Disk walks never follow links below a walk root; skipped links are an advisory `ManifestDrift.links`

**Status:** accepted
**Date:** 2026-11-03
**Issue:** [#114](https://github.com/GenvidTechnologies/c3source/issues/114)

Supersedes the Consequences bullet of [ADR 0035](/decisions/0035-file-folder-drift-walks-undeclared-subdirectories.md) that leaves a looping link unguarded. Everything else in 0035 stands.

## Context

The project-tree walks classified each directory entry with `statSync`, which follows links[^issue-114-upstream]. Three defects follow from that:

- A link loop or a dangling link below a section root makes the walk throw `ELOOP` or `ENOENT`, so `detectManifestDrift` throws.
- A link that points outside the project has its target's contents imported as section members.
- In `walkDiskNameTree`, the non-directory branch has no `isFile()` check, so a file symlink named `X.json` becomes an item.

ADR 0035 made the file-section walk enter undeclared directories, which widened the first defect to file sections. That record accepted it as "not guarded, since no known trigger exists in a C3 project".

## Decision

**A symbolic link or junction below a walk root is neither followed nor counted.** Every project-tree walk classifies entries with `lstatSync`. A link is then neither `isFile()` nor `isDirectory()`, so each walk drops it. The covered walks are:

- `find_all_files_path`, and so every `find_all_*_path` collector, `findAllAddons`, `detectReferenceIntegrity` and `C3Project.findAll*`;
- `walkDiskNameTree` and `walkDiskFileTree`;
- `collectDiskFolderPaths`;
- the images walk inside `detectImageDrift`.

`readdirSync(dir).sort()` is unchanged, so ordering is unchanged. No `try`/`catch` is added.

**Roots are still followed.** A walk root (a section root or the project directory) that is itself a link is followed and not reported. Only links below a walk root are skipped. A dangling root already reads as absent through `existsSync`.

**File symlinks are not members.** Every link is skipped, file or directory. The item branch of `walkDiskNameTree` now requires `isFile()`, so an entry named `*.json` that is not a regular file (a link, a FIFO, a socket or a device) is not an item either.

**`images/` is included.** A dangling link in `images/` no longer degrades the section, and a direct `detectImageDrift` call no longer throws.

**`readAddonPackage` is excluded.** It reads one flat addon package directory, not a project tree.

**Skipped links are reported in an advisory field.** `ManifestDrift.links?: SkippedLink[]`, with `SkippedLink` carrying `section`, `folder`, `name` and `diskPath`. The field is omitted when empty, never counted by `inSync`, and added last in the result, so existing key order is unchanged. `collectDiskFolderPaths` collects the links for the name sections and the `rootFileFolders` sections with exactly the descent rule drift already uses, so there is no extra recursion (see [ADR 0005](/decisions/0005-single-canonical-traversal-walk.md)). Editor-local names are skipped before the link test, so a link named `uistate` is not reported. When `rootFileFolders` is absent, the file sections are not walked and their links are not reported.

## Compromise

- **Option A: no-follow walks plus an advisory `links` report (recommended)** — chosen. It is the pattern in [Design Patterns](/design-patterns.md): an advisory field is additive and never a new `DriftKind`. Its failure is visible under either answer to the open C3 question below.
- **Option B: no-follow walks, silent skip.** Rejected. It is chef's precedent (its `readDiskDir` drops links) and saves about 25 lines of `src/`. But a declared item stored behind a link then reads `missing` or `folder-missing` with nothing explaining why. The repo's rule against silent drops argues against it: [ADR 0023](/decisions/0023-pre-r402-image-serialization-drift-degradation.md) made a caught image failure surface as `degraded` because silently dropping the images section was the worse outcome.
- **Option C: follow links that stay inside the project.** Rejected. It keeps following, but calls `realpathSync` on each link: skip a dangling or `ELOOP` link, skip a target outside the project, follow a target inside with a visited-realpath set. The costs:
  - The exported walks need a new containment-root parameter, because `walkDiskNameTree(diskFolder)` does not know the project directory.
  - An inside link double-counts items, which produces spurious `duplicates` and an `untracked` entry at the link path.
  - Each link costs a `realpathSync`.
  - The per-entry tolerance has to cover the Windows case where `ELOOP` appears only after several levels.
  - It assumes C3 follows inside links. If C3 does not, C counts items C3 cannot see and nothing marks them.

Rejected outright:

- **A new `DriftKind` (`"link"`).** It is a `feat!` and 4.0.0. It breaks exhaustive switches and flips `inSync`, and construct3-chef's `applyNameDrift` has no `default`. [ADR 0025](/decisions/0025-section-item-hood-and-stray-files.md) rejected `"stray"` on the same grounds.
- **Dirent types (`withFileTypes`).** On Windows, libuv `scandir` sets `UV__DT_LINK` for every `FILE_ATTRIBUTE_REPARSE_POINT`. `lstat` reports `S_IFLNK` only for a symlink, a mount point (junction) or an AppExecLink tag, and treats any other reparse tag as a followed stat[^libuv-win-fs]. A project in a folder that exposes non-link reparse points would have files dropped wholesale. It would also need a new comparator for every sort.
- **Catching `ELOOP`/`ENOENT` per entry while keeping `statSync`.** It does not meet the requirement to exclude outside content, because a link that points outside the project resolves fine.
- **An opt-in option on the exported walks, defaulting to follow.** It mirrors ADR 0035 and avoids a semver question. But `find_all_section_items_path` (follow) and `detectStrayFiles` (skip) would then disagree, which breaks ADR 0025's partition, and the throw stays in place for every non-drift caller.

**Semver.** This ships as a minor (3.2.0) by maintainer decision. The conservative reading is 4.0.0: direct callers of `find_all_files_path` and the other walks see different results on a tree that holds a valid link, and ADR 0025 treated a finder narrowing as breaking. The minor call rests on three facts:

- a following walk throws by construction on a loop or a dangling link;
- the local corpus has 0 links in section folders (see Evidence);
- the only external code caller of these walks that was found walks a chef-generated directory, not a project tree.

## Evidence

Corpus scan: **0 links in 58,786 entries** under the section folders of 35 local `project.c3proj` copies (about 14 distinct projects). Positive control: the same scanner, run without the section restriction, found 1,334 links (burbank's pnpm `node_modules`).

Behaviour on real data: a copy of `src/` with the `lstatSync` swap gave byte-identical `detectManifestDrift` JSON on all 35 manifests (35/35). Control: a seeded tree holding a file symlink was reported as different.

Why `lstat` and not Dirent: libuv v1.51.0 `src/win/fs.c`, the libuv of Node 24.11.1[^libuv-win-fs]. `scandir` and `lstat` disagree on non-link reparse points, as described under Compromise. Not measured: no cloud-file placeholder was available to observe, so the case rests on the libuv source.

Ordering: on Windows (NTFS), `readdirSync` over `Zebra.png`, `apple.png` and `banana.png` returned `["apple.png", "banana.png", "Zebra.png"]`, a case-insensitive order, while `.sort()` gives `["Zebra.png", "apple.png", "banana.png"]` (measured in review). The images list of `links` therefore sorts its names like every other walk level. A test with the names `apple` and `Zebra` fails without the sort.

Downstream callers, searched across the organisation's code: no consumer calls `walkDiskNameTree` or `walkDiskFileTree`. `find_all_files_path` is called once, in construct3-chef's navigation graph, on a chef-generated directory of `.dsl.txt` files.

## Consequences

- **Whether C3 itself follows a user-made link below a section folder on load is UNVALIDATED.** No source in the repo settles it. An editor experiment, or Chromium's File System Access directory enumeration, could. If C3 does follow such links, an item stored behind a link reads `missing` or `folder-missing`, and `links` shows why.
- Direct callers of `find_all_files_path`, the `find_all_*_path` collectors, `walkDiskNameTree`, `walkDiskFileTree` and `C3Project.findAll*` no longer receive the contents of a link on a tree that holds one.
- construct3-chef's test `I358-R4`, which pins today's `ELOOP`, turns red on the bump. Chef's ADR 0066 and its 3.1.0 ledger entry need chef-side updates, and chef may drop its workaround that hides `rootFileFolders` from the drift view.
- The consequence in ADR 0035 about an unguarded `ELOOP` on links no longer holds.
- ADRs 0005, 0023 and 0025 are unchanged: one rule still lands in each walk, and `detectStrayFiles` and `find_all_section_items_path` still partition the same files.

## Related

- [ADR 0035 — File-folder drift walks undeclared subdirectories](/decisions/0035-file-folder-drift-walks-undeclared-subdirectories.md) — its unguarded-`ELOOP` consequence is superseded here.
- [ADR 0005 — One canonical recursive walk per traversal](/decisions/0005-single-canonical-traversal-walk.md) — the single-owner rule the change keeps.
- [ADR 0025 — Section item-hood and stray files](/decisions/0025-section-item-hood-and-stray-files.md) — the partition and the finder-narrowing precedent.
- [ADR 0023 — Pre-r402 image serialization and drift degradation](/decisions/0023-pre-r402-image-serialization-drift-degradation.md) — the rule against silent drops.
- [Project Manifest](/project-manifest.md#links-are-not-followed) and [Layout Traversal](/layout-traversal.md) — the shipped behaviour.

[^issue-114-upstream]: c3source#114 — disk walks throw on link loops and dangling links, and import the contents of links pointing outside the project
[^libuv-win-fs]: libuv v1.51.0 src/win/fs.c — scandir and lstat reparse-point handling
