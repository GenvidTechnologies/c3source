# API Guide: Event-Sheet Extraction

Reference for downstream consumers (build tools, analyzers, code generators)
that traverse C3 event sheets to extract scripts, functions, and include edges.
For SID traversal and editor-local classification see [api-guide.md](api-guide.md).

- [Core walk: `visitEvents`](#core-walk-visitevents)
- [Script extraction: `extractScriptsFromSheet`](#script-extraction-extractscriptsfromsheet)
- [Actions-only walk: `walkScriptActions`](#actions-only-walk-walkscriptactions)
- [Function discovery: `extractFunctions`](#function-discovery-extractfunctions)
- [Type guard: `isFunctionDefinition`](#type-guard-isfunctiondefinition)
- [Include edges: `extractIncludes`](#include-edges-extractincludes)

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
import { visitEvents } from "@genvid/c3source";

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
import { extractScriptsFromSheet, generateFunctionName } from "@genvid/c3source";

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
import { walkScriptActions } from "@genvid/c3source";

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
import { extractFunctions } from "@genvid/c3source";

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
import { visitEvents, isFunctionDefinition } from "@genvid/c3source";

visitEvents(sheet.events, (event) => {
  if (isFunctionDefinition(event)) {
    // event is FunctionBlockEvent | CustomAceBlockEvent
    // event.functionParameters and event.functionReturnType are available
  }
});
```

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
import { extractIncludes } from "@genvid/c3source";

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
