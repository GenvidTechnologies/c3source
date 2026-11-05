---
type: decision-context
title: "ADR 0042 — The editor's rescan admission rule ships as one per-entry function, rescanAdmissionIssue, in src/manifest.ts"
description: rescanAdmissionIssue(section, entry) returns the first reason the C3 editor's rescan refuses an unlisted entry in one of the seven rootFileFolders sections, or undefined. It lives in src/manifest.ts with the types RescanEntry and RescanAdmissionIssue and two release-pinned tables, C3_GENERAL_ROOT_RESERVED_FILE_NAMES and C3_FONT_FILE_TYPES. The caller passes a hasRegisteredFile callback and c3source builds the twin name. Each rule is AUDITED against the editor bundle at r495. The rule stands alone, with no isEditorLocalPath filter. A boolean twin input, a manifest-resolving signature and a disk walk were rejected or deferred.
tags: [adr, manifest, rescan, root-file-folders, domain-facts, api-surface]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-05T18:00:00Z }
sources:
  - id: issue-130-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/130
    title: "c3source#130 — export the editor's rescan admission rule"
  - id: issue-130-evidence
    resource: ../../raw/issue-130-rescan-admission-bundle-evidence-2026-11-05.md
    title: "Bundle evidence for the rescan admission rule at r495 and r506-3 (c3source#130)"
---

# ADR 0042 — The editor's rescan admission rule ships as one per-entry function, `rescanAdmissionIssue`, in `src/manifest.ts`

**Status:** accepted
**Date:** 2026-11-05
**Issue:** [#130](https://github.com/GenvidTechnologies/c3source/issues/130)

## Context

When the C3 editor rescans a folder project, it adds the disk entries that the manifest does not list. In the seven `rootFileFolders` sections it decides each entry by a fixed rule[^issue-130-upstream]:

- a file-name check, applied to files and folders;
- reserved names for a file directly in the Files (`general`) root;
- a `ts-defs` folder skip at the `script` root;
- a skip of a `.js` file whose `.ts` twin the project already registers;
- a per-section switch: a category (audio, video, image) or the font flag.

The library owned none of this. construct3-chef re-derived it, and its copy is wrong (the report is chef#354, as issue #130 states). The rule was read from the editor bundle at r495 and compared with r506-3. The excerpts, hashes and offsets are in the raw capture[^issue-130-evidence]. The capture is a reading of code. No bundle code was run, and the only editor observation of rescan admission is the `.webm` and `.mov` save already recorded for the `video` section.

## Decision

**Option A: one per-entry function, `rescanAdmissionIssue`, in `src/manifest.ts`**

```ts
export const C3_GENERAL_ROOT_RESERVED_FILE_NAMES: readonly string[];
export const C3_FONT_FILE_TYPES: readonly string[];
export interface RescanEntry {
  kind: "file" | "folder";
  name: string;
  atSectionRoot: boolean;
  hasRegisteredFile?: (tsName: string) => boolean;
}
export type RescanAdmissionIssue = { kind: "name" | "reserved-root-name" | "ts-defs" | "ts-twin" | "section" };
export function rescanAdmissionIssue(section: C3FileSection, entry: RescanEntry): RescanAdmissionIssue | undefined;
```

The public surface grows by two values and two types. Nothing is removed.

- **It follows the `itemNameIssue` and `fileTypeForSection` precedents** ([ADR 0040](/decisions/0040-item-name-rules-section-keyed-issue.md), [ADR 0036](/decisions/0036-section-aware-file-entry-type-and-info-keys.md)). The function is keyed by section, returns the first issue in the editor's order, and returns `undefined` when the editor admits the entry. The returned `kind` says which rule refused the entry.
- **The caller supplies position and twin lookup; c3source builds the twin name.** `atSectionRoot` says whether the entry is directly in the section root. `hasRegisteredFile` is called only for a `.js` file in `script` or `general`, with the twin name: the text after the last dot replaced by `ts`, the stem's letter case kept. The callback is required for such a file, and the function throws without it, because a silent "no twin" would be a false accept.
- **The name check is a private port.** `rescanNameRefused` refuses and never strips, and it reads the constants `itemNameIssue` already uses. `itemNameIssue` is unchanged.
- **Placement.** `src/manifest.ts` already owns `C3_ROOT_FILE_FOLDERS` and `fileTypeForSection`, and already imports from `src/layouts.ts`. The module graph does not change.
- **Labels.** Each rule's JSDoc bullet carries "AUDITED against the C3 editor bundle at r495", and "at r495 and r506-3" where the two releases were read equal. Following [ADR 0040](/decisions/0040-item-name-rules-section-keyed-issue.md), a rule checked against the bundle keeps AUDITED. The `video` rule adds its one editor save. [ADR 0022](/decisions/0022-domain-fact-audit-convention.md) puts it that "labels live in JSDoc", so the labels and pins are in the JSDoc and the counts are in the wiki.
- **The editor's rule alone.** The function does not compose with `isEditorLocalPath`. A `uistate` folder in `general` is admitted. A caller that wants c3source's editor-local filter composes it itself.
- **The per-entry function only.** There is no separate file-name check export. A folder query in any section other than the `script` root already returns the bare name-check result.
- **The reserved root names are a Files-root file-name rule.** The editor applies the same list when a file is added or imported to the Files root, so `C3_GENERAL_ROOT_RESERVED_FILE_NAMES` is documented as that, and not only as a rescan rule.
- **Scope statement.** This is the rescan rule only. It does not decide load membership, and it is not the Import Files dialog's extension sets.

**Release.** The change is additive, so it ships as a minor, cut separately from this branch.

## Compromise

- **Option A2: Option A with a boolean twin input (rejected).** Reason: `tsTwinRegistered: boolean` replaces the callback. It is simpler to test. The cost: every caller derives the twin name itself, which re-derives the editor's name builder (stem kept, text after the last dot replaced). That is exactly the kind of per-consumer re-derivation #130 exists to remove. Rejected for that reason.
- **Option C: c3source resolves position and twin from the manifest (deferred).** Reason: its strength is that a caller cannot get the position wrong. Its costs: the twin semantics depend on what the editor's registered-file lookup returns being resolved first, not just documented; the function is tied to the manifest shape; and chef's sync already holds its own walk, so it would rebuild the manifest view only to call this. It can be added later as a thin wrapper over Option A if a second consumer appears.
- **Option B: Option A plus a walk, `rescanAdditions(projectDir, manifest)` (rejected for now).** Reason: it returns the entries a rescan would add. It needs answers this work cannot get: whether the browser's directory listing hides any entry, what a case-only collision does in the editor's batch, and how links are treated. It also overlaps the `untracked` set of `detectManifestDrift`. No consumer has asked for it.
- **Tier "UNVALIDATED for every rule except `video`" (rejected).** It is stricter, but it breaks the [ADR 0040](/decisions/0040-item-name-rules-section-keyed-issue.md) convention for rule tables that were checked against the bundle.
- **Tier BUNDLE-PREDICTED (rejected).** [ADR 0038](/decisions/0038-bundle-predicted-file-entry-types.md) states that the label applies "where a table's tiers are defined by observation counts". These rules are not such a table, so they keep AUDITED, as ADR 0040 decided for its rule table.
- **An opt-in flag that composes `isEditorLocalPath` (rejected).** It would make "the editor's rule" mean two things.
- **A separate name-check export, or a `reason` sub-field on the `name` kind (deferred).** Both wait for a consumer that needs them.

**Accepted costs.** A caller must pass `atSectionRoot` correctly and write `hasRegisteredFile` itself, and a wrong value gives a wrong decision without any error. The function decides only the entries the caller hands it. Which entries are unlisted, and which the browser lists at all, is the caller's side.

## Consequences

- New exports, all additive: `rescanAdmissionIssue`, `RescanEntry`, `RescanAdmissionIssue`, `C3_GENERAL_ROOT_RESERVED_FILE_NAMES` and `C3_FONT_FILE_TYPES`. The shipped behaviour is in [Project Manifest](/project-manifest.md#rescan-admission), and the domain facts are in [C3 Domain Facts](/c3-domain-facts.md#rescan-admission).
- The two tables are pinned: the reserved names to r495 and r506-3, the font types to r495 only. A later release can reserve or flag more.
- construct3-chef's planned tripwire, as issue #130 states it, is `/admi(t|ssion)|rescan/i` over the exported names. It matches `rescanAdmissionIssue`. That tripwire was not on chef's main when this record was written.
- Residuals, as the JSDoc states them:
  - whether the browser's directory listing hides any entry is not known, because the bundle has no source for it;
  - a case-only collision is not a refusal here: the editor soft-deletes the listed entry and adds the disk one (read in the bundle, not run), and when both stay live the add throws for that entry only (inferred);
  - `EXTENSION_FILE_TYPES` is KNOWN INCOMPLETE, so a row added there for an audio, video or image extension widens the category rule.
- The rule was not run over the local project corpus. The saved names of listed entries could test for false name refusals; they cannot test admission.

## Related

- [ADR 0040 — Item-name rules as one section-keyed function](/decisions/0040-item-name-rules-section-keyed-issue.md): the function shape, the label and the shared name constants this record follows.
- [ADR 0038 — BUNDLE-PREDICTED file-entry types](/decisions/0038-bundle-predicted-file-entry-types.md): why that label is not used here.
- [ADR 0036 — Section-aware file-entry type and info keys](/decisions/0036-section-aware-file-entry-type-and-info-keys.md): `fileTypeForSection`, which the category and font rules call.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md): labels and pins in JSDoc, counts in the wiki.

[^issue-130-upstream]: c3source#130 — export the editor's rescan admission rule
[^issue-130-evidence]: raw/issue-130-rescan-admission-bundle-evidence-2026-11-05.md
