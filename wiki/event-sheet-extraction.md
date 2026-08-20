---
type: reference
title: Event-Sheet Extraction
description: visitEvents is the single canonical depth-first event-numbering walk that every c3source extractor (scripts, functions, includes, SIDs, editor-strictness validation) consumes, with lexical scope, event-variable references, and raw expression text each handled by a dedicated, thin, never-throwing collector.
tags: [event-sheets, extraction, visitEvents, dsl, c3-domain-facts]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide-extraction
    resource: ../raw/docs-api-guide-extraction-2026-08-20.md
    title: "docs/api-guide-extraction.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Event-Sheet Extraction

## `visitEvents`: the canonical event-numbering walk

`visitEvents(events, visitor)` is the single canonical depth-first, pre-order
walk over an event tree; every other extraction function in this module
builds on it[^api-guide-extraction]. Its `EventVisitContext` exposes
`parent`, `index`, `jsonPath` (e.g. `"events[1].children[2]"`),
`eventNumber` (C3's 1-based depth-first counter, `null` for non-counting
events), and `depth`[^api-guide-extraction].

**Counting vs. non-counting events.** C3 assigns a running 1-based number to
groups, blocks, function-blocks, and custom-ace-blocks; variables, comments,
and includes do not increment the counter and receive `eventNumber:
null`[^claude-md][^api-guide-extraction]. The counter is owned in exactly one
place — `visitEvents` — and every caller (`extractScriptsFromSheet`,
`generateFunctionName`, and the sibling extractors below) reads its event
numbers from that one walk, so `eventNumber`, `eventIndex`, and
`generateFunctionName` cannot drift relative to each other[^claude-md].
Returning `false` from the visitor stops descent into that event's children;
siblings and the rest of the tree continue unaffected[^api-guide-extraction].

## `extractScriptsFromSheet` and lexical scope

`extractScriptsFromSheet(sheet)` returns every TypeScript script action in
canonical event order, each annotated with `humanPath`, `sheetName`,
1-based `eventIndex`/`actionIndex` (which together feed
`generateFunctionName`), `lines` (CRLF-normalized to LF), the enclosing
block's `conditions`, and lexical scope as `scopeVars` (flat) plus
`scopeSegments` (hierarchical, layered by scope)[^api-guide-extraction].

Scope is composed as a **stack of `ScopeSegment`s**: all `variable` events at
a given level are in scope for every block at that level regardless of
declaration order, so they are **pre-collected before traversal** rather than
accumulated as the walk descends[^claude-md]. This was confirmed by a
live-editor experiment, not merely inferred from this library's own walk
order — see the [domain-fact audit write-up](/c3-domain-facts.md#a-third-evidence-channel-live-editor-execution)
for the case and trace[^claude-md][^api-guide-extraction].

**The visibility-vs-re-initialization distinction.** The same experiment
found that *initialization is not hoisted the same way visibility is*: C3
re-initializes a local variable to its `initialValue` the moment execution
reaches the declaration event, discarding any mutation an earlier-positioned
block at that level already made[^claude-md]. `scopeVars`/`scopeSegments`
correctly report that a variable is in scope for a block positioned *before*
its declaration — but neither carries any signal that a reference in that
block reads a value about to be clobbered when the declaration executes. A
code generator that trusts `scopeVars` alone, with no positional check
against the declaration, can silently emit exactly that bug — the fix is to
declare a variable before using it[^api-guide-extraction].

Regular sibling blocks disambiguate their scope keys with `#<eventIndex>`;
functions and custom-ACEs use their unique names instead[^claude-md].

## Action formatting: `formatAction`/`formatCondition`

`formatAction(action, sheetName, eventIndex, actionIndex)` and
`formatCondition(cond)` render a single action or condition into a
single-line DSL — see the doc comment on `formatAction` in
`src/eventSheets.ts` for the full grammar[^claude-md]. `extractScriptsFromSheet`
carries a block's conditions on `ExtractedScript.conditions`, but not as
rendered text, and does not carry the other four action shapes at all — use
`formatAction`/`formatCondition` to render any of them[^api-guide-extraction].

Both functions prefix `[DISABLED] ` when `disabled === true`. Five shapes
are recognized, checked in order — comment, script, function call, custom
action, standard (with an optional `[BehaviorType]` suffix) — plus a
fallback, `[unknown action: <keys>]` (the action's own JSON key set), for
anything matching none of them[^api-guide-extraction].

**A `type: "script"` action without `language: "typescript"` never reaches
the script branch.** The exported guard `isScriptAction` requires both keys
literally, with no fallback for a missing or non-`"typescript"` `language`.
This has two distinct consequences: `formatActionInner` renders it as
`[unknown action: type, script]` (a **rendering** failure), while
`extractScriptsFromSheet`/`walkScriptActions` both gate collection on the
same guard, so the identical action is **silently dropped** from both
extractors' results — an **extraction** failure a downstream code generator
sees no evidence of[^api-guide-extraction]. The cause is version-dependent,
not malformed data: C3 began writing `language` on script actions starting
at r433 (the same release this library pins for `.ts` script support);
C3's own loader treats a missing `language` as `"javascript"`, so a
pre-r433 action with no `language` key is a legacy JavaScript action the
editor loads and runs normally. This is structurally the same shape as the
pre-r402 `fileType`-less image case behind `C3_LEGACY_IMAGE_EXTENSION` (see
[Project Manifest](/project-manifest.md)), but c3source has **not** applied
an equivalent fallback here — a legacy action is dropped rather than
recovered[^api-guide-extraction].

## Sibling extractors as thin `visitEvents` consumers

`walkScriptActions`, `extractFunctions`, and `extractIncludes` are thin
consumers of the same `visitEvents` walk, returning respectively: raw
TypeScript script text with no scope/coordinate info; function/custom-ACE
definitions (each carrying its `params` and `returnType` signature); and
include edges (`IncludeReference = includeSheet + jsonPath`) — all in
canonical event order[^claude-md]. `isFunctionDefinition(event)` narrows an
`EventSheetEvent` to the two signature-bearing kinds
(`FunctionBlockEvent | CustomAceBlockEvent`) for callers driving
`visitEvents` themselves[^claude-md]. `extractFunctions`'s
`params: FunctionParameter[]` is a structured array (not a pre-rendered
string) so the consumer controls the output format — a TypeScript
signature, a markdown table, or anything else[^api-guide-extraction].
`extractIncludes` is the primary building block for a cross-sheet dependency
graph: collect it per sheet, group by sheet name, and each sheet's direct
dependencies fall out[^api-guide-extraction].

## Event-variable references

`isEventVarReference(ace)` and `getEventVarReferenceName(ace)` classify a
single action/condition as referencing a C3 event variable. The canonical
fact table `EVENTVAR_REFERENCE_ACES` maps each known System ACE id
(`set-eventvar-value`, `compare-eventvar`, `compare-boolean-eventvar`, …) to
the parameter **key** that holds the variable name — a **key, not a
positional index**, because ACE parameters are a keyed
`Record<string, unknown>`[^claude-md]. `isEventVarReference` gates on
`ace.objectClass === "System"` (avoiding false positives from a plugin that
happens to reuse a known id) and `ace.id` being present in the table;
`getEventVarReferenceName` resolves the name defensively via
`ace.parameters[nameParamKey]`, returning `null` when `parameters` is absent
or the value is not a string[^claude-md][^api-guide-extraction]. This is the
C3 *domain fact* (id-list plus name-param) owned here so downstream need not
re-hardcode it (issue #26); resolving a referenced name to its declaration
scope — including lexical shadowing, where a local variable shadows a
same-named global — stays the consumer's job[^claude-md].

## SID traversal

`walkSids(node, visit: (sid, segments) => void)` is the exported primitive
that recursively visits every object carrying a numeric `sid`, delivering
both the sid value and its structured `SidPathSegment[] = (string |
number)[]` path. `formatSidPath(segments)` renders segments into the
canonical dotted/indexed string (`""` for root, `[i]` for array positions,
`.key` for object keys with no leading dot)[^claude-md]. `collectSids` and
`collectSidsWithPaths` are thin consumers: they call `walkSids` once and
accumulate. A caller that needs a different rendering — e.g. a semantic
label instead of the empty string `collectSidsWithPaths` returns for the
root — drives `walkSids` directly[^claude-md][^api-guide-extraction].

## Comparison operators

`COMPARISON_OPERATORS: Record<number, string>` is the exported C3 domain
fact mapping each bare `comparison` ACE parameter value to its operator
symbol (`0`=`=`, `1`=`≠`, `2`=`<`, `3`=`≤`, `4`=`>`, `5`=`≥`), version-pinned
to C3 r487. `comparisonSymbol(n)` looks up the symbol, returning `undefined`
for out-of-range values. The DSL renderer annotates a `comparison` parameter
with the symbol alongside the numeric value, keeping the number as the
round-trippable source form; out-of-range or non-numeric values render raw.
Owned here so downstream need not re-hardcode the magic numbers (issue
#39); keyed on parameter name, with no `objectClass` gate[^claude-md].

## Editor-strictness validation

`validateForEditor(sheet)` and `validateEventForEditor(event, jsonPath?)`
model the **C3 editor loader's required-field set**, which is stricter than
c3source's intentionally lenient parse types: fields like
`EventSheetVariable.comment`/`GroupEvent.description` are typed optional
here, but the C3 editor rejects the project on import with `Error: expected
string` if they are `undefined`[^claude-md][^api-guide-extraction].
Detection-only, no mutation; returns `EditorValidationIssue[]: {path, rule,
message}` where `path` is the same `jsonPath` produced by every other
c3source traversal, so it cannot drift[^claude-md].

**Rule semantics: an empty string passes.** The check is `typeof value ===
"string"`, so only `undefined`/non-string is flagged — matching the
originating incident (issue #33), where adding `comment: ""`/`description:
""` resolved the C3 import failures[^api-guide-extraction]. Two seed rules
ship: `eventvar-comment-required` (`variable` → `.comment`) and
`group-description-required` (`group` → `.description`); a third,
`custom-ace-name-required` (`custom-ace-block` → `.aceName`), was added in
issue #70 from a **direct C3-editor import experiment** — the table's only
non-incident-seeded rule[^claude-md]. That same experiment **disproved** the
corpus's strongest competing candidate for a fourth rule:
`function-block.functionDescription` is present on every instance in the
corpus and is still optional in C3's loader, so **corpus ubiquity is not
evidence of a loader requirement**, and an "always-present" field list is a
hypothesis generator, not a rule list[^claude-md]. C3's own diagnostics vary
sharply — a missing `comment` **crashes** the editor, a missing `aceName`
yields a generic "Failed to open project" naming no field — which is most of
why reporting the exact field plus `jsonPath` is worth doing[^claude-md].
`EDITOR_FIELD_RULES` is the exported, extensible fact table, following the
same convention as `EVENTVAR_REFERENCE_ACES`/`IMAGE_FILE_TYPE_EXTENSIONS`:
each new C3-load bug becomes a one-line rule addition[^api-guide-extraction].

## Expression references: `extractExpressionReferences`

`extractExpressionReferences(expr: string): ExpressionToken[]` is a
single-pass, stateful tokenizer over a raw C3 expression string (an
action/condition parameter value, not a DSL-rendered string), sibling to the
event-variable-reference classifiers above. It returns a flat,
source-ordered discriminated union — `reference` (an object/family/behavior
member access or call), `systemFunction` (a no-prefix call like `int(...)`),
`variable` (any other bare identifier) — tracking nesting with a general
**paren-frame stack**, one frame per open `(` whether or not it belongs to a
call, so every token gets a `parentIndex` pointing at the nearest enclosing
call token and every call token gets a best-effort `argCount` from its own
`(...)`[^claude-md][^api-guide-extraction].

Like the editor-strictness rules, it is **never-throws, best-effort**:
string literals (C3's `"…"` form, with `""` as the doubled-quote escape) are
skipped so refs inside quotes are never reported; nested-call and
operator-concatenated refs are never dropped; malformed input (an
unterminated string, a trailing `Sprite.`, unbalanced parens) degrades to a
partial or empty result rather than raising[^claude-md]. This is C3 *domain
grammar* owned here so downstream need not re-roll a tokenizer (cf.
`EVENTVAR_REFERENCE_ACES`/`isEventVarReference`) (issue #43)[^claude-md].

**Grammar-level only** — three things stay explicitly out of scope: it does
not resolve `objectName`/`behaviorName`/`memberName` to actual plugin,
behavior, or ACE ids (that requires the project's object-type model, never
loaded here); it does not decide which action/condition parameters hold
expression text in the first place (an ACE-parameter-type decision the
consumer makes before calling it); and it does not iterate event sheets
itself — call it per parameter value the consumer has already located,
typically via `visitEvents`[^api-guide-extraction].

## Related

- [Module Architecture](/module-architecture.md) — where `eventSheets` sits in the module DAG, as one of three mutually-independent siblings above `layouts`.
- [Layout Traversal](/layout-traversal.md) — the disk-walk layer that locates the event-sheet files this module reads.
- [Project Manifest](/project-manifest.md) — the pre-r402 `fileType` legacy-fallback pattern this module's `language`-field gap mirrors structurally.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide-extraction]: docs/api-guide-extraction.md (c3source API guide, 2026-08-20 capture)
</content>
