---
type: decision-context
title: "ADR 0038 — BUNDLE-PREDICTED file-entry types: the flat EXTENSION_FILE_TYPES grows by every single-registration registry extension"
description: The flat EXTENSION_FILE_TYPES gains the 45 extensions that the editor's MIME registry types exactly once and that had no flat row; .ogv and .mov join it at UNVALIDATED and the other 43 take a new tier label, BUNDLE-PREDICTED, for a value read from the bundle with no editor save behind it. SECTION_EXTENSION_FILE_TYPES keeps only video .webm. Lifts ADR 0036's freeze of the flat table and records that the editor keeps a registered stored type on load. Amends ADR 0022, 0027 and 0036.
tags: [adr, domain-facts, manifest, mime, audit-labels]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-04T12:00:00Z }
sources:
  - id: issue-115-registry-capture
    resource: ../../raw/issue-115-mime-registry-r506-3-and-type-paths-2026-11-04.md
    title: "Issue #115 editor MIME registry at r506-3 and the paths that set a file entry's type (capture, 2026-11-04)"
    last_modified: 2026-11-04
  - id: issue-115
    resource: https://github.com/GenvidTechnologies/c3source/issues/115
    title: "c3source#115 — close the file-entry type fallback gap for single-registration registry extensions"
---

# ADR 0038 — BUNDLE-PREDICTED file-entry types: the flat `EXTENSION_FILE_TYPES` grows by every single-registration registry extension

**Status:** accepted
**Date:** 2026-11-04
**Issue:** [#115](https://github.com/GenvidTechnologies/c3source/issues/115)

Amends [ADR 0036](/decisions/0036-section-aware-file-entry-type-and-info-keys.md) (the freeze of the flat table, the `.ogv` and `.mov` section rows, and the fallback gap), [ADR 0027](/decisions/0027-file-entry-type-writer-fact.md) (its two tiers) and [ADR 0022](/decisions/0022-domain-fact-audit-convention.md) (its label vocabulary).

## Context

`fileTypeForName` and `fileTypeForSection` return `application/octet-stream` for an extension that has no flat row. [ADR 0036](/decisions/0036-section-aware-file-entry-type-and-info-keys.md) named this a gap and froze the flat table for #113, so extensions such as `.avi` or `.wav` resolved to the fallback although the editor would record a `video/*` or `audio/*` type for them.

The editor takes a file entry's `type` from a MIME registry looked up by extension. The capture `raw/issue-115-mime-registry-r506-3-and-type-paths-2026-11-04.md` reads that registry at r506-3, r495 and r509 and traces the paths that set an entry's type[^issue-115-registry-capture]:

- The r506-3 registry holds 53 registrations that give 63 distinct extensions. 60 of the 63 map to one type. Three, `.js`, `.ts` and `.webm`, have several registrations [bundle r506-3].
- Of the 60, 15 already had a flat row, each equal to its single registration. 45 had no flat row. Those 45 are the 43 at r495 plus `.fbx` and `.obj`, which the r495 registry lacks [bundle r495] [bundle r506-3].
- r495 is an exact prefix of r506-3 by type and extension. r509 adds one more registration, `.mtl`, and keeps the first 53 equal by type and extension [bundle r509]. `.mtl` is not part of this decision.
- For an extension with one registration, the lookup returns that registration whatever the section hint, the browser `File.type` or the entry path [bundle r495].

The tiers of [ADR 0027](/decisions/0027-file-entry-type-writer-fact.md) count editor saves: AUDITED for two or more, UNVALIDATED for one. None of the 43 extensions without a save fits either tier, and ADR 0027 said the table would use "the existing ADR 0022 labels and no new ones".

## Decision

**Grow the flat `EXTENSION_FILE_TYPES` by the 45 extensions, and add one tier label.** The table then has a row for every extension the r506-3 registry registers, 65 rows in all. Every earlier row is unchanged.

- **`.ogv` and `.mov` become flat rows, tier UNVALIDATED.** Each was recorded once by the editor save of #113, in the `video` section. This table counts saves of an extension in any section, as it does for `.jpeg` and `.mp4`. The values are `video/ogg` and `video/quicktime`.
- **The other 43 become flat rows, tier BUNDLE-PREDICTED.** Each value equals the extension's single registration exactly. Two of them, `.fbx` and `.obj`, are tagged `[bundle r506-3]` only. The first release that registers them was not bisected.
- **`SECTION_EXTENSION_FILE_TYPES` holds only `video` `.webm`.** The `.ogv` and `.mov` section cells are removed. Both are byte-equal to the new flat rows, so `fileTypeForSection` returns the same strings. The table is unreleased, so the removal costs no semver. A section row now exists only where the type differs by section, which today is `.webm` alone.
- **The freeze of the flat table is lifted.** ADR 0036 froze it for #113 and said growing it "is a separate decision, because it changes `fileTypeForName` output for every caller". This record is that decision. The fallback gap in `fileTypeForSection` closes with it for these 45 extensions.

### The tier label

**Name: `BUNDLE-PREDICTED`.** It carries two facts. The evidence channel is the editor bundle, one of the channels [ADR 0022](/decisions/0022-domain-fact-audit-convention.md) names. The status is a prediction, not an observation. The repo already says "the bundle predicts" for the rescan admission of `.mpg` and `.avi` ([ADR 0036](/decisions/0036-section-aware-file-entry-type-and-info-keys.md)). The name is one hyphenated token, so emphasis markers and line wraps cannot split it.

**Definition.** **BUNDLE-PREDICTED** marks a value that the editor bundle's own code returns for the key, read at the named releases. No editor-saved project and no editor experiment has recorded it.

**Admission condition.** The bundle code must fix the value with no input that the reading cannot see. No section hint, browser `File.type`, user setting or project data may change it. For `EXTENSION_FILE_TYPES` this means an extension with exactly one registry entry. An extension with several registrations never takes the label, because the section hint chooses among them and the hint is an input a bundle reading does not fix.

**Promotion.** A row moves to UNVALIDATED at the first editor save that records its value, and to AUDITED at a second independent one. A save that records a different value shows the reading was wrong. The row is then fixed and the save recorded in a new capture.

**Relation to the ADR 0022 labels.**

- **AUDITED and UNVALIDATED.** BUNDLE-PREDICTED sits below both on the observation axis, with zero saves, but it carries mechanism evidence that they lack.
- **NOT CORPUS-AUDITABLE.** A different label. Such rows can never be checked against the corpus, and the label must name the source that would check them. A BUNDLE-PREDICTED row can be checked by the corpus and by an editor save. Nothing has observed it yet, but nothing prevents it.
- **KNOWN INCOMPLETE.** It stays a label on the whole table, independent of the row tiers. Its reason changes: the registry grows between releases, and r509 adds `.mtl`.

**Scope.** The label applies where a table's tiers are defined by observation counts, as ADR 0027 defines them. Other tables already apply AUDITED to a value checked against the editor bundle, for example `SCRIPT_FILE_TYPE_EXTENSIONS`, whose JSDoc says it "matches C3's own editor bundle". They are not relabelled, and that inconsistency is left alone.

**Evidence tag: `[bundle r506-3]`.** The segment is the release's URL path segment on editor.construct.net, in the same form as `[bundle r495]`. `[editor save r50603]` is a different tag for a different channel and is not interchangeable with it.

### The load fact

`[bundle r495]` Project load calls the type lookup on the stored `type` string. A registered string returns its registration, and nothing in the loader compares the stored string with the type the extension lookup would give. So the editor keeps a registered stored `type` on load and does not re-derive it from the extension[^issue-115-registry-capture]. This replaces the earlier statement that whether the editor re-derives the type on load was unknown.

- **Deduction.** `application/octet-stream` is itself a registered string, because `.mem` registers it. A writer's `application/octet-stream` for an in-scope extension therefore persists through load. The gap wrote a wrong `type` that lasted.
- **Inference.** A stored type that no registration holds, such as an unregistered `model/fbx` in an r495 editor, is replaced by `application/octet-stream` on load. This follows from the lookup and no later step in the bundle text restores the string.
- **Limit.** The finding is about load. It does not say what a later save writes, and no save test confirms it.

## Compromise

**Chosen: the flat table grows, with a new label.** One extension has one type in every section, so the type belongs in the flat table. Only this option corrects the released `fileTypeForName`, and the corpus probe in `scripts/scan-domain-facts.mjs` stays correct without an edit because it reads `EXTENSION_FILE_TYPES` directly.

**A fallback table that only `fileTypeForSection` reads.** Rejected. It is the "two exported tier tables" shape that [ADR 0027](/decisions/0027-file-entry-type-writer-fact.md) rejected: one extension-to-type table split by evidence tier, which a consumer would have to merge. It also leaves `fileTypeForName` wrong for 45 extensions against its own contract, leaves the corpus probe reporting those extensions as unmapped, and gives construct3-chef nothing until it adopts `fileTypeForSection`. It is purely additive against the released version, but it buys that with a third source of truth.

**ADR 0036 Option C, an exported registry model (ordered registry plus hint table, reimplementing the lookup).** Rejected. The evidence weakens ADR 0036's reason for rejecting it, which was that the order of registry entries changes between releases. r495 is an exact prefix of r506-3 and r509, the order of the three multi-registration extensions did not change, and the r460 to r495 change was also an append. The cost reason holds. It adds two tables and a second lookup engine, and for all 45 extensions the result equals the chosen option, because one registration makes the hint irrelevant. The benefit, automatic handling of a future multi-registration extension, is speculative. Today only `.webm` differs by section.

**Per-section rows, 45 × 7 = 315 cells.** Rejected, as [ADR 0027](/decisions/0027-file-entry-type-writer-fact.md) rejected a per-section table: "per-section keys would duplicate every row for no information". Here there is no information to carry. By the lookup rule, the type of a single-registration extension does not depend on section, hint or path.

**The names `REGISTRY-ONLY` and `BUNDLE-ONLY`.** Rejected. `REGISTRY-ONLY` has a meaning for this table alone, and `BUNDLE-ONLY` reads as "only the bundle has the key".

**Two ADRs, a label record that amends ADR 0022 and a rows record.** Rejected. The label's one adopter and its admission condition both come from this issue's trace, so two records would only cite each other.

**Also kept out.** ADR 0036 Option B, `fileTypeForName(name, section?)`, is not revived. Its rejection stands, because `names.map(fileTypeForName)` would stop compiling. Leaving the gap was excluded by the maintainer's scope decision.

## Consequences

- **`fileTypeForName` output changes for 45 extensions.** It returned `application/octet-stream` and now returns the registry type. This is a behaviour change for direct callers. Every existing row is unchanged, and the table was already labelled KNOWN INCOMPLETE. The change ships in a minor release with a "Behaviour change for direct callers" note in `CHANGELOG.md`, as the #114 entry there does.
- **`fileTypeForSection` differs from `fileTypeForName` at one cell.** Only (`video`, `.webm`) differs. Every other extension resolves through the flat table in every section.
- **construct3-chef is affected.** Its `inferMimeType` and its `MIME_MAP`, which is the same object as `EXTENSION_FILE_TYPES`, change for the 45 extensions. The sync sets a type only when it creates a new item, so existing entries are not re-typed. A heads-up issue follows the release.
- **The corpus probe needs no edit.** Probe 10 of `scripts/scan-domain-facts.mjs` reads the flat table, so an entry with one of the 45 extensions now reports MATCH or MISMATCH and no longer UNMAPPED. A MISMATCH is the first observation that falsifies a BUNDLE-PREDICTED row. A MATCH on a project saved by the editor is the evidence that promotes it.
- **A later registry change is handled by repeating the capture's method.** For `.mtl` at r509 the method adds a row labelled BUNDLE-PREDICTED and updates the tests that pin the row count and the registry pairs.
- **ADR 0036 is amended, not rewritten.** Its body, including its description of the gap and the freeze, stays as the record of its date. The amendment line on ADR 0036 points here.
- **Evidence is the bundle only.** No editor save covers the 43 BUNDLE-PREDICTED rows, and no r509 behaviour is assumed beyond the 53 shared registrations. The entry-path trace was done at r495 only, and the flag arguments of the registrations were not mapped between releases.

## Related

- [ADR 0036 — Section-aware file-entry type and info keys](/decisions/0036-section-aware-file-entry-type-and-info-keys.md) — amended: freeze lifted, `.ogv` and `.mov` rows moved, gap closed.
- [ADR 0027 — File-entry type as a writer-direction domain fact](/decisions/0027-file-entry-type-writer-fact.md) — amended: a third tier.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md) — amended: a new label.
- [C3 Domain Facts](/c3-domain-facts.md) — the evidence numbers behind the tiers.
- [Project Manifest](/project-manifest.md) — where the exports sit.

[^issue-115-registry-capture]: Issue #115 editor MIME registry at r506-3 and the paths that set a file entry's type (capture, 2026-11-04)
