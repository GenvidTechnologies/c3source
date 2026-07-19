# API Guide: Event-Sheet Extraction

Reference for downstream consumers (build tools, analyzers, code generators)
that traverse C3 event sheets to extract scripts, functions, and include edges.
For SID traversal and editor-local classification see [api-guide.md](api-guide.md).

- [Core walk: `visitEvents`](#core-walk-visitevents)
- [Script extraction: `extractScriptsFromSheet`](#script-extraction-extractscriptsfromsheet)
- [Actions-only walk: `walkScriptActions`](#actions-only-walk-walkscriptactions)
- [Function discovery: `extractFunctions`](#function-discovery-extractfunctions)
- [Type guard: `isFunctionDefinition`](#type-guard-isfunctiondefinition)
- [Event-variable references: `isEventVarReference` / `getEventVarReferenceName`](#event-variable-references-iseventvarreference--geteventvarreferencename)
- [Expression references: `extractExpressionReferences`](#expression-references-extractexpressionreferences)
- [Include edges: `extractIncludes`](#include-edges-extractincludes)
- [Editor-strictness validation: `validateForEditor`](#editor-strictness-validation-validateforeditor)

---

## Core walk: `visitEvents`

```ts
visitEvents(events: EventSheetEvent[], visitor: EventVisitor): void

type EventVisitor = (event: EventSheetEvent, ctx: EventVisitContext) => void | boolean;

interface EventVisitContext {
  parent: EventSheetEvent[];   // the array this event lives in (for in-place mutation)
  index: number;               // index of this event within parent
  jsonPath: string;            // locator, e.g. "events[1].children[2]"
  eventNumber: number | null;  // C3's 1-based depth-first counter; null for non-counting events
  depth: number;               // nesting depth, 0 at the top level
}
```

`visitEvents` is the single canonical depth-first, pre-order walk over an event
tree. Every other function in this module builds on it.

**Counting vs. non-counting events.** C3 assigns a running 1-based number to
groups, blocks, function-blocks, and custom-ace-blocks. Variables, comments, and
includes do not increment the counter and receive `eventNumber: null`. This
matches the numbering C3 shows in its editor and that `generateFunctionName`
consumes — there is one counter, owned here, and all callers read from it rather
than maintaining a parallel one.

**Descent control.** Returning `false` from the visitor stops descent into that
event's children. Siblings and the rest of the tree continue unaffected. Omitting
a return value (or returning anything else) allows descent.

```ts
import { visitEvents } from "@genvidtech/c3source";

// Print every counting event's number and its json locator.
visitEvents(sheet.events, (event, ctx) => {
  if (ctx.eventNumber !== null) {
    console.log(`#${ctx.eventNumber}  ${ctx.jsonPath}  (${event.eventType})`);
  }
});
// #1  events[0]            (block)
// #2  events[0].children[0] (function-block)
// #3  events[1]            (group)
```

---

## Script extraction: `extractScriptsFromSheet`

```ts
extractScriptsFromSheet(sheet: EventSheet): ExtractedScript[]

interface ExtractedScript {
  humanPath: string;          // "GroupTitle > fn myFunc > block"
  sheetName: string;
  eventIndex: number;         // 1-based event number (from visitEvents)
  actionIndex: number;        // 1-based action index within the block
  lines: string[];            // script lines, CRLF-normalized to LF
  conditions: Condition[];    // conditions from the enclosing block
  scopeVars: Array<{ name: string; type: string }>;   // flat in-scope variables
  scopeSegments: ScopeSegment[];                       // hierarchical scope breakdown
}

interface ScopeSegment {
  label: string;      // e.g. "root", 'group "Title"', "fn myFunc params"
  scopeKey: string;   // full scope path for deduplication
  vars: Array<{ name: string; type: string }>;
}
```

Returns every TypeScript script action in the sheet, in canonical event order,
each annotated with C3 coordinates and lexical scope information.

**Coordinates.** `eventIndex` is the `eventNumber` assigned by `visitEvents`
(the same 1-based counter C3 uses). `actionIndex` is 1-based within the
enclosing block. These two numbers uniquely identify a script action and feed
`generateFunctionName`:

```ts
import { extractScriptsFromSheet, generateFunctionName } from "@genvidtech/c3source";

for (const script of extractScriptsFromSheet(sheet)) {
  const name = generateFunctionName(script.sheetName, script.eventIndex, script.actionIndex);
  // e.g. "GamePlay_Event3_Act1"
}
```

**Scope.** `scopeVars` is the flat list of all variables in scope at the point
of the script action — drawn from the enclosing function's parameters plus every
`variable` event declared at each ancestor level, collected before traversal so
declaration order does not matter (C3's own rule). `scopeSegments` breaks the
same information into labeled layers, useful for generating typed `localVars`
interfaces by scope level.

**Action formatting.** `extractScriptsFromSheet` does not render conditions or
other actions as text. For that use `formatAction` and `formatCondition`. See the
doc-comment on `formatAction` in `src/c3source.ts` for the full single-line DSL
grammar (standard, behavior, script, function-call, custom-ACE, comment, disabled
variants).

---

## Actions-only walk: `walkScriptActions`

```ts
walkScriptActions(sheet: EventSheet): ScriptAction[]

interface ScriptAction {
  type: "script";
  language: "typescript";
  script: string[];
}
```

Collects every TypeScript script action in canonical event order without scope or
coordinate information. Use this when you only need the raw script text and do
not need `eventIndex`, `actionIndex`, `humanPath`, or `scopeVars`.

```ts
import { walkScriptActions } from "@genvidtech/c3source";

const actions = walkScriptActions(sheet);
console.log(`${actions.length} script action(s) in ${sheet.name}`);
```

---

## Function discovery: `extractFunctions`

```ts
extractFunctions(sheet: EventSheet): ExtractedFunction[]

interface ExtractedFunction {
  kind: "function" | "custom-ace";
  name: string;
  objectClass?: string;   // present when kind === "custom-ace"
  params: FunctionParameter[];
  returnType: string;     // C3's raw string: "none" | "number" | "string"
}

interface FunctionParameter {
  name: string;
  type: "string" | "number" | "boolean";
  initialValue: string;
  comment?: string;
  sid: number;
}
```

Returns every function and custom-ACE definition declared in the sheet, in
canonical event order. For functions `name` is the function name; for custom-ACEs
`name` is the ACE name and `objectClass` is the owning plugin class.

A short example that renders a signature string from the structured data:

```ts
import { extractFunctions } from "@genvidtech/c3source";

for (const fn of extractFunctions(sheet)) {
  const sig = fn.params.map((p) => `${p.name}: ${p.type}`).join(", ");
  const owner = fn.objectClass ? `${fn.objectClass}.` : "";
  console.log(`${owner}${fn.name}(${sig}) → ${fn.returnType}`);
  // "OnDamage(amount: number, source: string) → none"
  // "Inventory.AddItem(id: string) → number"
}
```

`params` is a structured array rather than a pre-rendered string so the consumer
controls the format — whether that is a TypeScript signature, a markdown table,
or something else.

---

## Type guard: `isFunctionDefinition`

```ts
isFunctionDefinition(event: EventSheetEvent): event is FunctionBlockEvent | CustomAceBlockEvent
```

Narrows an `EventSheetEvent` to the two event types that declare a callable
signature. Use this when you drive `visitEvents` directly and need to branch on
definition events without a switch over `eventType`:

```ts
import { visitEvents, isFunctionDefinition } from "@genvidtech/c3source";

visitEvents(sheet.events, (event) => {
  if (isFunctionDefinition(event)) {
    // event is FunctionBlockEvent | CustomAceBlockEvent
    // event.functionParameters and event.functionReturnType are available
  }
});
```

---

## Event-variable references: `isEventVarReference` / `getEventVarReferenceName`

```ts
EVENTVAR_REFERENCE_ACES: Record<string, string>   // System ACE id → name-bearing param key

isEventVarReference(ace: Condition | ScriptAction | Record<string, unknown>): { nameParamKey: string } | null
getEventVarReferenceName(ace: Condition | ScriptAction | Record<string, unknown>): string | null
```

Classify a single action or condition: does it reference an event variable, and
under which parameter key is the variable name stored? This is C3 *domain
knowledge* — the set of System ACE ids that target event variables
(`set-eventvar-value`, `add-to-eventvar`, `compare-eventvar`,
`compare-boolean-eventvar`, …) drifts with C3 versions, so it is owned here
rather than re-hardcoded by every consumer that walks events.

**`EVENTVAR_REFERENCE_ACES`** is the canonical fact table mapping each known
System event-variable ACE id to the parameter key that holds the variable name
(currently `"variable"` for all of them). It is exported so consumers can
introspect or extend the set; the table is intentionally non-exhaustive across
every C3 version.

**`isEventVarReference`** returns `{ nameParamKey }` when `ace.objectClass ===
"System"` and `ace.id` is in the table, else `null`. The locator is a parameter
**key**, not a positional index, because c3source stores ACE parameters as a
keyed `Record<string, unknown>` (the same shape `formatAction`/`formatCondition`
iterate). Gating on `"System"` avoids false positives from a plugin that happens
to reuse a known id.

**`getEventVarReferenceName`** resolves the name directly: it classifies, then
reads `ace.parameters[nameParamKey]`, returning the string or `null` when
`parameters` is absent or the value is not a string.

```ts
import { visitEvents, hasConditions, hasActions, getEventVarReferenceName } from "@genvidtech/c3source";

// Collect every event-variable name referenced anywhere in a sheet.
const referenced: string[] = [];
visitEvents(sheet.events, (event) => {
  if (hasConditions(event)) for (const c of event.conditions) {
    const name = getEventVarReferenceName(c);
    if (name) referenced.push(name);
  }
  if (hasActions(event)) for (const a of event.actions) {
    const name = getEventVarReferenceName(a);
    if (name) referenced.push(name);
  }
});
```

**Scope resolution is the caller's job.** This classifier answers only "which
variable name is referenced here". Mapping a referenced name to its declaration
— including lexical shadowing, where a local variable shadows a same-named
global — is presentation/analysis logic that belongs in the consumer (a
`variable` event at the sheet root is global; nested, it is local).

---

## Expression references: `extractExpressionReferences`

```ts
extractExpressionReferences(expr: string): ExpressionToken[]

type ExpressionTokenKind = "reference" | "systemFunction" | "variable";

interface ExpressionTokenBase {
  kind: ExpressionTokenKind;
  start: number;          // character span [start, end) within `expr`
  end: number;
  parentIndex?: number;   // array index of the nearest enclosing call token; absent at top level
}

interface ExpressionReferenceToken extends ExpressionTokenBase {
  kind: "reference";
  objectName: string;
  behaviorName?: string;  // present for Object.Behavior.member
  memberName: string;
  isCall: boolean;        // true for member(...) call form
  argCount?: number;      // top-level arg count in this token's own (...), present when isCall
}

interface SystemFunctionToken extends ExpressionTokenBase {
  kind: "systemFunction";
  name: string;
  argCount?: number;      // top-level arg count in this token's own (...)
}

interface VariableToken extends ExpressionTokenBase {
  kind: "variable";
  name: string;
}
```

Sibling to [`isEventVarReference`](#event-variable-references-iseventvarreference--geteventvarreferencename):
where that classifier answers "does this ACE reference an event variable",
`extractExpressionReferences` answers "what does this raw expression *string*
reference" — the parameter values that hold expressions (as opposed to the
System-ACE parameters that hold a bare variable name) are unstructured C3
expression text, and this is the tokenizer over that text.

**Token kinds**, in source order (ascending `start`):

- **`reference`** — an object/family/behavior member reference:
  `Object.member` (bare) or `Object.Behavior.member`, either as a bare
  property access or a call (`member(...)`, `isCall: true`).
- **`systemFunction`** — a no-prefix call: `int(...)`, `random(...)`,
  `len(...)`.
- **`variable`** — any other bare identifier: a local variable, a function
  parameter, or a C3 keyword. `extractExpressionReferences` does not attempt
  to resolve which — that is scope-resolution work, same as
  `getEventVarReferenceName`'s "scope resolution is the caller's job" note
  above.

**Contract.**

- **Never throws.** Malformed input — an unterminated string, a trailing
  `Sprite.`, unbalanced parens, an empty string — degrades to a partial or
  empty result rather than raising.
- **String-literal aware.** C3's double-quote string form (`"…"`, with `""`
  as the doubled-quote escape for an embedded quote) is skipped as scan
  content, so a `Name.member`-shaped substring inside a string literal is
  never reported as a reference.
- **Nothing nested is dropped.** A reference or system-function call nested
  inside another call, or joined by an operator (`&`, `+`, …), is still
  reported — the flat return array is simply longer, in source order.
- **Nesting metadata.** `parentIndex` is the array index of the nearest
  enclosing call token (a `reference` with `isCall: true`, or a
  `systemFunction`), tracked via a paren-frame stack so it correctly skips
  over plain grouping parens; it is absent for a top-level token.
  `argCount` is the top-level argument count of a call token's own `(...)`
  (commas inside a nested call never inflate the outer count), present only
  when the token is a call.

**Worked example.**

```ts
import { extractExpressionReferences } from "@genvidtech/c3source";

extractExpressionReferences("int(Clock.Elapsed) & Player.Platform.VectorX");
// [
//   { kind: "systemFunction", name: "int",
//     start: 0, end: 3, argCount: 1 },                       // parentIndex absent (top-level)
//   { kind: "reference", objectName: "Clock", memberName: "Elapsed",
//     isCall: false, start: 4, end: 17, parentIndex: 0 },     // nested in int(...)
//   { kind: "reference", objectName: "Player", behaviorName: "Platform", memberName: "VectorX",
//     isCall: false, start: 21, end: 44 },                    // parentIndex absent (top-level, joined by &)
// ]
```

The `int(...)` call's `argCount` is `1` because its own `(...)` contains one
top-level argument (`Clock.Elapsed`); `Clock.Elapsed`'s `parentIndex: 0`
points back at that call. `Player.Platform.VectorX` is joined by `&`
(operator concatenation) rather than nested inside a call, so it has no
`parentIndex` and — being a bare property access, not a call — no
`argCount`.

**Out of scope.** `extractExpressionReferences` is grammar-level only:

- It does **not** resolve `objectName`/`behaviorName`/`memberName` to actual
  plugin, behavior, or ACE ids — that requires the project's object-type
  model, which the tokenizer never loads.
- It does **not** decide which action/condition parameters hold expression
  text in the first place (versus a bare number, a combo index, or a plain
  string) — that is an ACE-parameter-type decision the consumer makes before
  calling it.
- It does **not** iterate event sheets — call it per parameter value the
  consumer has already located, typically by walking a sheet with
  [`visitEvents`](#core-walk-visitevents).

---

## Include edges: `extractIncludes`

```ts
extractIncludes(sheet: EventSheet): IncludeReference[]

interface IncludeReference {
  includeSheet: string;   // name of the included event sheet
  jsonPath: string;       // locator of the include event, e.g. "events[2]"
}
```

Returns every include edge declared in the sheet, in canonical event order. An
include is a non-counting event (its `eventNumber` is `null`), so `jsonPath` is
its canonical locator within the tree.

```ts
import { extractIncludes } from "@genvidtech/c3source";

for (const ref of extractIncludes(sheet)) {
  console.log(`${sheet.name} → ${ref.includeSheet}  (at ${ref.jsonPath})`);
}
// "GamePlay → SharedMacros  (at events[0])"
// "GamePlay → UIHelpers     (at events[5].children[1])"
```

**Dependency graph.** The primary downstream use case is building a cross-sheet
dependency graph. Collect `extractIncludes` for every sheet in the project, then
group by sheet name to get each sheet's direct dependencies. Because includes can
appear at any nesting depth (including inside groups or blocks), `jsonPath`
locates each edge precisely — useful for error reporting and for tools that
navigate to a specific include in the source tree.

---

## Editor-strictness validation: `validateForEditor`

```ts
validateForEditor(sheet: EventSheet): EditorValidationIssue[]
validateEventForEditor(event: EventSheetEvent, jsonPath?: string): EditorValidationIssue[]

interface EditorValidationIssue {
  path: string;    // visitEvents jsonPath, e.g. "events[1].children[2]"
  rule: string;    // stable rule id, e.g. "group-description-required"
  message: string; // human-readable reason the C3 editor would reject this
}

interface EditorFieldRule {
  rule: string;
  eventType: EventSheetEvent["eventType"];  // fast dispatch — rule only fires for matching type
  check: (event: EventSheetEvent) => string | null;  // returns message or null if valid
}

EDITOR_FIELD_RULES: EditorFieldRule[]   // exported, extensible domain-fact table
```

Models the **C3 editor loader's required-field set**, which is stricter than
c3source's intentionally lenient parse types. Fields like `EventSheetVariable.comment`
and `GroupEvent.description` are typed optional in c3source, but the C3 editor
rejects the project on import with `Error: expected string` if they are `undefined`.
This validator detects those mismatches without mutating anything — detection-only,
no auto-fix.

**Rule semantics.** The check is `typeof value === "string"`, so an **empty string
passes** — only `undefined` or a non-string value is flagged. This matches the
originating incident (#33): adding `comment: ""` / `description: ""` resolved the
C3 import failures.

**Two seed rules** are included:

| Rule id | Event type | Field checked |
|---|---|---|
| `eventvar-comment-required` | `"variable"` | `EventSheetVariable.comment` |
| `group-description-required` | `"group"` | `GroupEvent.description` |

**`validateForEditor`** is a thin consumer of the canonical `visitEvents` walk.
Issue `path` values are the same `jsonPath` coordinates produced by every other
c3source traversal, so they cannot drift.

**`validateEventForEditor`** validates a single detached event outside a sheet
walk. The optional `jsonPath` argument (default `"event"`) is used verbatim in the
returned issue paths — pass the locator from a surrounding `visitEvents` call if
you are integrating the check into your own walk.

**`EDITOR_FIELD_RULES`** is the exported fact table. Following the same convention
as `EVENTVAR_REFERENCE_ACES` and `IMAGE_FILE_TYPE_EXTENSIONS`, it is owned here so
downstream need not re-hardcode it; each new C3-load bug that surfaces a
required-field constraint becomes a one-line rule addition to the table.

```ts
import { validateForEditor } from "@genvidtech/c3source";

const issues = validateForEditor(sheet);
if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`[${issue.rule}] ${issue.path}: ${issue.message}`);
  }
  // [group-description-required] events[2]: GroupEvent.description must be a string (C3 editor rejects undefined on import)
}
```

To validate every sheet in a project and assert no issues exist (e.g. in a fixture
test):

```ts
import { find_all_event_sheet_path, readEventSheet, validateForEditor } from "@genvidtech/c3source";

const allIssues = find_all_event_sheet_path(projectDir)
  .flatMap((p) => validateForEditor(readEventSheet(p)));

assert.deepEqual(allIssues, [], "project has editor-load violations");
```

**Extending the table.** To contribute a rule specific to your downstream use
case, push an `EditorFieldRule` onto `EDITOR_FIELD_RULES` before running
validation. Mutating the exported array is intentional — the table is designed to
grow as new C3 loader requirements are discovered.
