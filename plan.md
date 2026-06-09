# Plan: editor-strict validation primitive — `validateForEditor` (issue #33)

## Goal

Add a detection-only strict validator to c3source that models the **C3 editor
loader's** required-field set — distinct from c3source's intentionally lenient
parse types — so downstream can guard against producing C3-load-invalid event
sheets before they reach the editor. Unblocks construct3-chef#61.

## Branch

`feat/validate-for-editor` off `main`.

## Design (approved)

New public surface in `src/c3source.ts` (re-exported automatically via `index.ts`):

```ts
export interface EditorValidationIssue {
  path: string;     // jsonPath from visitEvents, e.g. "events[1].children[2]"
  rule: string;     // stable id, e.g. "eventvar-comment-required"
  message: string;  // human reason
}

export interface EditorFieldRule {
  rule: string;
  eventType: EventSheetEvent["eventType"];           // dispatch key
  check: (event: EventSheetEvent) => string | null;  // message if violated, else null
}

export const EDITOR_FIELD_RULES: EditorFieldRule[] = [
  { rule: "eventvar-comment-required", eventType: "variable",
    check: e => typeof (e as EventSheetVariable).comment === "string" ? null
      : "EventSheetVariable.comment must be a string (C3 editor rejects undefined on import)" },
  { rule: "group-description-required", eventType: "group",
    check: e => typeof (e as GroupEvent).description === "string" ? null
      : "GroupEvent.description must be a string (C3 editor rejects undefined on import)" },
];

export function validateEventForEditor(event: EventSheetEvent, jsonPath = "event"): EditorValidationIssue[];
export function validateForEditor(sheet: EventSheet): EditorValidationIssue[];
```

### Mechanics

- `validateForEditor` is a **thin consumer of the canonical `visitEvents` walk** —
  pushes `validateEventForEditor(event, ctx.jsonPath)` per event, so issue paths use
  the same `jsonPath` as every other coordinate in the file and cannot drift.
- `validateEventForEditor` dispatches each rule whose `eventType` matches the event
  and collects non-null messages. Default `jsonPath = "event"` lets callers validate
  a detached node.
- `EDITOR_FIELD_RULES` mirrors the `EVENTVAR_REFERENCE_ACES` domain-fact convention —
  exported & extensible; "each downstream C3-load bug becomes a rule contribution" is
  a one-line array addition.

### Decisions baked in

- Rule is **"must be a `string`"** (`typeof === "string"`) → **empty string passes**,
  matching the incident fix (adding `""` resolved it). Only `undefined`/non-string flagged.
- **Detection-only**, no mutation.
- Rules are single-`eventType` for clean dispatch (both seed rules are). A future
  multi-kind rule just adds another entry. No speculative generality.
- `FunctionParameter.comment` deliberately **not** a rule (not a known editor-required
  field; not reached by the event walk).

## Tasks (one commit each)

### Task 1 (feat) — implement validator + tests

Files: `src/c3source.ts`, `test/validateForEditor.test.ts`.

Add the two interfaces, `EDITOR_FIELD_RULES`, `validateEventForEditor`, `validateForEditor`.
TDD-first test suite covering:

- variable missing `comment` → one issue, `rule: "eventvar-comment-required"`, correct `path`
- `comment: ""` → no issue; `comment: "x"` → no issue
- group missing `description` → one issue, `rule: "group-description-required"`
- group with `description` → no issue
- nested variable/group inside `children` → `jsonPath` reflects nesting (e.g. `events[0].children[1]`)
- clean sheet → `[]`
- `validateEventForEditor` single node with default path
- `EDITOR_FIELD_RULES` exported and contains both rules

Agent: `genvid-dev:ts-implementer` → gate with `genvid-dev:validator`.

### Task 2 (docs) — document the primitive

Files: `docs/api-guide-extraction.md`, `CLAUDE.md` (event-sheet architecture section,
alongside the other domain facts).

Agent: `genvid-dev:tech-writer`.

## Close-out

- `genvid-dev:code-reviewer` gate.
- PR body: concise summary linking issue #33; note it unblocks construct3-chef#61.

## Risks

- Low. Single-file additive feature, no changes to existing behavior. The only domain
  judgment (empty-string-passes) is anchored to the originating incident's actual fix.
