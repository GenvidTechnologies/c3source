---
type: decision-context
title: "ADR 0032 — The timelines transitions container is never reported folder-missing: drift keys the suppression on folder origin, not on the path string"
description: walkManifestFolders tags every folder with an origin (root, named, transitions-container, transparent) and diffFolderPaths never reports folder-missing for the transitions-container origin, so a project with an empty "Eases" container is no longer falsely out of sync; a user-named "transitions" folder is still reported. The new resolveManifestFolders maps a drift path back to every declaring folder. Ships in 3.0.0 as a Fixed behaviour change.
tags: [adr, manifest, drift, timelines, behaviour-change, domain-facts]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-28T12:00:00Z }
sources:
  - id: issue-97-101-evidence
    resource: ../../raw/issue-97-101-drift-evidence-2026-10-28.md
    title: "Issues #97 and #101 drift evidence (capture, 2026-10-28)"
    last_modified: 2026-10-28
  - id: issue-97-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/97
    title: "c3source#97 — fix: detectManifestDrift reports folder-missing for the nameless timelines transitions container when its directory is absent"
---

# ADR 0032 — The timelines transitions container is never reported folder-missing: drift keys the suppression on folder origin, not on the path string

**Status:** accepted
**Date:** 2026-10-28
**Issue:** [#97](https://github.com/GenvidTechnologies/c3source/issues/97)

Builds on [ADR 0008](/decisions/0008-c3-domain-fact-tables.md), which owns the timelines transitions folder as an exported domain fact (`TIMELINE_TRANSITIONS_FOLDER`), and on [ADR 0005](/decisions/0005-single-canonical-traversal-walk.md), whose one-walk-per-traversal rule the origin tag extends.

## Context

C3 always saves a nameless direct child of the `timelines` section folder: the transitions ("Eases") container. Drift maps that child to the path segment `TIMELINE_TRANSITIONS_FOLDER` (`"transitions"`), so a declared container has the drift path `["transitions"]`.

The directory behind that path is another matter. `timelines/transitions/` exists on disk only while the container holds something. With an empty container the manifest declares the folder and the disk has nothing, so `detectManifestDrift` reported `folder-missing ["transitions"]` for every project whose container was empty, and `inSync` was `false` on a project the editor had just saved[^issue-97-upstream].

The corpus agrees with the mechanism, and the correlation is perfect[^issue-97-101-evidence]. Of 24 unique manifests, 14 have an empty container and no `timelines/transitions/` directory, and 8 have a non-empty container and the directory. No manifest has an empty container with the directory present, or a non-empty one without it. (The other two have no container at all; they carry no `savedWithRelease`, so the editor did not save them.) The false report therefore hit exactly the empty-container projects, and only they.

A second shape shares the same path string. A user can name a folder `transitions` in the `timelines` section. That folder also has the drift path `["transitions"]`, and its directory is genuinely expected on disk. `construct3-chef#333` concerns manifests corrupted with exactly such a named folder, so telling the two apart is a requirement, not a nicety.

## Decision

**`walkManifestFolders`, the private walker behind every manifest folder walk, tags each folder with an origin** (`ManifestFolderOrigin`):

- `root`: the section folder itself; its own `name` is never a path segment.
- `named`: a folder with a name, contributing that name.
- `transitions-container`: a nameless direct child of the walked root, when the walk was given the unnamed segment (only the `timelines` section is). It contributes `"transitions"` and is not propagated deeper.
- `transparent`: every other nameless folder, sharing its parent's path.

`collectManifestFolderPaths` carries the origin alongside each declared folder path into `diffFolderPaths`.

**`diffFolderPaths` never reports `folder-missing` for origin `transitions-container`.** It also de-duplicates declared paths, so a path declared twice yields one entry. `folder-untracked` is untouched: an empty `transitions/` directory with no container still reports untracked, as before.

**The suppression is keyed on origin, never on the path string.** A user-NAMED folder called `transitions` has origin `named`, so it is still reported `folder-missing` when its directory is absent. A path-string test would have silenced it.

**New export `resolveManifestFolders(sectionFolder, manifestPath, section)`** maps a drift `manifestPath` back to every manifest folder that declares it, in manifest pre-order, as `ResolvedManifestFolder` records (`folder`, `parent`, `origin`). It returns `[]` when nothing matches and never picks one match for the caller. For `timelines` it returns both a named `"transitions"` folder and the nameless container, told apart by `origin`. A transparent nameless folder is returned alongside its parent. The order is pre-order, so it differs from `construct3-chef`'s level-order local `foldersAt`: `[0]` can differ between the two where a transparent folder and a direct child share a path. The same walker backs `walkManifestNameTree` and `walkManifestFileTree`, so the segment rule lives once.

## Compromise

The constraint behind every option below: the origin has to travel with each declared path, because the container and a named `transitions` folder are indistinguishable by path alone.

- **Option B: split into two lists.** Keep declared folders in one list and the container in a separate one, and diff only the first. Rejected: it changes the shape of `collectManifestFolderPaths` and every call site to carry two lists, and the second list still has to rejoin the first for `folder-untracked` (the container's path is declared, so an on-disk `transitions/` must not be reported untracked). One list with a tag per entry carries the same information with one signature.
- **Option C: post-filter in `detectManifestDrift`.** Drop `folder-missing ["transitions"]` entries from the `timelines` section after the diff. Rejected: by then the entry is only a path and a kind, so the filter would have to test the path string, and that silences a user-named `transitions` folder, the exact case `construct3-chef#333` describes. Origin is only known inside the walk.
- **Suppress by path string inside `diffFolderPaths`.** The same objection as Option C, one layer earlier.

**Accepted costs.** The suppression is a domain claim: the container's directory is absent while the container is empty. The corpus supports it (14 of 14 empty, 8 of 8 non-empty), but it is a count over local projects, not an editor trace. A container that declares items while its directory is absent is not reported `folder-missing` either, because the suppression does not look at disk state; the corpus has no such case. That is a missed `folder-missing`, not a false one; it would show as `missing` item drift for the items the container holds.

## Consequences

- Semver: ships in **3.0.0**, classified **Fixed** in the CHANGELOG. `ManifestFolderOrigin`, `ResolvedManifestFolder` and `resolveManifestFolders` are additions to the public surface; nothing is renamed or removed.
- For a project with an empty transitions container, **`inSync` flips from `false` to `true`**. A consumer that gated on `inSync` and tolerated the false report will now see a clean result; a consumer that special-cased the path will find its special case never fires.
- `construct3-chef`'s tripwire test **I310-T1** pins the old false `folder-missing` behaviour behind chef#310's local bridge `isTransitionsContainerFolderMissing`. It goes **red by design** on upgrade, which is its purpose. Chef can then retire the bridge, and may replace its local `foldersAt` with `resolveManifestFolders` (mind the pre-order versus level-order difference above).
- A project with a user-named `transitions` folder and no directory still reports `folder-missing`, so repair tools keep the signal they had.

## Related

- [ADR 0008 — C3 domain facts are exported tables](/decisions/0008-c3-domain-fact-tables.md): the transitions folder fact.
- [ADR 0005 — One canonical recursive walk per traversal](/decisions/0005-single-canonical-traversal-walk.md): why the origin lives in the walker.
- [ADR 0033 — Drift keys on name and path](/decisions/0033-drift-keys-on-name-and-path.md): the sibling fix for #101, shipped in the same release.
- [ADR 0007 — Structured, coordinate-bearing returns over bare values](/decisions/0007-coordinate-bearing-returns.md): `resolveManifestFolders` returns the live folder, its parent and its origin.

[^issue-97-upstream]: c3source#97 — fix: detectManifestDrift reports folder-missing for the nameless timelines transitions container when its directory is absent
[^issue-97-101-evidence]: Issues #97 and #101 drift evidence (capture, 2026-10-28)
