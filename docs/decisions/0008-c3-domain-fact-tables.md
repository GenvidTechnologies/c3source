# 0008. C3 domain facts owned as exported tables in `c3source`

- **Status:** accepted
- **Date:** 2026-06-03
- **Issue:** #26 (extended by #28, #29, #33, #39)

## Context

A number of C3 behaviors are encoded as magic id-lists and number maps: which
System ACEs reference an event variable (and the parameter *key* holding the
name); which MIME type an image member maps to which file extension; which fields
the editor loader requires; what operator symbol a `comparison` parameter value
means; that a timeline's `transitions/` folder serializes as an unnamed subfolder.
Every downstream tool that re-hardcodes one of these drifts against C3 on the next
editor release.

## Decision

Each such fact is **owned here** as an exported table plus accessor,
version-pinned to C3 (currently r487), so downstream imports the fact instead of
re-encoding it:

- `EVENTVAR_REFERENCE_ACES` + `isEventVarReference` / `getEventVarReferenceName` (#26)
- `IMAGE_FILE_TYPE_EXTENSIONS`, driving `deriveExpectedImageNames` (#29)
- `EDITOR_FIELD_RULES`, driving `validateForEditor` ([ADR 0009](0009-editor-strict-validation.md), #33)
- `COMPARISON_OPERATORS` + `comparisonSymbol` (#39)
- `TIMELINE_TRANSITIONS_FOLDER` (#28), plus `IMAGES_FOLDER` and `PROJECT_MANIFEST_FILE`

The tables are extensible — a new C3 quirk is a one-line addition — and each new
fact cites the prior as precedent (e.g. "cf. `EVENTVAR_REFERENCE_ACES`"). Gating
is deliberate and per-fact: `isEventVarReference` gates on
`objectClass === "System"` to avoid false positives from a plugin reusing an id,
while `COMPARISON_OPERATORS` is keyed on the parameter name with no class gate.

## Compromise

Letting each consumer hardcode the facts it needs avoids any shared coupling, but
scatters C3 version knowledge across every downstream tool. Centralizing means
`c3source` must track C3 version changes, but downstream stops re-encoding magic
numbers and inherits fixes for free. We chose ownership, keeping the tables lean
(the fact only) and leaving semantic resolution — name → declaration scope,
shadowing — to the consumer.

## Consequences

A C3 version bump updates the tables in one place and propagates to every
consumer. The facts are pinned to r487 and must be revisited on C3 upgrades. This
is now a recurring convention across the library, and the domain-fact table is
the mechanism [ADR 0009](0009-editor-strict-validation.md) reuses for editor
validation rules.

**How a table gets seeded is a standing weakness (added 2026-08-03, #60).** Two
failures, one after the other, in a single feature:

1. **The canonical fixture is a correctness oracle, not a coverage oracle.** It is
   one small editor-round-tripped project. `C3_PSEUDO_OBJECT_CLASSES` seeded from
   it alone would have been `["System"]` — the fixture contained *zero* function
   ACEs — and would have produced **212 false positives in one real project**.
   Scanning a 14-project corpus found the missing member.
2. **A corpus scan validates observed *values*, not the *mechanism* behind them.**
   The corpus then said the missing member was `"Functions"`, so it went into the
   static table. It should not have: `"Functions"` is the **default** of a
   per-project `project.c3proj` setting (`functionsName`). Every scanned project
   used the default, so breadth confirmed the string and concealed that it was
   configurable at all. A project that renames its functions object would have had
   *every function call* falsely reported. Fixed by modelling
   `C3ProjectManifest.functionsName` and resolving per project; see
   [ADR 0021](0021-reference-integrity-detection.md).

The rule this yields: **before pinning a value into a table, ask what in C3
*determines* it.** If the answer is a project setting, an addon, or an export
option, the table holds a *default* and the real value must be resolved — a
corpus of any size cannot tell you this if it is uniform on that dimension.

The tables predating this — `EVENTVAR_REFERENCE_ACES`, `COMPARISON_OPERATORS`,
`IMAGE_FILE_TYPE_EXTENSIONS`, `EDITOR_FIELD_RULES` — were seeded from the fixture
and from incident reports, i.e. by the method that failed twice above. There is no
evidence any is wrong; there is also no evidence any is right.
`scripts/scan-references.mjs` is the pattern for checking them.
