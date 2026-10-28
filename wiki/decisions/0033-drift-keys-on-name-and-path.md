---
type: decision-context
title: "ADR 0033 — Drift keys on name and path: repeated item names no longer depend on walk order, and are reported as an advisory ManifestDrift.duplicates"
description: diffNameMaps groups occurrences by name and emits moved only when a name occurs exactly once on each side, otherwise per-path missing/untracked, with a total sort tiebreak; a new advisory ManifestDrift.duplicates (omitted when empty, never counted by inSync) reports repeated names. Scope (section-wide for the seven name sections, per-folder for rootFileFolders.* and images) and case sensitivity are UNVALIDATED against the editor. Ships in 3.0.0, the keying as Fixed and duplicates as Added.
tags: [adr, manifest, drift, behaviour-change, domain-facts]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-28T12:00:00Z }
sources:
  - id: issue-97-101-evidence
    resource: ../../raw/issue-97-101-drift-evidence-2026-10-28.md
    title: "Issues #97 and #101 drift evidence (capture, 2026-10-28)"
    last_modified: 2026-10-28
  - id: issue-95-evidence
    resource: ../../raw/issue-95-empty-stem-evidence-2026-10-27.md
    title: "Issue #95 empty-stem editor-bundle evidence (capture, 2026-10-27)"
    last_modified: 2026-10-27
  - id: issue-101-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/101
    title: "c3source#101 — fix: diffNameMaps collapses same-named items in different folders"
---

# ADR 0033 — Drift keys on name and path: repeated item names no longer depend on walk order, and are reported as an advisory ManifestDrift.duplicates

**Status:** accepted
**Date:** 2026-10-28
**Issue:** [#101](https://github.com/GenvidTechnologies/c3source/issues/101)

Refines [ADR 0007](/decisions/0007-coordinate-bearing-returns.md) (drift entries carry both paths) and resolves the pre-existing defect that [ADR 0031](/decisions/0031-empty-stem-is-not-a-section-item.md) named and left out of scope ("`diffNameMaps` keying by name, which collapses same-named items in different folders").

## Context

`diffNameMaps` built a `Map<name, path>` for each side, so a name that appeared twice kept whichever occurrence the walk visited last. The result depended on walk order[^issue-101-upstream]:

- A name present in two folders on both sides produced a spurious `moved`: the manifest's last occurrence compared against the disk's last occurrence, which need not be the same folder.
- A real `missing` or `untracked` was hidden when the surviving occurrences happened to agree, leaving `inSync` falsely `true`.

This is observed, not hypothetical. `burbank` has `index.ts` in both `shared/economy` and `shared/utils`, and before the fix `detectManifestDrift` reported `[rootFileFolders.script] moved index.ts ["shared","economy"] → ["shared","utils"]` on a project where the file exists in both folders on both sides; after the fix the same project is `inSync`[^issue-97-101-evidence].

The previous JSDoc on `diffNameMaps` said per-category name uniqueness was a C3 invariant, which is why a map looked safe. That is only partly true. The C3 setters do reject duplicate names ("already used"), traced in the issue #95 capture[^issue-95-evidence], so an editor-saved project does not produce them in the sections traced. But hand-written trees, tool output and bad merges still can, and same-named files in different **root file folders** (scripts, general files, and so on) are legitimate: a name is unique per folder, not per category. So the invariant was neither enforced on read nor true for the file sections.

## Decision

**Option A: group occurrences by name and key the comparison on name and path.**

- `diffNameMaps` groups each side with `groupPathsByName`, keeping every occurrence. `moved` is emitted **only when a name occurs exactly once on each side** and the paths differ. Otherwise drift is per-path over sets of path keys: each manifest path with no equal disk path is `missing`, each disk path with no equal manifest path is `untracked`, and repeats of an identical path collapse.
- `sortDriftEntries` gets a total tiebreak: kind, then name, then `manifestPath`, then `diskPath`. The path tiebreaks compare path keys with plain `<`/`>`, so the order is locale-independent and no longer leans on Map insertion order.
- **A new advisory `ManifestDrift.duplicates?: DuplicateName[]`.** Each `DuplicateName` carries `section`, `folder`, `name`, and every declared (`manifestPaths`) and on-disk (`diskPaths`) occurrence, sorted by path key. It is omitted when empty and never counted by `inSync`, the same convention as `degraded?` and `strays?`. It is ordered by the walk order of sections, then by name.
- **Scope.** Section-wide for the seven name sections: more than one occurrence of the name anywhere in the section, on either side, whatever folder. Per-folder for `rootFileFolders.*` and `images`: two occurrences of the name at the same path. The same file name in different folders is legitimate there and not reported.
- **Case-sensitive.** `A.json` and `a.json` are different names.

**UNVALIDATED.** The uniqueness scope per section and the case sensitivity were inferred from the traced setters and the shape of the data, not confirmed against the editor. The scope for the seven name sections follows the traced "already used" setters; the per-folder scope for file sections follows what the corpus shows to be legitimate. Neither was tested by running the editor on a manifest that violates it. The `DuplicateName` JSDoc carries the label.

## Compromise

- **Option B: keying plus a new `DriftKind` `"duplicate"`.** Report duplicates as drift entries. Rejected for two reasons. It breaks every exhaustive `DriftKind` switch downstream (a new union member is a compile error in a `never`-checked consumer), and a duplicate is not drift: the manifest and disk can agree exactly and still repeat a name. Putting it in `sections` would also flip `inSync` for a state the fix is meant to leave in sync.
- **Option C: keying alone, multiset variant.** Compare occurrences as a multiset, so two on one side and one on the other is one `missing`/`untracked`. Rejected: it removes the walk-order dependence but leaves duplicates invisible, and it answers the unvalidated question of which of two same-named occurrences "is" the surplus one. Path-set comparison needs no such answer.
- **Option D: out of contract, document it.** State that names must be unique and leave the map. Rejected: the invariant is not true for file folders, hand-edited trees violate it, and the failure is silent (`inSync: true` on a project that has drifted).
- **A manifest-validation rule for duplicate names.** Rejected, for the reason ADR 0031 gave for an empty name: `collectManifestIssues` backs strict `parseProjectManifest`, so a rule would make `openProject` throw on a shape whose editor behaviour is unobserved, and the scope above is unvalidated. A duplicate stays a diagnostic.

**Accepted costs.** When a name repeats, `moved` is no longer reported even if one occurrence really did relocate; the same information appears as a paired `missing` and `untracked`, which is less compact but honest about which paths disagree. The unvalidated scope may report a duplicate the editor would accept (or miss one it would reject); because `duplicates` is advisory, the cost is a note, never a false `inSync`.

## Consequences

- Semver: ships in **3.0.0**, which is a major, so a behaviour change is free. Two classifications, recorded separately in the CHANGELOG:
  - **Fixed**: the keying change. A repeated name no longer yields a spurious `moved`, and a real `missing`/`untracked` is no longer hidden, so `inSync` can flip `true` to `false` (a hidden drift now shows) or `false` to `true` (a spurious `moved` goes away) for projects with repeated names. [ADR 0031](/decisions/0031-empty-stem-is-not-a-section-item.md) is the 3.0.0 breaking precedent for a behaviour-only change with no type difference.
  - **Added**: `ManifestDrift.duplicates` and the `DuplicateName` type.
- `diffNameMaps` remains exported with the same signature; only its result for repeated names changes. `scripts/api-surface.mjs` sees the added type and field, and the JSDoc moves.
- `construct3-chef` will need a duplicates policy: it consumes drift to build repair worklists, and a repeated name now arrives as per-path `missing`/`untracked` plus a `duplicates` entry rather than one arbitrary `moved`. Whether to warn, fail or ignore is the consumer's call; the library only detects.
- Follow-up, not part of this record: a live editor run on a manifest with a repeated name, to validate (or correct) the scope and case sensitivity.

## Related

- [ADR 0007 — Structured, coordinate-bearing returns over bare values](/decisions/0007-coordinate-bearing-returns.md): the drift entry shape that carries both paths.
- [ADR 0025 — Section item-hood and stray files](/decisions/0025-section-item-hood-and-stray-files.md): the advisory-not-drift convention `duplicates` follows.
- [ADR 0031 — An empty stem is not a section item](/decisions/0031-empty-stem-is-not-a-section-item.md): named this defect as out of scope; also the breaking-3.0.0 precedent.
- [ADR 0032 — The transitions container is never folder-missing](/decisions/0032-transitions-container-never-folder-missing.md): the sibling fix for #97, shipped in the same release.

[^issue-101-upstream]: c3source#101 — fix: diffNameMaps collapses same-named items in different folders
[^issue-97-101-evidence]: Issues #97 and #101 drift evidence (capture, 2026-10-28)
[^issue-95-evidence]: Issue #95 empty-stem editor-bundle evidence (capture, 2026-10-27)
