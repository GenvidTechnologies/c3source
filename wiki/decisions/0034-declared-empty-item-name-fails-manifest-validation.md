---
type: decision-context
title: "ADR 0034 — A declared empty item name fails manifest validation: rule name-folder-item-empty, run as a trailing pass"
description: validateProjectManifest now reports rule name-folder-item-empty for an item named "" in any of the seven name sections at any folder depth, so strict parseProjectManifest throws and the tolerant readers report it. The check is a trailing pass at the end of collectManifestIssues so issues[0] is unchanged for every input that already had an issue. Deliberately stricter than r506.3 for flowcharts. Breaking; ships in 3.0.0. Supersedes ADR 0031's "Manifest validation is unchanged" paragraph only.
tags: [adr, manifest, validation, breaking-change, domain-facts]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-29T12:00:00Z }
sources:
  - id: issue-100-evidence
    resource: ../../raw/issue-100-empty-name-live-editor-2026-10-28.md
    title: "Issue #100 live editor run on a declared empty item name (capture, 2026-10-28)"
    last_modified: 2026-10-28
  - id: issue-106-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/106
    title: "c3source#106 — manifest validation should reject an item named \"\""
---

# ADR 0034 — A declared empty item name fails manifest validation: rule `name-folder-item-empty`, run as a trailing pass

**Status:** accepted
**Date:** 2026-10-29
**Issue:** [#106](https://github.com/GenvidTechnologies/c3source/issues/106) (evidence from [#100](https://github.com/GenvidTechnologies/c3source/issues/100))

Supersedes only the "Manifest validation is unchanged" paragraph of [ADR 0031](/decisions/0031-empty-stem-is-not-a-section-item.md). Everything else in 0031 stands: a `.json` file is still a stray, and a declared `""` still reads as `missing ""` drift.

## Context

ADR 0031 left validation alone because nobody had observed the editor on a manifest declaring `""`, and a new rule would make strict parsing throw on unobserved behaviour. Issue #100 then ran the editor (r506.3) on exactly that manifest, section by section[^issue-100-evidence]. The result is written up in [C3 Domain Facts](/c3-domain-facts.md#item-hood-at-the-empty-stem-boundary):

- layouts and event sheets: the open **crashes**.
- timelines and families: the open **fails**.
- objectTypes: the project opens with no visible new item. After a save the manifest read `Text3` where `""` had been, the item's file was deleted, no `Text3.json` was written, and the project no longer opened. That the editor renamed the item on load is an inference from that disk state, and the save loss is not specific to `""`: a control copy with space-containing names (r495.2) lost its items the same way.
- flowcharts: r506.3 **loads and saves** a nameless flowchart.
- models3d: untested, because the sample has none.

The condition ADR 0031 made a precondition for a rule is therefore met for four sections, and for objectTypes the editor does not keep the name at all[^issue-106-upstream].

## Decision

**`validateProjectManifest` reports a new shape rule, `name-folder-item-empty`, for an item named `""` in any name section, at any folder depth.** The sections are the seven in `NAME_SECTIONS`: layouts, eventSheets, objectTypes, timelines, flowcharts, families and models3d. The issue's `path` is `<where>.items[<j>]` and its message reads `<where>.items[<j>] must not be an empty string`.

Effects follow from the existing structure and need no other change:

- strict `parseProjectManifest` and `readProjectManifest` throw `invalid project.c3proj: <path> must not be an empty string`;
- the tolerant readers (`parseProjectManifestTolerant`, `readProjectManifestTolerant`) report it in their `issues`;
- `openProject(root)` itself does not throw, because it reads the manifest lazily, but `C3Project.manifest()` does.

**Placement: a trailing pass.** The check is a separate helper, `collectEmptyItemNameIssues`, run as the last step of `collectManifestIssues` after `usedAddons`. It walks `NAME_SECTIONS` in array order and each tree in pre-order (a folder's own items, then its subfolders by index), descending only into well-shaped nodes: a record whose `items` is a string array, with `subfolders` walked only when it is an array. A malformed node is left to the shape rules that already report it.

The reason for the placement is the emission-order invariant. Strict parsing throws `issues[0]`, so appending the new issue last leaves `issues[0]` unchanged for every input that already had an issue; the new rule can only change the outcome for a manifest that was otherwise valid.

**Drift and item-hood are untouched.** `isSectionItemName` and `detectManifestDrift` behave as ADR 0031 decided: given such a manifest, drift still reports `missing ""` plus a stray `.json`. Test SF15 now asserts the validation issue where it used to assert none.

**Flowcharts are included on purpose.** c3source is deliberately stricter than r506.3 there. The maintainer considers a nameless flowchart a bad idea, and the bundle's flowchart name setter rejects `""` at the releases traced for ADR 0031 (r379, r402, r495; r506.3's setter was not traced), so the name setter is not a route to one there; at r506.3 one survives the load and save of a hand-written manifest. models3d is included without a live result, for uniformity across the seven sections.

## Compromise

- **Inline per-node check, rejected.** Putting the empty-string test inside the per-node shape check would be simpler, but it emits the new issue in the middle of the existing order and so can change `issues[0]` for an input that already had a different issue. That changes which error a strict caller sees. The trailing pass costs a second walk of the trees and buys an unchanged first issue.
- **Exclude flowcharts to match r506.3, rejected.** The maintainer's position is that a nameless flowchart is a bad idea, and the traced setters reject one, so mirroring the one section where the editor tolerates it would encode an editor accident as a rule. The cost is a manifest the editor opens being refused here.
- **Leave validation unchanged (ADR 0031's position), rejected.** It was defensible while the editor result was unknown. With #100 in hand the editor crashes or fails on four sections and an objectTypes save loses the item, so accepting the manifest would let a tool pass a project that cannot be opened.
- **Accepted cost.** models3d is covered without editor evidence. If the editor is later shown to accept `""` there, the rule would need narrowing in a further record.

## Consequences

- Semver: **breaking**, no type or signature change beyond the new `ManifestShapeRuleId` member. It ships in the held, untagged 3.0.0 alongside ADR 0031's change.
- Consumer impact, measured by grep on 2026-10-29: `burbank` and `c3-domain-manager` do not use the validation API; `construct3-chef` maps tolerant `issues` to rule strings with no exhaustive switch, so the new id flows through. The 14-project local corpus declares no `""` (see [C3 Domain Facts](/c3-domain-facts.md#item-hood-at-the-empty-stem-boundary)).
- The wiki states the shipped behaviour in [Project Manifest](/project-manifest.md#stray-files) and [C3 Domain Facts](/c3-domain-facts.md#item-hood-at-the-empty-stem-boundary).

## Related

- [ADR 0031 — An empty stem is not a section item](/decisions/0031-empty-stem-is-not-a-section-item.md) — the item-hood decision this record builds on; only its validation paragraph is superseded.
- [ADR 0009 — Editor strict validation](/decisions/0009-editor-strict-validation.md) — the strict/tolerant validation model the new rule plugs into.
- [Project Manifest](/project-manifest.md) — the shipped rule in context.
- [C3 Domain Facts](/c3-domain-facts.md) — the editor evidence per section.

[^issue-100-evidence]: Issue #100 live editor run on a declared empty item name (capture, 2026-10-28)
[^issue-106-upstream]: c3source#106 — manifest validation should reject an item named ""
