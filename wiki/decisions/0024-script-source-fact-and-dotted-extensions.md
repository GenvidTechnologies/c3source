---
type: decision-context
title: "ADR 0024 — Script-source domain fact, generated-sibling rule, and dotted-extension convention"
description: SCRIPT_SOURCE_EXTENSIONS/isScriptSourceName/isGeneratedScriptOutput/filterAuthoredScriptPaths ship C3's own script-source and generated-.js-sibling rules as exported facts, and every dotted-extension domain fact in the library (breaking the prior undotted image tables) now carries a leading dot uniformly.
tags: [adr, domain-facts, scripts, breaking-change]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0024
    resource: ../../raw/adr-0024-script-source-fact-and-dotted-extensions-2026-08-20.md
    title: "ADR 0024 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0024 — Script-source domain fact, generated-sibling rule, and dotted-extension convention

**Status:** accepted
**Date:** 2026-08-10
**Issue:** #73, #74

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0024].

## Context

`c3-domain-manager` had shipped its own copy of "which extensions are C3
script source" (#39), marked explicitly as a temporary local fact pending
c3source owning it — the same pattern ADR 0008 exists to prevent. #73 asked
c3source to export that fact. Separately, #74 tracked a pre-existing
inconsistency: every dotted-extension domain fact in the library
(`C3ADDON_EXTENSION`, `C3_MINIFIED_SOURCE_SUFFIXES`) carries the leading `.`,
except the image surfaces (`IMAGE_FILE_TYPE_EXTENSIONS`,
`C3_LEGACY_IMAGE_EXTENSION`, `ExpectedImage.ext`), which don't. #73 explicitly
scoped out deciding whether a given `.js` on disk is authored source or
compiler output, framing that as consumer policy "different consumers may
reasonably answer differently." Investigating the fact for #73 showed that
premise was wrong.

## Decision

**1. Where the fact lives, and its shape.** `src/layouts.ts` gains
`SCRIPT_SOURCE_EXTENSIONS = [".js", ".ts"]`, `isScriptSourceName(name)`
(case-insensitive, excludes `.d.ts`), `isGeneratedScriptOutput(name,
siblings)`, and `filterAuthoredScriptPaths(paths)` (groups by directory).
`src/manifest.ts` gains `SCRIPT_FILE_TYPE_EXTENSIONS`
(`application/javascript` → `.js`, `application/typescript` → `.ts`). Split
follows the module DAG (`serialize` ← `layouts` ← `{eventSheets, addons,
manifest}` ← `references` ← `project`): the disk-side facts sit in
`layouts.ts` beside `isEditorLocalPath`/`find_all_files_path` so every tier
above can reach them; the MIME table sits in `manifest.ts` beside
`IMAGE_FILE_TYPE_EXTENSIONS` because the MIME only ever appears on a
`C3FileEntry`. Evidence, per ADR 0008/0022: read from C3's own editor bundle
(a literal `new Set([".js", ".ts"])`), not inferred from the corpus.
TypeScript is release-pinned to **r433** (r432 has zero
`application/typescript` occurrences; the import set is `new Set([".js"])` at
r397/r402/r432). The corpus corroborates independently — 136 declared script
items, `.js` only at releases 39700/40702, `.ts` only at 47604/49500.

**2. The generated-sibling rule is a platform fact.** #73's scoping-out was
itself wrong: C3's own folder-project reconcile auto-adopts a disk `.js` into
the script folder only when no same-basename `.ts` sits beside it — exactly
the rule #73 called consumer policy. `isGeneratedScriptOutput` and
`filterAuthoredScriptPaths` ship that rule rather than deferring it. General
lesson worth keeping: an issue's scope boundary is itself a claim about the
platform and deserves the same verification as its proposed value — reading
C3's own source settled it, and no corpus scan could have.

**3. Extensions always carry a leading dot (breaking).** The image surfaces
were the sole outlier; this removes it rather than introducing a third
convention. `IMAGE_FILE_TYPE_EXTENSIONS` values (`png` → `.png` etc.),
`C3_LEGACY_IMAGE_EXTENSION` (`"png"` → `".png"`), and the typed public field
`ExpectedImage.ext` all move. Rendered output is unchanged —
`deriveExpectedImageNames`/`detectImageDrift` still report
`bullet-default-000.png` byte for byte; only the intermediate representation
moved, with render sites dropping their literal `.` join. Migration for a
consumer: `` `${stem}.${ext}` `` → `` `${stem}${ext}` ``.

`findAllScripts` behaviour changes as a consequence of point 2: it returned
`.ts` only and now also returns an authored `.js` (one with no `.ts`
sibling). Measured blast radius — across the 14-project corpus every `.js`
under `scripts/` is paired, so all are dropped by the sibling rule and output
is unchanged on all 14; the only input whose result moves is a project
holding an unpaired authored `.js`, which the old predicate omitted
incorrectly. The two changes cancel usefully: admitting `.js` *without* the
sibling rule would have been the riskier change on its own.

Ships as **2.0.0**.

## Compromise

1. **Ship exactly what #73 asked for** — extension set + predicate only, no
   MIME table. Rejected: `C3FileEntry.type` already carried the MIME and
   nothing read it, so the disk-side half alone would leave the manifest half
   of the same fact unmodelled, inviting a second consumer to hardcode it.
2. **Keep the image tables undotted, let the two conventions coexist** —
   rejected: two adjacent MIME-to-extension tables in one file with opposite
   dot conventions is a durable footgun for anyone using them together.
3. **Ship #73 as a minor now, defer the dotted alignment to a later major** —
   rejected deliberately: two breaking releases instead of one, forcing
   `c3-domain-manager` through two upgrades. #74 was filed anyway as the
   durable record and is closed by this PR.
4. **Defer the generated-sibling rule as consumer policy** (#73's original
   framing) — rejected once C3's own source showed it is not policy.
5. **Narrow `SCRIPT_FILE_TYPE_EXTENSIONS` to a union type** of
   `SCRIPT_SOURCE_EXTENSIONS` members — rejected to keep it
   consumer-extensible, matching `IMAGE_FILE_TYPE_EXTENSIONS`, which is
   documented as exported so callers can introspect and extend it.

## Consequences

- Consumers indexing `IMAGE_FILE_TYPE_EXTENSIONS` or reading
  `ExpectedImage.ext` break at upgrade. With no CHANGELOG.md in this repo,
  this ADR plus `docs/api-guide-manifest.md` are the two migration
  references.
- A future maintainer must not "tidy" one convention into the other — the
  dot prefix is now uniform by rule, not by accident.
- `c3-domain-manager` (#39) and any other consumer holding a local copy of
  the script-extension set can retire it in favor of `SCRIPT_SOURCE_EXTENSIONS`.

## Related

- [ADR 0008 — C3 domain facts owned as exported tables](/decisions/0008-c3-domain-fact-tables.md) — the temporary-local-fact pattern (`c3-domain-manager`'s own copy) this ADR closes for script extensions.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md) — cites `isGeneratedScriptOutput`'s JSDoc as the house standard for an evidenced platform claim.
- [ADR 0025 — Section item-hood and stray files](/decisions/0025-section-item-hood-and-stray-files.md) — explicitly excludes `findAllScripts` from its item-hood axis because this ADR already gave it a correct, section-specific rule.
- [Layout Traversal](/layout-traversal.md#script-source-classification) — the current state of the script-source classification this ADR establishes.

[^adr-0024]: ADR 0024 (docs/decisions capture, 2026-08-20)
