# Plan: `isEventVarReference` classifier (issue #26)

Branch: `feat/eventvar-reference-classifier`

## Goal

Own the C3 platform fact "which System ACE ids reference an event variable, and
which parameter holds the variable name" in c3source, so downstream
(construct3-chef #58) need not hardcode it. Ship a classifier + resolver.

## Decisions

- **Locator = param key**, not positional index — c3source stores ACE parameters
  as a keyed `Record<string, unknown>`. Deviation from the issue's literal
  `nameParamIndex`; note in PR body for #58.
- **Export `EVENTVAR_REFERENCE_ACES`** (id → param key) as a canonical fact table,
  matching `EDITOR_LOCAL_EXCLUSIONS` / `C3_SECTION_FOLDERS`.
- Fixture-confirmed shape: `objectClass: "System"`, var name under key `"variable"`.

## API (src/c3source.ts; index.ts re-exports `*`)

```ts
export const EVENTVAR_REFERENCE_ACES: Record<string, string> = {
  "set-eventvar-value": "variable",
  "add-to-eventvar": "variable",
  "subtract-from-eventvar": "variable",
  "set-boolean-eventvar": "variable",
  "toggle-boolean-eventvar": "variable",
  "compare-eventvar": "variable",
  "compare-boolean-eventvar": "variable",
  "is-boolean-eventvar-set": "variable",
};

export function isEventVarReference(
  ace: Condition | ScriptAction | Record<string, unknown>,
): { nameParamKey: string } | null;

export function getEventVarReferenceName(
  ace: Condition | ScriptAction | Record<string, unknown>,
): string | null;
```

- `isEventVarReference`: `objectClass === "System"` && `id ∈ EVENTVAR_REFERENCE_ACES`
  → `{ nameParamKey }`, else `null`. Structural reads (mirrors `formatActionInner`).
- `getEventVarReferenceName`: classify, then return `parameters[nameParamKey]` when a
  string, else `null` (defensive against missing/non-string params).

## Tasks (one commit each)

1. **Fixture baseline** — commit re-exported fixture (`Event sheet 1.json`,
   `project.c3proj`, `ts-defs`) + bump `projectManifest.test.ts` R-C1 `48700 → 48702`.
   No new src. Validator gate.
2. **Classifier (TDD)** — add `test/eventVarReference.test.ts`, then implement the
   const + two functions. Unit (8 ids, non-System, non-eventvar, ScriptAction,
   missing params) + integration (Event sheet 1 fixture → globalVar1 ×2, localVar1 ×2).
   Validator gate.
3. **Docs** — `CLAUDE.md` event-sheet paragraph + `docs/api-guide-extraction.md`.
   tech-writer, then code-reviewer.

## Risks

- Index-vs-key fragility — avoided by choosing key.
- `is-boolean-eventvar-set` kept from issue list though fixture uses
  `compare-boolean-eventvar`; harmless, set is non-exhaustive by design.
