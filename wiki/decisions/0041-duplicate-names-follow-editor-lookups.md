---
type: decision-context
title: "ADR 0041 — Duplicate names follow the editor's per-section lookups: ManifestDrift.duplicates reports occurrence records per uniqueness scope"
description: DuplicateName becomes {scope, key, manifest, disk}, with DuplicateOccurrence {section, folder, name, path}. Layouts, eventSheets and objectClasses (objectTypes and families together) compare folded with normalize().toLowerCase(); timelines, flowcharts and models3d compare exactly. These six scopes are AUDITED at r495-2; rootFileFolders.* and images stay per-folder and UNVALIDATED. Drift keying stays exact. A user System is left to itemNameIssue. Breaking; ships in 4.0.0.
tags: [adr, manifest, drift, duplicates, domain-facts, api-surface, breaking]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-05T12:00:00Z }
sources:
  - id: issue-125-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/125
    title: "c3source#125 — duplicate names should follow the editor's per-section lookups"
  - id: issue-125-evidence
    resource: ../../raw/issue-125-duplicate-name-lookups-bundle-evidence-2026-11-04.md
    title: "Bundle evidence for the duplicate-name lookups at r495-2 (c3source#125)"
---

# ADR 0041 — Duplicate names follow the editor's per-section lookups: `ManifestDrift.duplicates` reports occurrence records per uniqueness scope

**Status:** accepted
**Date:** 2026-11-05
**Issue:** [#125](https://github.com/GenvidTechnologies/c3source/issues/125)

Amends [ADR 0033](/decisions/0033-drift-keys-on-name-and-path.md) (its case-sensitive rule, the UNVALIDATED label on the seven name sections, the `DuplicateName` shape and the ordering). Takes over the "uniqueness is not checked" consequence of [ADR 0040](/decisions/0040-item-name-rules-section-keyed-issue.md).

## Context

ADR 0033 made `ManifestDrift.duplicates` advisory, case-sensitive and per section. It labelled the scope and the case rule UNVALIDATED. ADR 0040 traced the object-class and layout rules at r495-2 and left uniqueness unchecked, with `detectManifestDrift`'s duplicate check unchanged for issue #125[^issue-125-upstream].

Issue #125 read the editor's duplicate-name lookup for each name section in the r495-2 bundle[^issue-125-evidence]. These are code readings, not editor runs. Three sections fold case and three compare exactly:

- Layouts and event sheets lowercase the probe, then compare it with each name through the editor's case-insensitive helper.
- Object types and families share one map. The probe is normalized and lowercased, then looked up as a key.
- Timelines, flowcharts and models3d compare each name with `===`.

The wiki read the timeline and models3d setters as case-insensitive. The capture corrects that: their case-insensitive guard compares the new name with the item's own current name. It is not the duplicate lookup.

A case-sensitive, per-section `duplicates` therefore disagrees with the editor in two ways. It misses `A` and `a` in layouts, event sheets and object classes, and it cannot report an object type and a family that share a name.

## Decision

**Option A: occurrence records per uniqueness scope.**

```ts
export interface DuplicateName {
  scope: string;
  key: string;
  manifest: DuplicateOccurrence[];
  disk: DuplicateOccurrence[];
}
export interface DuplicateOccurrence {
  section: string;
  folder: string;
  name: string;
  path: ManifestPathSegment[];
}
```

`scope` is a section key, or `"objectClasses"` for `objectTypes` and `families` together. `key` is the compared form: `name.normalize().toLowerCase()` in a folded scope, and the name itself otherwise.

| Scope | Comparison | Reach | Label |
|---|---|---|---|
| `layouts` | folded | the whole section | AUDITED at r495-2 |
| `eventSheets` | folded | the whole section | AUDITED at r495-2 |
| `objectClasses` | folded | `objectTypes` and `families` together, one map | AUDITED at r495-2 |
| `timelines`, `flowcharts`, `models3d` | exact | the whole section | AUDITED at r495-2 |
| `rootFileFolders.<cat>`, `images` | exact | the same folder only | UNVALIDATED, unchanged from ADR 0033 |

- **A repeat is tested on each side alone.** A name that occurs once in the manifest and once on disk is not a repeat. The disk side is folded the same way as the manifest side.
- **Ordering.** Records are ordered by scope, then by `key` in code point order. The name scopes come in walk order, with `objectClasses` at the position of `objectTypes`. The `rootFileFolders` scopes follow, then `images`. Inside a record, occurrences are ordered by section walk order, then path key, then name.
- **Drift keying stays exact.** `diffNameMaps` is not folded. A rename that only changes case reads as `missing` plus `untracked`, while `duplicates` folds the same names. The two differ on purpose: `moved` is a claim about one stored name, and the lookups compare stored names.
- **No stored-name transform.** The lookups compare the stored names, so the library does not apply the editor's name transforms (the layout-rule strip or the object-class normalizer) before comparing. The only change before comparing is the fold in a folded scope. A name the editor would store differently is `itemNameIssue`'s finding.
- **Claim limit.** The wording is "the editor's r495-2 name lookup treats these as one name". The library does not claim that the editor refuses, rewrites or fails to open such a project.

**Declines.**

- **A user `System` is not reported.** The built-in `System` is not in the manifest. `itemNameIssue` reports that name as reserved, so one function owns that finding.
- **`diffNameMaps` is not folded** (see above).

**Release.** The shape change is breaking, so the commit is `feat!` and the change ships in 4.0.0 together with every `[Unreleased]` entry. There is no 3.2.0.

## Compromise

- **Option B: keep the five fields and overload them (rejected).** The earlier fields were `section`, `folder`, `name`, `manifestPaths` and `diskPaths`. A scope that spans two sections would make `manifestPaths` mean two things depending on `section`. In a folded scope, `name` would be a single spelling while the paths hold several, so the names would not align with the paths.
- **Option C: one entry per member section with a `sharedWith` link (rejected).** An object type and a family with the same name would split into two entries that the reader must join. One record per scope keeps a cross-section pair together.
- **Fold all seven name sections (rejected).** It would be simple, but the bundle shows that timelines, flowcharts and models3d compare exactly. The library follows the bundle.
- **A minor release (rejected).** Removing `manifestPaths` and `diskPaths` and changing the keys breaks consumers that read the type, so a minor is not honest.

**Accepted costs.** Drift keying and duplicate detection now use different comparisons for the folded scopes. A reader must know that a case-only rename (manifest `A`, disk `a`) shows as drift but not as a duplicate, because each side holds the name once. The `rootFileFolders.*` and `images` scopes remain inferred.

## Consequences

- Breaking, `feat!`. `CHANGELOG.md` records it under `### Changed — BREAKING`. The API surface moves in `DuplicateName`, `DuplicateOccurrence` and `ManifestDrift`.
- Consumers checked for readers of `.duplicates`: `burbank`, `construct3-chef`, `c3-domain-manager` and `construct3-sample` have none. The `construct3-sample` validate script gates on `inSync`, which is unchanged.
- Local corpus: 14 distinct local C3 projects show 0 duplicates under the new rule.
- Residuals, as the capture records them: r379 and r402 were not traced, no editor was run, and the project load path was not traced. The folder-add guards call the same lookups, but whether load reaches them was not read. Folding once with `normalize().toLowerCase()` may differ from the editor's lowercase-then-compare order for some non-ASCII names.
- Follow-up: an editor run on a manifest that holds a case-only pair, to confirm or correct the reading.
- The shipped behaviour is in [Project Manifest](/project-manifest.md#duplicate-names-are-advisory), and the domain facts are in [C3 Domain Facts](/c3-domain-facts.md#item-name-uniqueness-scope).

## Related

- [ADR 0033 — Drift keys on name and path](/decisions/0033-drift-keys-on-name-and-path.md): the advisory `duplicates` field and the shape and rules this record amends.
- [ADR 0040 — Item-name rules as one section-keyed function](/decisions/0040-item-name-rules-section-keyed-issue.md): left uniqueness to issue #125, and owns the reserved `System` finding.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md): the AUDITED and UNVALIDATED labels.

[^issue-125-upstream]: c3source#125 — duplicate names should follow the editor's per-section lookups
[^issue-125-evidence]: raw/issue-125-duplicate-name-lookups-bundle-evidence-2026-11-04.md
