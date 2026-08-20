---
type: decision-context
title: "ADR 0009 — Lenient parse types + a separate editor-strictness validation layer"
description: Parse types stay intentionally lenient for reading hand-edited or partial C3 JSON, and a separate, detection-only validateForEditor layer, driven by the extensible EDITOR_FIELD_RULES table, models the stricter C3 editor loader's required-field set.
tags: [adr, validation, c3-domain-facts]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0009
    resource: ../../raw/adr-0009-editor-strict-validation-2026-08-20.md
    title: "ADR 0009 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0009 — Lenient parse types + a separate editor-strictness validation layer

**Status:** accepted
**Date:** 2026-06-09
**Issue:** #33

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0009].

## Context

`c3source`'s parse types are **intentionally lenient** — fields like
`EventSheetVariable.comment` and `GroupEvent.description` are typed optional — so
the library can read partially-formed or hand-edited C3 JSON. But the C3 editor
loader is **stricter**: it rejects `undefined` on import with
`Error: expected string`. A tool that mutates C3 JSON and writes it back needs to
know what the editor will reject *before* writing, and the lenient parse types by
design do not tell it.

## Decision

Keep the parse types lenient, and add a **separate, detection-only validation
layer** that models the editor loader's required-field set. `validateForEditor(sheet)`
and `validateEventForEditor(event, jsonPath?)` return
`EditorValidationIssue[]: {path, rule, message}`, where `path` is the `visitEvents`
`jsonPath` (so it cannot drift). The rules live in the exported, extensible
`EDITOR_FIELD_RULES` table — the same domain-fact convention as
[ADR 0008](/decisions/0008-c3-domain-fact-tables.md) — so each newly discovered C3-load bug
is a one-line rule. The check is `typeof === "string"`, so an **empty string
passes**; only `undefined`/non-string is flagged. The layer performs **no
mutation**.

## Compromise

Tightening the parse types to match the editor would give one type system, but
then `c3source` could no longer read lenient or in-progress JSON — its whole
purpose. We chose the split: parse stays permissive for reading, validation is
opt-in for write-safety. The cost is two notions of "valid" that must be kept in
sync as C3 evolves.

## Consequences

Callers validate before writing back to catch editor-import failures — the
originating incident was that adding `comment: ""` / `description: ""` resolved
real C3 import errors. Validation is detection-only; fixing stays the consumer's
job. New editor-load rules extend one table
([ADR 0008](/decisions/0008-c3-domain-fact-tables.md)).

## Related

- [ADR 0008 — C3 domain facts owned as exported tables in c3source](/decisions/0008-c3-domain-fact-tables.md) — the domain-fact-table convention this record's EDITOR_FIELD_RULES reuses.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — the current shape of validateForEditor and its later custom-ace-name-required rule.
- [C3 Domain Facts](/c3-domain-facts.md) — EDITOR_FIELD_RULES' confidence label and corpus-auditability caveat.

[^adr-0009]: ADR 0009 (docs/decisions capture, 2026-08-20)
