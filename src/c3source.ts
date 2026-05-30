import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Normalize line endings to LF (\n) for consistent output across platforms.
 * C3 JSON files may contain \r\n in expressions/comments.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface Effect {
  [key: string]: unknown;
}

/** A node's place in a layout scene graph. `parent-uid` is -1 for a root. */
export interface SceneGraphData {
  uid: number;
  "parent-uid": number;
  children?: Array<{ uid: number }>;
}

/** A C3 instance-folder entry; its `sid` mirrors the owning instance's sid. */
export interface InstanceFolderItem {
  [key: string]: unknown;
  sid: number;
}

/** The layout's scene-graph root folder: registers the sids of root instances. */
export interface SceneGraphFolderRoot {
  items: Array<{ sid: number }>;
}

export interface Instance {
  [key: string]: unknown;
  type: string;
  properties: {
    [x: string]: unknown;
    text?: string;
  };
  uid: number;
  sid?: number;
  sceneGraphData?: SceneGraphData;
  instanceFolderItem?: InstanceFolderItem;
  instanceVariables?: Record<string, unknown>;
  effects?: Record<string, Effect>;
}

export interface Layer {
  [key: string]: unknown;
  name: string;
  global?: boolean;
  subLayers?: Layer[];
  instances?: Instance[];
  /** C3's global-layer-override marker (single-r spelling matches C3's on-disk key). */
  overriden?: 0 | 1;
}

export interface Layout {
  [key: string]: unknown;
  name: string;
  layers: Layer[];
  "nonworld-instances"?: Instance[];
  "scene-graphs-folder-root"?: SceneGraphFolderRoot;
  eventSheet?: string;
  width?: number;
  height?: number;
}

export interface ObjectType {
  [x: string]: unknown;
  name: string;
  "plugin-id": string;
}

export function find_all_layouts_path(layout_dir: string): string[] {
  const layouts: string[] = [];
  const files = readdirSync(layout_dir).sort();
  files.forEach((file) => {
    const filepath = path.join(layout_dir, file);
    const stats = statSync(filepath);
    if (stats.isDirectory()) {
      layouts.push(...find_all_layouts_path(filepath));
    } else if (stats.isFile() && !filepath.endsWith(".uistate.json")) {
      layouts.push(filepath);
    }
  });
  return layouts;
}

export function find_all_objectTypes_path(objectTypesDir: string) {
  const objectTypePaths: string[] = [];
  const files = readdirSync(objectTypesDir).sort();
  files.forEach((file) => {
    const filepath = path.join(objectTypesDir, file);
    const stats = statSync(filepath);
    if (stats.isDirectory()) {
      objectTypePaths.push(...find_all_layouts_path(filepath));
    } else if (stats.isFile() && !filepath.endsWith(".uistate.json")) {
      objectTypePaths.push(filepath);
    }
  });
  return objectTypePaths;
}

// Return true if layout must be saved.
export type InstanceVisitor = (instance: Instance, index: number, layer: Layer, fullLayerName: string) => boolean;
export type LayerVisitor = (layer: Layer, fullLayerName: string) => number;

function visit_layers_in_layout(layout_path: string, visitor: LayerVisitor): number {
  const content = readFileSync(layout_path, "utf-8");
  const layout = JSON.parse(content) as Layout;
  // The in-memory visitLayout owns the one traversal; the file wrapper only
  // adds read/parse and the write-when-changed rule (tab indent to match C3).
  const changed = layout.layers ? visitLayout(layout, visitor) : 0;
  if (changed > 0) {
    writeFileSync(layout_path, JSON.stringify(layout, undefined, "\t"));
  }
  return changed;
}

export function visit_layers_in_layouts(layouts_path: string, visitor: LayerVisitor): number {
  const layouts = find_all_layouts_path(layouts_path);
  return layouts.reduce(
    (changed: number, layoutPath: string) => visit_layers_in_layout(layoutPath, visitor) + changed,
    0
  );
}


function makeLayerVisitorFromInstanceVisitor(visitor: InstanceVisitor): LayerVisitor {
  return (layer: Layer, fullLayerName): number => {
    return (
      layer.instances?.reduce(
        (changed, instance, index) => (visitor(instance, index, layer, fullLayerName) ? changed + 1 : changed),
        0,
      ) || 0
    );
  }
}

export function visit_instances_in_layouts(layouts_path: string, visitor: InstanceVisitor): number {
  const layouts = find_all_layouts_path(layouts_path);
  const layerVisitor = makeLayerVisitorFromInstanceVisitor(visitor);
  return layouts.reduce(
    (changed: number, layoutPath: string) => visit_layers_in_layout(layoutPath, layerVisitor) + changed,
    0
  );
}

/**
 * In-memory depth-first walk of a layer tree: calls `visitor` for each layer
 * and recursively each subLayer, building the dotted full layer name. A layer
 * flagged `global` resets the qualifier to "global". Returns the summed
 * mutation count (the LayerVisitor count contract). `prefix` seeds the
 * qualifier — pass "" (default) for bare layer names, or use visitLayout to
 * seed it with the layout name (matching the path-based walkers).
 */
export function visitLayers(layers: Layer[], visitor: LayerVisitor, prefix = ""): number {
  return layers.reduce((changed, layer) => {
    const base = layer.global ? "global" : prefix;
    const fullLayerName = base ? `${base}.${layer.name}` : layer.name;
    let layerChanged = visitor(layer, fullLayerName);
    if (layer.subLayers) {
      layerChanged += visitLayers(layer.subLayers, visitor, fullLayerName);
    }
    return changed + layerChanged;
  }, 0);
}

/** Walk all layers of a layout in memory, seeding the dotted name with the layout name. */
export function visitLayout(layout: Layout, visitor: LayerVisitor): number {
  return visitLayers(layout.layers, visitor, layout.name);
}

/** Walk every instance of every layer in a layout. Returns the count the InstanceVisitor reported changed. */
export function visitInstances(layout: Layout, visitor: InstanceVisitor): number {
  return visitLayout(layout, makeLayerVisitorFromInstanceVisitor(visitor));
}

/**
 * Register a root instance's sid in the layout's scene-graph root folder,
 * creating the folder if absent. Root instances must appear here.
 */
export function addSceneGraphRoot(layout: Layout, sid: number): void {
  let folder = layout["scene-graphs-folder-root"];
  if (!folder) {
    folder = { items: [] };
    layout["scene-graphs-folder-root"] = folder;
  }
  folder.items.push({ sid });
}

/**
 * Remove a root instance's sid from the layout's scene-graph root folder.
 * Returns true if an entry was removed.
 */
export function removeSceneGraphRoot(layout: Layout, sid: number): boolean {
  const items = layout["scene-graphs-folder-root"]?.items;
  if (!items) return false;
  const index = items.findIndex((item) => item.sid === sid);
  if (index === -1) return false;
  items.splice(index, 1);
  return true;
}

/**
 * Remap an instance's ids in place using uid/sid translation maps. Encodes the
 * C3 rules: `uid`, `sceneGraphData.uid`, `sceneGraphData.parent-uid` (unless -1)
 * and each `sceneGraphData.children[].uid` are uids; the instance `sid` and its
 * mirrored `instanceFolderItem.sid` are sids. Unmapped ids pass through.
 */
export function remapInstanceIds(inst: Instance, uidMap: Map<number, number>, sidMap: Map<number, number>): void {
  inst.uid = uidMap.get(inst.uid) ?? inst.uid;

  if (typeof inst.sid === "number") {
    const newSid = sidMap.get(inst.sid) ?? inst.sid;
    inst.sid = newSid;
    if (inst.instanceFolderItem) {
      inst.instanceFolderItem.sid = newSid; // mirrors the instance sid
    }
  }

  const sgd = inst.sceneGraphData;
  if (sgd) {
    sgd.uid = uidMap.get(sgd.uid) ?? sgd.uid;
    if (sgd["parent-uid"] !== -1) {
      sgd["parent-uid"] = uidMap.get(sgd["parent-uid"]) ?? sgd["parent-uid"];
    }
    sgd.children?.forEach((child) => {
      child.uid = uidMap.get(child.uid) ?? child.uid;
    });
  }
}

/**
 * Build a fresh C3 layer with all default fields, matching what the editor
 * writes for a new layer (field values sourced from a real C3 export). `sid`
 * is 0 — the caller assigns a real sid. `name` is the only required argument.
 */
export function makeDefaultLayer(name: string): Layer {
  return {
    name,
    overriden: 0,
    subLayers: [],
    instances: [],
    sid: 0,
    effectTypes: [],
    isInitiallyVisible: true,
    isInitiallyInteractive: true,
    isHTMLElementsLayer: false,
    color: [1, 1, 1, 1],
    backgroundColor: [1, 1, 1, 1],
    isTransparent: false,
    sampling: "auto",
    parallaxX: 1,
    parallaxY: 1,
    scaleRate: 1,
    forceOwnTexture: false,
    renderingMode: "3d",
    drawOrder: "z-order",
    useRenderCells: false,
    blendMode: "normal",
    zElevation: 0,
    global: false,
  };
}

export function get_all_global_layers(layouts_path: string): Set<string> {
  const globals = new Set<string>();
  visit_layers_in_layouts(layouts_path, (layer, ) => {
    if (layer.global) {
      globals.add(layer.name);
    }
    return 0;
  });
  return globals;
}

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
  const sheets: string[] = [];
  const files = readdirSync(eventSheetsDir).sort();
  files.forEach((file) => {
    const filepath = path.join(eventSheetsDir, file);
    const stats = statSync(filepath);
    if (stats.isDirectory()) {
      sheets.push(...find_all_eventsheets_path(filepath));
    } else if (stats.isFile() && filepath.endsWith(".json") && !filepath.endsWith(".uistate.json")) {
      sheets.push(filepath);
    }
  });
  return sheets;
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
        .map(([k, v]) => `${k}=${v}`)
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

function formatRecordParams(parameters: Record<string, unknown> | undefined): string {
  if (!parameters) return "";
  return Object.entries(parameters)
    .map(([k, v]) => `${k}=${normalizeLineEndings(String(v))}`)
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
  return (
    event.eventType === "block" || event.eventType === "function-block" || event.eventType === "custom-ace-block"
  );
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
}

/** List the functions and custom-ACEs a sheet defines, in canonical event order. */
export function extractFunctions(sheet: EventSheet): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];
  visitEvents(sheet.events, (event) => {
    if (event.eventType === "function-block") {
      functions.push({ kind: "function", name: event.functionName });
    } else if (event.eventType === "custom-ace-block") {
      functions.push({ kind: "custom-ace", name: event.aceName, objectClass: event.objectClass });
    }
  });
  return functions;
}

/** Recursively visit every object carrying a numeric `sid`, with its dotted/indexed path. */
function walkSids(node: unknown, path: string, emit: (sid: number, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkSids(item, `${path}[${i}]`, emit));
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.sid === "number") {
      emit(obj.sid, path);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === "sid") continue;
      walkSids(value, path ? `${path}.${key}` : key, emit);
    }
  }
}

/** Collect every `sid` in an arbitrary C3 JSON subtree. */
export function collectSids(node: unknown): Set<number> {
  const sids = new Set<number>();
  walkSids(node, "", (sid) => sids.add(sid));
  return sids;
}

/** Collect every `sid` in an arbitrary C3 JSON subtree, paired with the path to its owning object. */
export function collectSidsWithPaths(node: unknown): Array<{ sid: number; path: string }> {
  const out: Array<{ sid: number; path: string }> = [];
  walkSids(node, "", (sid, path) => out.push({ sid, path }));
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

