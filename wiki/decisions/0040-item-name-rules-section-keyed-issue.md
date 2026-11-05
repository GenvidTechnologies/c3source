---
type: decision-context
title: "ADR 0040 — The editor's item-name rules ship as one section-keyed function, itemNameIssue, in src/manifest.ts"
description: itemNameIssue(section, name) returns the first issue the C3 editor would raise for an item name in one of the seven name sections, or undefined. It lives in src/manifest.ts with the exported types C3NameSection and ItemNameIssue and a release-pinned table, C3_SYSTEM_EXPRESSION_NAMES. A rewrite is reported as a non-refusal issue, a refusal wins over a rewrite, the object-class rules model the rename setter, and the label is AUDITED at r495-2. Uniqueness is not checked.
tags: [adr, manifest, item-names, domain-facts, api-surface]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-04T12:00:00Z }
sources:
  - id: issue-123-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/123
    title: "c3source#123 — export the C3 item-name rules"
  - id: issue-123-evidence
    resource: ../../raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md
    title: "Bundle evidence for the item-name rules at r495-2 (c3source#123)"
---

# ADR 0040 — The editor's item-name rules ship as one section-keyed function, `itemNameIssue`, in `src/manifest.ts`

**Status:** accepted
**Date:** 2026-11-04
**Issue:** [#123](https://github.com/GenvidTechnologies/c3source/issues/123)

## Context

The C3 editor checks an item name before it stores one. Two families of sections apply different rules[^issue-123-upstream]:

- **Strip family.** `layouts`, `eventSheets`, `timelines`, `flowcharts` and `models3d` strip the name, then refuse an empty name, a too-long name or a device name.
- **Object-class family.** `objectTypes` and `families` transform the name, then refuse an empty name or a reserved one: a device name, a reserved word, or a System expression name.

The library owned none of these rules. Consumers re-derived them, and construct3-chef's copy missed the System expression names. The rules at r495-2 were read from the editor bundle and are quoted in the raw capture[^issue-123-evidence]. [ADR 0034](/decisions/0034-declared-empty-item-name-fails-manifest-validation.md) checks only the raw empty string. [ADR 0031](/decisions/0031-empty-stem-is-not-a-section-item.md) left the objectTypes and families setters untraced.

## Decision

Option A: one section-keyed function in `src/manifest.ts` (recommended)

```ts
export type C3NameSection = keyof typeof C3_SECTION_FOLDERS;
export type ItemNameIssue = /* rewritten, or a refusal with name and message */;
export const C3_SYSTEM_EXPRESSION_NAMES: readonly string[];
export function itemNameIssue(section: C3NameSection, name: string): ItemNameIssue | undefined;
```

The public surface grows by two values and two types. Nothing is removed.

- **It follows the `fileTypeForSection` precedent** ([ADR 0036](/decisions/0036-section-aware-file-entry-type-and-info-keys.md)). The section is not only a dispatch key: it picks the editor's exact per-section message, for example `invalid layout name '<input>'`.
- **Placement.** `src/manifest.ts` already owns `C3_SECTION_FOLDERS`, so the module graph does not change and issue #125 can reuse the case-folding knowledge without a cycle.
- **First issue, not all issues.** The editor short-circuits, so the function returns the first issue in the editor's order, or `undefined` when the editor stores the name unchanged.
- **`rewritten` is an issue, not a refusal.** When the editor would store a different name (stripped characters, edge dots or whitespace, an NFC change, a transformed object-class name), the result is `{ kind: "rewritten", name }`. A refusal wins over a rewrite. The editor's rename UI accepts a rewrite with a warning, so a caller that follows the editor accepts it. construct3-chef refuses it. Reporting it matters: in issue #100 the r495.2 control opened an object type with spaces under its stripped name, and a save then lost its file.
- **No transform exports.** The stored name is `issue?.name ?? name`, so a separate strip or normalize export would be a second name for one fact.
- **The rename path is modelled for object classes.** The rename setter has no `System` exemption and no load skip. The `itemNameIssue` JSDoc states how the create path differs: exact `System` is exempt from the reserved check, the check is skipped while the project loads (inferred from the code, not run), and reserved is checked before used. A create or rename to `System` still fails, because `System`'s own object class is registered in every project (observed in the bundle).
- **The System expression names are a release-pinned exported table**, `C3_SYSTEM_EXPRESSION_NAMES`. The user chose this at the requirements checkpoint over taking the names from the caller. `scripts/system-expression-names.mjs` regenerates the table from a release's `plugins/allAces.json`; the raw capture records the method and the output.
- **The device rule is the editor's, not chef's.** The whole name, lowercased, is tested against the device set (`con.txt` and `CONSOLE` are accepted). chef's stricter stem rule is not adopted.
- **Confidence label: AUDITED against the C3 editor bundle at r495-2.** [ADR 0038](/decisions/0038-bundle-predicted-file-entry-types.md) limits BUNDLE-PREDICTED to the tiers of a table defined by observation counts. A rule table checked against the bundle keeps AUDITED, as `isSectionItemName` and `SCRIPT_FILE_TYPE_EXTENSIONS` do. The JSDoc states that r379 and r402 are not traced.
- **Uniqueness is not checked.** It needs project state. `detectManifestDrift`'s duplicate check is unchanged; issue #125 owns it.

**Release.** The change is additive, so it ships as a minor.

## Compromise

- **Option B: per-family functions plus exported transforms (alternative)**. Rejected. It means four values: an `itemNameIssue(name)` for the five strip sections, an object-class function, and two transforms. It maps directly onto chef's two bridge functions, but it doubles the public names. Without a section the strip-family message must be generic, because the function cannot name the item kind. The transforms duplicate `issue.name`. The names would also have to dodge chef's `objectClassNameIssue` and `normalizeObjectClassName`.
- **Option C: boolean predicates plus exported sets in `src/layouts.ts` (rejected)**. This follows the `isSectionItemName` and `isEditorLocalPath` pattern. A boolean cannot express the strip-versus-refuse split, or "rewritten to X", without transforms, which turns it into Option B. `src/layouts.ts` cannot see `C3_SECTION_FOLDERS`, so it would grow a second copy of the section list.
- **Placement variant, rejected: a new `src/itemNames.ts`**. With no imports it is a second leaf, which breaks "serialize is the sole leaf". If it imports `manifest`, issue #125 cannot reuse it without a cycle. It would also move the "seven modules" statements in the wiki.

## Consequences

- New exports, all additive: `itemNameIssue`, `C3NameSection`, `ItemNameIssue` and `C3_SYSTEM_EXPRESSION_NAMES`. The API is documented in [Project Manifest](/project-manifest.md); the domain facts and the corpus result are in [C3 Domain Facts](/c3-domain-facts.md).
- The table is pinned to r495-2 and must be regenerated on a C3 bump. A later release can reserve names the table lacks. r379 and r402 are not traced.
- Uniqueness is not checked, and `detectManifestDrift`'s duplicate check is unchanged (issue #125).
- Corpus run, 2026-11-04: 2,285 declared names in 14 projects, 0 issues. models3d was not exercised, and no refusal was exercised. The run shows the rules do not falsely flag names the editor saved; it does not test the refusals.
- `validateProjectManifest` does not call `itemNameIssue`. Its empty check tests the raw string, while `itemNameIssue` tests after the transform, so `"123"` in objectTypes is empty for one and valid for the other.

## Related

- [ADR 0036 — Section-aware file-entry type and info keys](/decisions/0036-section-aware-file-entry-type-and-info-keys.md) — the `fileTypeForSection` precedent.
- [ADR 0038 — BUNDLE-PREDICTED file-entry types](/decisions/0038-bundle-predicted-file-entry-types.md) — why this record's label is AUDITED.
- [ADR 0031 — An empty stem is not a section item](/decisions/0031-empty-stem-is-not-a-section-item.md) — the objectTypes and families setters it left untraced.
- [ADR 0034 — A declared empty item name fails manifest validation](/decisions/0034-declared-empty-item-name-fails-manifest-validation.md) — the raw-string empty check.

[^issue-123-upstream]: c3source#123 — export the C3 item-name rules
[^issue-123-evidence]: raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md
