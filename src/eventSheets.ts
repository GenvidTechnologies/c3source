import { find_all_files_path, isEditorLocalPath, normalizeLineEndings } from "./layouts.js";

// --- EventSheet Types ---

export interface EventSheetVariable {
  eventType: "variable";
  name: string;
  type: "string" | "number" | "boolean";
  initialValue: string;
  comment?: string;
  isStatic: boolean;
  isConstant: boolean;
  sid: number;
}

export interface ScriptAction {
  type: "script";
  language: "typescript";
  script: string[];
}

export interface Condition {
  id: string;
  objectClass: string;
  sid: number;
  parameters?: Record<string, unknown>;
  isInverted?: boolean;
  behaviorType?: string;
  disabled?: boolean;
}

export interface FunctionParameter {
  name: string;
  type: "string" | "number" | "boolean";
  initialValue: string;
  comment?: string;
  sid: number;
}

export interface BlockEvent {
  eventType: "block";
  conditions: Condition[];
  actions: (ScriptAction | Record<string, unknown>)[];
  sid: number;
  children?: EventSheetEvent[];
  disabled?: boolean;
  isOrBlock?: boolean;
}

/** Shared fields for function-block and custom-ace-block event types. */
interface FunctionLikeEvent {
  functionDescription?: string;
  functionCategory?: string;
  functionReturnType: string;
  functionCopyPicked: boolean;
  functionIsAsync: boolean;
  functionParameters: FunctionParameter[];
  conditions: Condition[];
  actions: (ScriptAction | Record<string, unknown>)[];
  sid: number;
  children?: EventSheetEvent[];
  disabled?: boolean;
}

export interface FunctionBlockEvent extends FunctionLikeEvent {
  eventType: "function-block";
  functionName: string;
}

export interface CustomAceBlockEvent extends FunctionLikeEvent {
  eventType: "custom-ace-block";
  aceType: string;
  aceName: string;
  objectClass: string;
}

export interface GroupEvent {
  eventType: "group";
  disabled: boolean;
  title: string;
  description?: string;
  isActiveOnStart: boolean;
  children: EventSheetEvent[];
  sid: number;
}

export interface IncludeEvent {
  eventType: "include";
  includeSheet: string;
}

export interface CommentEvent {
  eventType: "comment";
  text: string;
}

export type EventSheetEvent =
  | EventSheetVariable
  | BlockEvent
  | FunctionBlockEvent
  | CustomAceBlockEvent
  | GroupEvent
  | IncludeEvent
  | CommentEvent;

export interface EventSheet {
  name: string;
  events: EventSheetEvent[];
  sid: number;
}

/** A named scope level contributing variables to a function's localVars type. */
export interface ScopeSegment {
  /** Immediate scope identifier: "root", 'group "Title"', 'fn funcName params', 'fn funcName' */
  label: string;
  /** Full scope path for deduplication: "root", 'root > group "Title"', etc. */
  scopeKey: string;
  /** Variables declared at this scope level. */
  vars: Array<{ name: string; type: string }>;
}

/** Info about a script block extracted during traversal. */
export interface ExtractedScript {
  /** Human-readable path: "GroupTitle > SubGroup > functionName > block" */
  humanPath: string;
  /** EventSheet name */
  sheetName: string;
  /** 1-indexed event number (depth-first traversal) */
  eventIndex: number;
  /** 1-indexed action number within the block */
  actionIndex: number;
  /** Script lines */
  lines: string[];
  /** Conditions from the enclosing block (for context comments) */
  conditions: Condition[];
  /** Flat list of all in-scope variables (derived from scopeSegments). */
  scopeVars: Array<{ name: string; type: string }>;
  /** Hierarchical scope segments for typed localVars composition. */
  scopeSegments: ScopeSegment[];
}

/**
 * Find all eventSheet JSON files (excluding .uistate.json) in a directory tree.
 */
export function find_all_eventsheets_path(eventSheetsDir: string): string[] {
  return find_all_files_path(eventSheetsDir, (file) => file.endsWith(".json") && !isEditorLocalPath(file));
}

export function isScriptAction(action: ScriptAction | Record<string, unknown>): action is ScriptAction {
  return (action as ScriptAction).type === "script" && (action as ScriptAction).language === "typescript";
}

/**
 * Format a condition into the single-line DSL: `ObjectClass.id(param=value, ...)`.
 * - Inverted: prefix with `NOT `
 * - Disabled: prefix with `[DISABLED] ` (mirrors formatAction so consumers
 *   need not wrap this call). Output changes for disabled conditions.
 */
export function formatCondition(cond: Condition): string {
  const disabled = cond.disabled ? "[DISABLED] " : "";
  const inverted = cond.isInverted ? "NOT " : "";
  const params = cond.parameters
    ? Object.entries(cond.parameters)
        .map(([k, v]) => `${k}=${v}${comparisonSuffix(k, v)}`)
        .join(", ")
    : "";
  return `${disabled}${inverted}${cond.objectClass}.${cond.id}(${params})`;
}

/**
 * Format an action object into a single-line (or multi-line for scripts) DSL string.
 *
 * Action shapes:
 * - Standard: `ObjectClass.actionId(param=value, ...)`
 * - Standard + behavior: `ObjectClass[BehaviorType].actionId(param=value, ...)`
 * - Script (single-line): `script { code }`
 * - Script (multi-line): `script { // → FuncName\n  line1\n  line2\n}`
 * - Function call: `call functionName(arg1, arg2)`
 * - Custom ACE: `ace ObjectClass.customActionName(param=value, ...)`
 * - Comment: `// commentText`
 * - Disabled: prefix with `[DISABLED] `
 * - Unknown: `[unknown action: {JSON keys}]`
 */
export function formatAction(
  action: ScriptAction | Record<string, unknown>,
  sheetName: string,
  eventIndex: number,
  actionIndex: number,
): string {
  const disabled = "disabled" in action && action.disabled === true;
  const result = formatActionInner(action, sheetName, eventIndex, actionIndex);
  return disabled ? `[DISABLED] ${result}` : result;
}

function comparisonSuffix(key: string, value: unknown): string {
  if (key !== "comparison" || typeof value !== "number") return "";
  const sym = comparisonSymbol(value);
  return sym ? ` (${sym})` : "";
}

function formatRecordParams(parameters: Record<string, unknown> | undefined): string {
  if (!parameters) return "";
  return Object.entries(parameters)
    .map(([k, v]) => `${k}=${normalizeLineEndings(String(v))}${comparisonSuffix(k, v)}`)
    .join(", ");
}

function formatActionInner(
  action: ScriptAction | Record<string, unknown>,
  sheetName: string,
  eventIndex: number,
  actionIndex: number,
): string {
  // Comment action — same format as event-level comments
  if ("type" in action && action.type === "comment") {
    const text = (action as Record<string, unknown>).text as string;
    return normalizeLineEndings(text)
      .split("\n")
      .map((line) => `// ${line}`)
      .join("\n");
  }

  // Script action
  if (isScriptAction(action)) {
    const lines = action.script.map(normalizeLineEndings);
    if (lines.length === 1) {
      return `script { ${lines[0]} }`;
    }
    const funcName = generateFunctionName(sheetName, eventIndex, actionIndex);
    const indented = lines.map((line) => `  ${line}`).join("\n");
    return `script { // \u2192 ${funcName}\n${indented}\n}`;
  }

  // Function call action
  if ("callFunction" in action) {
    const name = action.callFunction as string;
    const params = action.parameters as string[] | undefined;
    const paramStr = params && params.length > 0 ? params.map((p) => normalizeLineEndings(String(p))).join(", ") : "";
    return `call ${name}(${paramStr})`;
  }

  // Custom action — prefixed with `ace` to distinguish from plugin actions
  if ("customAction" in action) {
    const objectClass = action.objectClass as string;
    const customAction = action.customAction as string;
    const params = formatRecordParams(action.parameters as Record<string, unknown> | undefined);
    return `ace ${objectClass}.${customAction}(${params})`;
  }

  // Standard action (has id + objectClass)
  if ("id" in action && "objectClass" in action) {
    const objectClass = action.objectClass as string;
    const id = action.id as string;
    const behaviorType = action.behaviorType as string | undefined;
    const params = formatRecordParams(action.parameters as Record<string, unknown> | undefined);
    const prefix = behaviorType ? `${objectClass}[${behaviorType}]` : objectClass;
    return `${prefix}.${id}(${params})`;
  }

  // Unknown action
  const keys = Object.keys(action).join(", ");
  return `[unknown action: ${keys}]`;
}

/**
 * Presence check: true when the event currently holds a `children` array that
 * can be iterated right now. This is the *traversal* predicate — `visitEvents`
 * relies on it so it never recurses into a childless node. It is deliberately
 * NOT type-based: a child-capable event whose `children` key has not been
 * created yet returns `false` here. For the *capability* question ("is this an
 * event kind allowed to hold children?"), use {@link canHaveChildren}.
 */
export function hasChildren(event: EventSheetEvent): event is EventSheetEvent & { children: EventSheetEvent[] } {
  return Array.isArray((event as { children?: unknown }).children);
}

/**
 * Capability check: true for event kinds that are allowed to hold children
 * (block / function-block / custom-ace-block / group), whether or not a
 * `children` array currently exists. This is the *mutation* predicate — a
 * consumer that inserts a child uses it to tell "this kind can't have children
 * at all" (comment / variable / include) apart from "this kind can have
 * children but the array hasn't been created yet", then creates the array
 * before inserting. Type-based and distinct from {@link hasChildren}, which is
 * presence-based and used for traversal.
 */
export function canHaveChildren(
  event: EventSheetEvent,
): event is BlockEvent | FunctionBlockEvent | CustomAceBlockEvent | GroupEvent {
  return (
    event.eventType === "block" ||
    event.eventType === "function-block" ||
    event.eventType === "custom-ace-block" ||
    event.eventType === "group"
  );
}

/** The event types that carry both `conditions` and `actions` arrays. */
function isBlockLikeEvent(event: EventSheetEvent): event is BlockEvent | FunctionBlockEvent | CustomAceBlockEvent {
  return event.eventType === "block" || event.eventType === "function-block" || event.eventType === "custom-ace-block";
}

/** Event types that carry an `actions` array (block / function-block / custom-ace-block). */
export function hasActions(event: EventSheetEvent): event is BlockEvent | FunctionBlockEvent | CustomAceBlockEvent {
  return isBlockLikeEvent(event);
}

/** Event types that carry a `conditions` array (block / function-block / custom-ace-block). */
export function hasConditions(event: EventSheetEvent): event is BlockEvent | FunctionBlockEvent | CustomAceBlockEvent {
  return isBlockLikeEvent(event);
}

/**
 * Event types that increment C3's depth-first event counter (the 1-based
 * number C3 shows in its editor and that `generateFunctionName` consumes).
 * variable / comment / include do NOT count.
 */
function isCountingEvent(event: EventSheetEvent): boolean {
  return (
    event.eventType === "group" ||
    event.eventType === "block" ||
    event.eventType === "function-block" ||
    event.eventType === "custom-ace-block"
  );
}

export interface EventVisitContext {
  /** The array this event lives in (for in-place mutation). */
  parent: EventSheetEvent[];
  /** Index of this event within `parent`. */
  index: number;
  /** Locator, e.g. "events[1].children[2]". */
  jsonPath: string;
  /** C3's 1-based event number; null for non-counting events (variable/comment/include). */
  eventNumber: number | null;
  /** Nesting depth, 0 at the top level. */
  depth: number;
}

/** Returning `false` stops descent into THIS event's children; siblings and the rest of the tree continue. */
export type EventVisitor = (event: EventSheetEvent, ctx: EventVisitContext) => void | boolean;

/**
 * Depth-first, pre-order walk of an event tree that assigns each counting
 * event the same 1-based `eventNumber` that `extractScriptsFromSheet` /
 * `generateFunctionName` use — the single canonical C3 coordinate counter.
 */
export function visitEvents(events: EventSheetEvent[], visitor: EventVisitor): void {
  const counter = { value: 0 };
  function recurse(list: EventSheetEvent[], parentPath: string, depth: number): void {
    list.forEach((event, index) => {
      const jsonPath = `${parentPath}[${index}]`;
      const eventNumber = isCountingEvent(event) ? ++counter.value : null;
      const descend = visitor(event, { parent: list, index, jsonPath, eventNumber, depth });
      if (descend !== false && hasChildren(event)) {
        recurse(event.children, `${jsonPath}.children`, depth + 1);
      }
    });
  }
  recurse(events, "events", 0);
}

/**
 * Collect every typescript script action in a sheet, in canonical event order.
 * Sibling of extractScriptsFromSheet for callers that only need the actions
 * (not the coordinates/scope). Reuses the visitEvents traversal.
 */
export function walkScriptActions(sheet: EventSheet): ScriptAction[] {
  const scripts: ScriptAction[] = [];
  visitEvents(sheet.events, (event) => {
    if (hasActions(event)) {
      for (const action of event.actions) {
        if (isScriptAction(action)) {
          scripts.push(action);
        }
      }
    }
  });
  return scripts;
}

/**
 * Traverse an eventSheet and extract all script blocks with C3 coordinates and scope info.
 */
export function extractScriptsFromSheet(sheet: EventSheet): ExtractedScript[] {
  const results: ExtractedScript[] = [];
  // Single source of truth for C3 event numbering: visitEvents assigns the
  // canonical 1-based number to every counting event. We read each block's
  // number from this map rather than maintaining a parallel counter, so this
  // function and visitEvents/generateFunctionName can never drift.
  const eventNumbers = new Map<EventSheetEvent, number>();
  visitEvents(sheet.events, (event, ctx) => {
    if (ctx.eventNumber !== null) {
      eventNumbers.set(event, ctx.eventNumber);
    }
  });

  function traverse(
    events: EventSheetEvent[],
    pathParts: string[],
    parentSegments: ScopeSegment[],
    scopeLabel: string,
    parentScopeKey: string,
  ): void {
    // In C3, all variables declared at a level are in scope for all blocks at that level,
    // regardless of declaration order. Pre-collect them all before traversing.
    const levelVars = events
      .filter((e): e is EventSheetEvent & { eventType: "variable" } => e.eventType === "variable")
      .map((e) => ({ name: e.name, type: e.type }));

    const currentScopeKey = parentScopeKey ? `${parentScopeKey} > ${scopeLabel}` : scopeLabel;

    // Add a segment for this level's vars (if any)
    const segments =
      levelVars.length > 0
        ? [...parentSegments, { label: scopeLabel, scopeKey: currentScopeKey, vars: levelVars }]
        : parentSegments;

    for (const event of events) {
      if (event.eventType === "variable") {
        continue;
      }

      if (event.eventType === "comment" || event.eventType === "include") {
        continue;
      }

      if (event.eventType === "group") {
        // Groups count as events in C3's depth-first numbering (number tracked by visitEvents)
        const groupLabel = `group "${event.title}"`;
        traverse(event.children ?? [], [...pathParts, event.title], segments, groupLabel, currentScopeKey);
        continue;
      }

      // block, function-block, custom-ace-block all count as events
      const currentEventIndex = eventNumbers.get(event)!;

      let blockLabel: string;
      let blockSegments = segments;

      if (event.eventType === "function-block") {
        blockLabel = `fn ${event.functionName}`;
        const params = event.functionParameters.map((p) => ({ name: p.name, type: p.type }));
        if (params.length > 0) {
          const paramsLabel = `fn ${event.functionName} params`;
          const paramsScopeKey = `${currentScopeKey} > ${paramsLabel}`;
          blockSegments = [...segments, { label: paramsLabel, scopeKey: paramsScopeKey, vars: params }];
        }
      } else if (event.eventType === "custom-ace-block") {
        blockLabel = `${event.objectClass}.${event.aceName}`;
        const params = event.functionParameters.map((p) => ({ name: p.name, type: p.type }));
        if (params.length > 0) {
          const paramsLabel = `${event.objectClass}.${event.aceName} params`;
          const paramsScopeKey = `${currentScopeKey} > ${paramsLabel}`;
          blockSegments = [...segments, { label: paramsLabel, scopeKey: paramsScopeKey, vars: params }];
        }
      } else {
        blockLabel = "block";
      }

      const currentPath = [...pathParts, blockLabel];
      const scopeVars = blockSegments.flatMap((s) => s.vars);

      // Extract script actions
      for (let i = 0; i < event.actions.length; i++) {
        const action = event.actions[i];
        if (isScriptAction(action)) {
          results.push({
            humanPath: currentPath.join(" > "),
            sheetName: sheet.name,
            eventIndex: currentEventIndex,
            actionIndex: i + 1, // 1-indexed
            lines: action.script.map(normalizeLineEndings),
            conditions: event.conditions,
            scopeVars,
            scopeSegments: blockSegments,
          });
        }
      }

      // Recurse into children
      if (event.children) {
        const childScopeLabel =
          event.eventType === "function-block"
            ? `fn ${event.functionName}`
            : event.eventType === "custom-ace-block"
              ? `${event.objectClass}.${event.aceName}`
              : "block";
        // For regular blocks, include event counter in parent key to disambiguate
        // sibling blocks that would otherwise share the same scope key.
        // Functions/ACEs use their unique names so don't need this.
        const childParentKey =
          event.eventType === "function-block" || event.eventType === "custom-ace-block"
            ? currentScopeKey
            : `${currentScopeKey}#${currentEventIndex}`;
        traverse(event.children, currentPath, blockSegments, childScopeLabel, childParentKey);
      }
    }
  }

  traverse(sheet.events, [], [], "root", "");
  return results;
}

/**
 * Generate a function name for an extracted script block.
 * Format: SheetName_EventN_ActN (sanitized for valid JS identifiers).
 */
export function generateFunctionName(sheetName: string, eventIndex: number, actionIndex: number): string {
  let sanitized = sheetName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!sanitized || /^\d/.test(sanitized)) {
    sanitized = sanitized ? `_${sanitized}` : "Sheet";
  }
  return `${sanitized}_Event${eventIndex}_Act${actionIndex}`;
}

/** A function or custom-ACE definition declared in an event sheet. */
export interface ExtractedFunction {
  kind: "function" | "custom-ace";
  name: string;
  /** Owning object class (custom-ACEs only). */
  objectClass?: string;
  /** Declared parameters, in order. Structured so the consumer owns formatting. */
  params: FunctionParameter[];
  /** Declared return type (C3's raw string, e.g. "none" | "number" | "string"). */
  returnType: string;
}

/** System event-variable ACE id -> the parameter key that holds the variable name.
 *  A C3 platform fact that drifts with C3 versions, owned here so downstream
 *  need not re-hardcode it (issue #26). Exported so callers can introspect/extend. */
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

/**
 * Returns `{ nameParamKey }` when `ace` is a System event-variable ACE —
 * i.e. `objectClass === "System"` and `id` is a key in {@link EVENTVAR_REFERENCE_ACES}.
 * Returns `null` for any other ACE, script action, comment, etc.
 * Gating on `"System"` avoids false positives from a plugin reusing a known id.
 */
export function isEventVarReference(
  ace: Condition | ScriptAction | Record<string, unknown>,
): { nameParamKey: string } | null {
  if (!("id" in ace) || !("objectClass" in ace)) return null;
  const id = (ace as Record<string, unknown>).id as string;
  const objectClass = (ace as Record<string, unknown>).objectClass as string;
  if (objectClass !== "System") return null;
  const nameParamKey = EVENTVAR_REFERENCE_ACES[id];
  if (nameParamKey === undefined) return null;
  return { nameParamKey };
}

/**
 * Returns the event-variable name referenced by `ace`, or `null` if:
 * - `ace` is not a System event-variable ACE (delegates to {@link isEventVarReference}), or
 * - the expected `parameters[nameParamKey]` entry is absent or not a string.
 * No line-ending normalization — variable names are plain identifiers.
 */
export function getEventVarReferenceName(ace: Condition | ScriptAction | Record<string, unknown>): string | null {
  const ref = isEventVarReference(ace);
  if (ref === null) return null;
  const parameters = (ace as Record<string, unknown>).parameters as Record<string, unknown> | undefined;
  if (!parameters) return null;
  const value = parameters[ref.nameParamKey];
  return typeof value === "string" ? value : null;
}

/** Shared span/linkage fields for every {@link ExpressionToken} variant. */
export type ExpressionTokenKind = "reference" | "systemFunction" | "variable";

interface ExpressionTokenBase {
  kind: ExpressionTokenKind;
  /** Character span [start, end) within the input expression string. */
  start: number;
  end: number;
  /** Index (into the returned array) of the nearest enclosing call token — a `reference` with
   *  `isCall: true`, or a `systemFunction` — whose `(...)` argument list lexically contains this
   *  token; absent at top level. */
  parentIndex?: number;
}

/** An object/family/behavior member reference: `Object.member`, `Object.Behavior.member`, or their call forms. */
export interface ExpressionReferenceToken extends ExpressionTokenBase {
  kind: "reference";
  objectName: string;
  behaviorName?: string;
  memberName: string;
  /** True for call form `member(...)`; false for a bare property access. */
  isCall: boolean;
  /** Top-level argument count in this token's own `(...)` when `isCall`; absent otherwise. */
  argCount?: number;
}

/** A no-prefix system function call: `int(...)`, `random(...)`, `len(...)`, … */
export interface SystemFunctionToken extends ExpressionTokenBase {
  kind: "systemFunction";
  name: string;
  /** Top-level argument count in this token's own `(...)`. */
  argCount?: number;
}

/** A bare identifier that is neither object-prefixed nor a call — a local/parameter
 *  variable or keyword; further classification is the consumer's job. */
export interface VariableToken extends ExpressionTokenBase {
  kind: "variable";
  name: string;
}

export type ExpressionToken = ExpressionReferenceToken | SystemFunctionToken | VariableToken;

const IDENT_START_RE = /[A-Za-z_]/;
const IDENT_PART_RE = /[A-Za-z0-9_]/;
const DIGIT_RE = /[0-9]/;
const NUMBER_RE = /^\d+(\.\d+)?([eE][+-]?\d+)?/;

/** True when `c` (a single character, or `""` past the end of input) can start an identifier. */
function isIdentStartChar(c: string): boolean {
  return IDENT_START_RE.test(c);
}

/**
 * Single-pass, best-effort tokenizer over a raw C3 expression string (an action/condition
 * parameter value, not a DSL-rendered string). Recognizes three token kinds in source order
 * (ascending `start`):
 *
 * - **`reference`** — `Object.member` or `Object.Behavior.member`, bare or in call form
 *   (`member(...)`). Deeper dotted chains (`Name.a.b.c`, dictionary/array indexing) are
 *   tolerated: the leading 2- or 3-segment shape is extracted as the token and the scan
 *   resumes right after it, so trailing segments are just scanned as ordinary text (never a
 *   crash, never a swallowed remainder).
 * - **`systemFunction`** — a bare identifier immediately followed by `(` with no preceding
 *   `.` (e.g. `int(`, `random(`, `len(`).
 * - **`variable`** — any other bare identifier (local var, parameter, or keyword;
 *   c3source does not attempt to resolve declaration scope here).
 *
 * String literals are C3's double-quote form (`"…"`) with `""` as the doubled-quote escape
 * for an embedded quote; a single quote is never a string delimiter. Any `Name.member`-shaped
 * text inside a string literal is skipped — it is not source, so it never yields a token.
 * Numbers and whitespace/punctuation are skipped without producing tokens.
 *
 * This function **never throws**: malformed input (an unterminated string, a trailing `Sprite.`,
 * unbalanced parens, an empty string) degrades to a partial or empty result rather than raising.
 *
 * Nesting metadata is tracked with a general paren-frame stack (one frame per open `(`, whether
 * or not it belongs to a call): a frame opened by a call token (`systemFunction`, or `reference`
 * with `isCall: true`) carries that token's array index; a plain grouping paren's frame carries
 * none. Every token pushed while the stack is non-empty gets `parentIndex` set to the nearest
 * enclosing frame that *does* carry a token index (skipping intervening plain-group frames), so
 * a reference nested inside `foo((a + Bar.X))` still parents to `foo`. On the matching `)`, a
 * call frame's `argCount` is finalized from the source slice between its `(` and `)`: `0` when
 * that slice is blank, else `1 +` the number of top-level commas seen directly inside it (a `,`
 * only increments the frame that is on top of the stack at the time, so commas nested in an
 * inner call/group never inflate an outer frame's count). Unbalanced parens never throw: any
 * frames still open at end-of-input are finalized best-effort against the remaining tail.
 */
export function extractExpressionReferences(expr: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  const len = expr.length;
  let i = 0;

  interface ParenFrame {
    /** Index into `tokens` of the call token this frame's `(...)` belongs to; absent for a plain grouping paren. */
    tokenIndex?: number;
    /** Position of the frame's opening `(` in `expr`. */
    openPos: number;
    /** Count of top-level `,` seen directly inside this frame (not in a nested frame). */
    commaCount: number;
  }
  const parenStack: ParenFrame[] = [];

  /** Index (into `tokens`) of the nearest enclosing call frame, skipping plain-group frames; `undefined` at top level. */
  const nearestCallIndex = (): number | undefined => {
    for (let k = parenStack.length - 1; k >= 0; k--) {
      const idx = parenStack[k].tokenIndex;
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  /** Finalizes a call frame's `argCount` (best-effort — also used for unbalanced end-of-input frames). */
  const closeFrame = (frame: ParenFrame, closePos: number): void => {
    if (frame.tokenIndex === undefined) return;
    const token = tokens[frame.tokenIndex];
    if (token.kind !== "reference" && token.kind !== "systemFunction") return;
    const content = expr.slice(frame.openPos + 1, closePos);
    token.argCount = content.trim() === "" ? 0 : frame.commaCount + 1;
  };

  const readIdentifier = (pos: number): { name: string; end: number } => {
    let j = pos + 1;
    while (j < len && IDENT_PART_RE.test(expr[j])) j++;
    return { name: expr.slice(pos, j), end: j };
  };

  while (i < len) {
    const c = expr[i];

    if (c === '"') {
      // String literal: scan to the closing quote, treating "" as an escaped embedded quote.
      // Unterminated strings (malformed input) just run to end-of-input.
      let j = i + 1;
      while (j < len) {
        if (expr[j] === '"') {
          if (expr[j + 1] === '"') {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      i = j;
      continue;
    }

    if (DIGIT_RE.test(c)) {
      const m = NUMBER_RE.exec(expr.slice(i));
      i += m ? m[0].length : 1;
      continue;
    }

    if (isIdentStartChar(c)) {
      const first = readIdentifier(i);
      const start = i;

      // Dot-chain? Only enter reference parsing if a real identifier follows the dot
      // (bare trailing "." as in malformed "Sprite." falls through to the variable case).
      if (expr[first.end] === "." && isIdentStartChar(expr[first.end + 1] ?? "")) {
        const segments: Array<{ name: string; end: number }> = [{ name: first.name, end: first.end }];
        let pos = first.end;
        // Cap at 3 segments (Object.member / Object.Behavior.member): the leading
        // recognizable shape. Any further ".x" chain is left for the outer loop to
        // re-scan as ordinary text, never crashing and never swallowed silently.
        while (segments.length < 3 && expr[pos] === "." && isIdentStartChar(expr[pos + 1] ?? "")) {
          const seg = readIdentifier(pos + 1);
          segments.push({ name: seg.name, end: seg.end });
          pos = seg.end;
        }

        const objectName = first.name;
        const memberSeg = segments[segments.length - 1];
        const behaviorName = segments.length === 3 ? segments[1].name : undefined;
        const isCall = expr[memberSeg.end] === "(";
        const parentIndex = nearestCallIndex();
        const token: ExpressionReferenceToken = {
          kind: "reference",
          start,
          end: memberSeg.end,
          objectName,
          memberName: memberSeg.name,
          isCall,
        };
        if (behaviorName !== undefined) token.behaviorName = behaviorName;
        if (parentIndex !== undefined) token.parentIndex = parentIndex;
        tokens.push(token);
        if (isCall) {
          parenStack.push({ tokenIndex: tokens.length - 1, openPos: memberSeg.end, commaCount: 0 });
          i = memberSeg.end + 1;
        } else {
          i = memberSeg.end;
        }
        continue;
      }

      const parentIndex = nearestCallIndex();
      if (expr[first.end] === "(") {
        const token: SystemFunctionToken = { kind: "systemFunction", name: first.name, start, end: first.end };
        if (parentIndex !== undefined) token.parentIndex = parentIndex;
        tokens.push(token);
        parenStack.push({ tokenIndex: tokens.length - 1, openPos: first.end, commaCount: 0 });
        i = first.end + 1;
      } else {
        const token: VariableToken = { kind: "variable", name: first.name, start, end: first.end };
        if (parentIndex !== undefined) token.parentIndex = parentIndex;
        tokens.push(token);
        i = first.end;
      }
      continue;
    }

    if (c === "(") {
      // A plain grouping paren (not immediately following a call token, which is consumed
      // above): still tracked so nested content — and matching ")" — resolve correctly.
      parenStack.push({ openPos: i, commaCount: 0 });
      i += 1;
      continue;
    }

    if (c === ")") {
      const frame = parenStack.pop();
      if (frame) closeFrame(frame, i);
      i += 1;
      continue;
    }

    if (c === ",") {
      if (parenStack.length > 0) parenStack[parenStack.length - 1].commaCount += 1;
      i += 1;
      continue;
    }

    // Operators, punctuation, whitespace: not source for any token, skip one char.
    i += 1;
  }

  // Unbalanced parens: any frames still open at end-of-input are finalized best-effort
  // against the remaining tail rather than left with an undefined argCount.
  while (parenStack.length > 0) {
    const frame = parenStack.pop();
    if (frame) closeFrame(frame, len);
  }

  return tokens;
}

/**
 * C3's fixed "Comparison" combo order (r487), as a numeric index → operator symbol map.
 * C3 serializes the `comparison` parameter of compare ACEs as a bare integer 0–5:
 *   0 = "="  (Equal),          1 = "≠"  (Not equal),
 *   2 = "<"  (Less than),      3 = "≤"  (Less or equal),
 *   4 = ">"  (Greater than),   5 = "≥"  (Greater or equal).
 * This is the canonical, version-pinned source of truth owned here so downstream
 * need not re-hardcode the magic numbers (cf. {@link EVENTVAR_REFERENCE_ACES}).
 */
export const COMPARISON_OPERATORS: Record<number, string> = {
  0: "=",
  1: "≠",
  2: "<",
  3: "≤",
  4: ">",
  5: "≥",
};

/**
 * Returns the operator symbol for a C3 `comparison` parameter value (0–5),
 * or `undefined` for out-of-range values.
 */
export function comparisonSymbol(n: number): string | undefined {
  return COMPARISON_OPERATORS[n];
}

// ─── Editor-strictness validator ─────────────────────────────────────────────
//
// These types model the C3 *editor loader's* required-field set, which is
// stricter than c3source's intentionally lenient parse types. Detection-only;
// no mutation. As downstream tools forward C3-load bugs, each fix becomes a
// one-line addition to EDITOR_FIELD_RULES (cf. EVENTVAR_REFERENCE_ACES). The
// originating incident (issue #33): adding comment:"" / description:"" resolved
// C3 import failures — so the rule is typeof === "string", empty string passes.

/** A single validation finding produced by {@link validateForEditor} or {@link validateEventForEditor}. */
export interface EditorValidationIssue {
  /** jsonPath locator within the event tree, e.g. "events[1].children[2]". */
  path: string;
  /** Stable rule id, e.g. "eventvar-comment-required". */
  rule: string;
  /** Human-readable reason the C3 editor would reject this. */
  message: string;
}

/** A single editor-strictness rule: which event kind it inspects + the check. */
export interface EditorFieldRule {
  rule: string;
  /** The eventType this rule applies to — used for fast dispatch. */
  eventType: EventSheetEvent["eventType"];
  /** Returns a message if the event violates the rule, else null. */
  check: (event: EventSheetEvent) => string | null;
}

/**
 * The C3 editor loader's required-field rules, as a machine-readable table.
 * A C3 platform fact owned here so downstream need not re-hardcode it (issue #33).
 * Exported so callers can introspect or contribute rules via array extension.
 */
export const EDITOR_FIELD_RULES: EditorFieldRule[] = [
  {
    rule: "eventvar-comment-required",
    eventType: "variable",
    check: (e) =>
      typeof (e as EventSheetVariable).comment === "string"
        ? null
        : "EventSheetVariable.comment must be a string (C3 editor rejects undefined on import)",
  },
  {
    rule: "group-description-required",
    eventType: "group",
    check: (e) =>
      typeof (e as GroupEvent).description === "string"
        ? null
        : "GroupEvent.description must be a string (C3 editor rejects undefined on import)",
  },
];

/**
 * Validate a single event against all editor-strictness rules.
 * `jsonPath` is used verbatim in the returned issue paths; defaults to `"event"`
 * for callers validating a detached node outside a sheet walk.
 */
export function validateEventForEditor(event: EventSheetEvent, jsonPath = "event"): EditorValidationIssue[] {
  const issues: EditorValidationIssue[] = [];
  for (const r of EDITOR_FIELD_RULES) {
    if (r.eventType !== event.eventType) continue;
    const message = r.check(event);
    if (message !== null) issues.push({ path: jsonPath, rule: r.rule, message });
  }
  return issues;
}

/**
 * Validate an entire event sheet against the editor-strictness rules.
 * Walks via {@link visitEvents} so issue paths use the same `jsonPath` coordinates
 * as every other c3source traversal and cannot drift.
 */
export function validateForEditor(sheet: EventSheet): EditorValidationIssue[] {
  const issues: EditorValidationIssue[] = [];
  visitEvents(sheet.events, (event, ctx) => {
    issues.push(...validateEventForEditor(event, ctx.jsonPath));
  });
  return issues;
}

/** Narrow an event to the two kinds that declare a callable signature. */
export function isFunctionDefinition(event: EventSheetEvent): event is FunctionBlockEvent | CustomAceBlockEvent {
  return event.eventType === "function-block" || event.eventType === "custom-ace-block";
}

/** List the functions and custom-ACEs a sheet defines, in canonical event order. */
export function extractFunctions(sheet: EventSheet): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];
  visitEvents(sheet.events, (event) => {
    if (event.eventType === "function-block") {
      functions.push({
        kind: "function",
        name: event.functionName,
        params: event.functionParameters,
        returnType: event.functionReturnType,
      });
    } else if (event.eventType === "custom-ace-block") {
      functions.push({
        kind: "custom-ace",
        name: event.aceName,
        objectClass: event.objectClass,
        params: event.functionParameters,
        returnType: event.functionReturnType,
      });
    }
  });
  return functions;
}

/** A single include edge: the sheet pulled in, plus its locator in the tree. */
export interface IncludeReference {
  /** Name of the included event sheet (IncludeEvent.includeSheet). */
  includeSheet: string;
  /** Locator of the include event, e.g. "events[2]" or "events[0].children[1]". */
  jsonPath: string;
}

/**
 * List the sheets this sheet includes, in canonical event order, each paired
 * with its `jsonPath` coordinate. Includes are non-counting events (no
 * eventNumber), so the jsonPath is their canonical locator.
 */
export function extractIncludes(sheet: EventSheet): IncludeReference[] {
  const includes: IncludeReference[] = [];
  visitEvents(sheet.events, (event, ctx) => {
    if (event.eventType === "include") {
      includes.push({ includeSheet: event.includeSheet, jsonPath: ctx.jsonPath });
    }
  });
  return includes;
}

/** A path segment: object key (string) or array index (number). */
export type SidPathSegment = string | number;

/** Render segments into the canonical dotted/indexed path string. Empty segments -> "". */
export function formatSidPath(segments: ReadonlyArray<SidPathSegment>): string {
  let out = "";
  for (const seg of segments) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out;
}

/** Recursively visit every object carrying a numeric `sid`, with its structured path segments. */
export function walkSids(node: unknown, visit: (sid: number, segments: SidPathSegment[]) => void): void {
  const recur = (n: unknown, segs: SidPathSegment[]): void => {
    if (Array.isArray(n)) {
      n.forEach((item, i) => recur(item, [...segs, i]));
      return;
    }
    if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>;
      if (typeof obj.sid === "number") visit(obj.sid, segs);
      for (const [key, value] of Object.entries(obj)) {
        if (key === "sid") continue;
        recur(value, [...segs, key]);
      }
    }
  };
  recur(node, []);
}

/** Collect every `sid` in an arbitrary C3 JSON subtree. */
export function collectSids(node: unknown): Set<number> {
  const sids = new Set<number>();
  walkSids(node, (sid) => sids.add(sid));
  return sids;
}

/** Collect every `sid` in an arbitrary C3 JSON subtree, paired with the path to its owning object. */
export function collectSidsWithPaths(node: unknown): Array<{ sid: number; path: string }> {
  const out: Array<{ sid: number; path: string }> = [];
  walkSids(node, (sid, segments) => out.push({ sid, path: formatSidPath(segments) }));
  return out;
}

/** Which C3 schema slot a sid was found in. */
export type SidSlot = "event" | "condition" | "action" | "function-parameter";

/**
 * Locate a sid within an event sheet, returning the enclosing event and which
 * slot carried it. Encodes the schema knowledge of which slots hold sids.
 */
export function findSid(sheet: EventSheet, sid: number): { node: EventSheetEvent; slot: SidSlot } | null {
  let result: { node: EventSheetEvent; slot: SidSlot } | null = null;
  visitEvents(sheet.events, (event) => {
    if (result) return;
    if ((event as { sid?: number }).sid === sid) {
      result = { node: event, slot: "event" };
    } else if (hasConditions(event) && event.conditions.some((c) => c.sid === sid)) {
      result = { node: event, slot: "condition" };
    } else if (hasActions(event) && event.actions.some((a) => (a as { sid?: number }).sid === sid)) {
      result = { node: event, slot: "action" };
    } else if (
      (event.eventType === "function-block" || event.eventType === "custom-ace-block") &&
      event.functionParameters.some((p) => p.sid === sid)
    ) {
      result = { node: event, slot: "function-parameter" };
    }
  });
  return result;
}

