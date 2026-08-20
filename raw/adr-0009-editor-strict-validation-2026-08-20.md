# 0009. Lenient parse types + a separate editor-strictness validation layer

- **Status:** accepted
- **Date:** 2026-06-09
- **Issue:** #33

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
[ADR 0008](0008-c3-domain-fact-tables.md) — so each newly discovered C3-load bug
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
([ADR 0008](0008-c3-domain-fact-tables.md)).
