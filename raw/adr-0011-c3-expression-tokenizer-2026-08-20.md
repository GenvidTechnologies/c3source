# 0011. C3-expression tokenizer for reference extraction

- **Status:** accepted
- **Date:** 2026-07-19
- **Issue:** #43

## Context

C3 expressions are unstructured plain text embedded in action/condition
parameter string values (`"int(Clock.Elapsed) & Player.Platform.VectorX"`).
Consumers doing expression-level analysis — blast-radius scans, usage
reports, dependency graphs keyed on which objects/behaviors an expression
touches — each need to break that text into references, system-function
calls, and bare variables. Without a shared tokenizer, every such consumer
re-rolls its own best-effort parser, and each one has to independently get
string-literal handling, nested-call references, and token classification
right. This is C3 domain grammar, the same category of knowledge as the
existing reference classifiers ([ADR 0008](0008-c3-domain-fact-tables.md)),
so it belongs in `c3source` beside them rather than downstream.

## Decision

`extractExpressionReferences(expr: string): ExpressionToken[]` is a
single-pass, stateful tokenizer over a raw C3 expression string. It returns a
**flat, source-ordered discriminated-union array** of three token kinds —
`reference` (`Object.member`, `Object.Behavior.member`, bare or call form),
`systemFunction` (no-prefix call like `int(...)`), and `variable` (any other
bare identifier) — carrying character spans and nesting metadata
(`parentIndex`, `argCount`) computed via a general paren-frame stack (one
frame per open `(`, whether or not it belongs to a call). It is pure and
best-effort: string literals (`"…"` with `""` as the doubled-quote escape)
are skipped so refs inside quotes are never reported, nested-call and
operator-concat references are never dropped, and the function **never
throws** — malformed input (unterminated string, trailing `Sprite.`,
unbalanced parens) degrades to a partial or empty result. See the doc-comment
on `extractExpressionReferences` in `src/c3source.ts` and
[`docs/api-guide-extraction.md`](../api-guide-extraction.md) for the full
grammar and worked examples.

## Compromise

- **Flat regex scan** — rejected. Correct string-literal handling, not
  dropping nested-call references, classifying tokens, and computing nesting
  metadata all require real state (a paren-frame stack, a scan position), not
  a stateless pattern match.
- **Three separate arrays** (`refs` / `systemFunctions` / `variables`) —
  rejected. A nested reference's parent call may be an object-call reference
  or a system-function call, which would live in two different arrays, so
  `parentIndex` could not unambiguously point across them. A single flat
  union in source order keeps parent linkage unambiguous: a token's parent
  always precedes it in the array.
- **Grammar-level only** — deliberately in scope for this decision, not a
  rejected alternative: `extractExpressionReferences` does not resolve names
  to plugin/behavior/ACE ids, decide which parameters are expression-typed,
  or iterate event sheets. That work needs the project object model and ACE
  parameter types, which the consumer already holds, and event-sheet
  iteration is already covered by `visitEvents` ([ADR
  0002](0002-canonical-event-numbering.md)). Folding it in here would
  duplicate that surface for no benefit.

## Consequences

Consumers doing reference analysis filter `tokens.filter(t => t.kind ===
"reference")` (or the other kinds) instead of re-parsing expression text
themselves. The C3 expression grammar is owned once, upstream, following the
domain-fact convention of [ADR 0008](0008-c3-domain-fact-tables.md). The
grammar surface is version-sensitive — deeper dotted chains, indexing
expressions, or new operator forms may need tokenizer extension on a future
C3 release, the same maintenance burden the other domain-fact tables already
carry.
