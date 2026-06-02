import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

/** The canonical set of C3-editor-local artifacts that are NOT project source. */
export const EDITOR_LOCAL_EXCLUSIONS: {
  dirs: readonly string[];
  fileSuffixes: readonly string[];
  exactNames: readonly string[];
} = {
  dirs: ["uistate", "ts-defs"], // C3 r487+ uistate/ subfolders; ts-defs/ is C3-generated TS typings
  fileSuffixes: [".uistate.json"],
  exactNames: ["tsconfig.json"], // C3-generated for TypeScript projects (overwritten by the editor)
};

/** True if a bare basename is a C3-editor-local artifact (not project source):
 *  a dir named like an excluded dir, a file with an excluded suffix, or an exact
 *  generated filename. Covers every form so it replaces all skip sites uniformly. */
export function isEditorLocalPath(name: string): boolean {
  return (
    EDITOR_LOCAL_EXCLUSIONS.dirs.includes(name) ||
    EDITOR_LOCAL_EXCLUSIONS.exactNames.includes(name) ||
    EDITOR_LOCAL_EXCLUSIONS.fileSuffixes.some((suffix) => name.endsWith(suffix))
  );
}

/**
 * The single recursive file walk behind every `find_all_*_path` collector, and
 * the generic primitive for discovering files c3source has no named collector
 * for (e.g. generated `.dsl.txt` artifacts): collect file paths under `dir` for
 * which `predicate(filename)` is true. `predicate` receives the bare basename
 * (e.g. `"Level1.dsl.txt"`), not the full path.
 *
 * This owns the recursion, the directory-skip rules, and the ordering so callers
 * don't maintain a parallel walker that can drift:
 * - **Recursion** — fully recursive through subdirectories.
 * - **Skip rule** — never descends into `uistate/` subfolders. C3 r487+ writes
 *   editor UI state into them next to the real files, and their non-source
 *   `.json` contents crash the parsers (mirrors the per-file `.uistate.json`
 *   skip the source predicates apply).
 * - **Ordering** — deterministic, per-level `readdirSync().sort()` depth-first.
 *
 * The named collectors (`find_all_layouts_path`, `find_all_eventsheets_path`, …)
 * differ only in their predicate, so they are thin wrappers over this; never
 * re-implement the recursion or the `uistate/` skip.
 */
export function find_all_files_path(dir: string, predicate: (filename: string) => boolean): string[] {
  const result: string[] = [];
  readdirSync(dir)
    .sort()
    .forEach((file) => {
      const filepath = path.join(dir, file);
      const stats = statSync(filepath);
      if (stats.isDirectory()) {
        if (isEditorLocalPath(file)) return; // C3 r487+ uistate/ subfolders are not C3 source
        result.push(...find_all_files_path(filepath, predicate));
      } else if (stats.isFile() && predicate(file)) {
        result.push(filepath);
      }
    });
  return result;
}

export function find_all_layouts_path(layout_dir: string): string[] {
  return find_all_files_path(layout_dir, (file) => !isEditorLocalPath(file));
}

export function find_all_objectTypes_path(objectTypesDir: string): string[] {
  return find_all_files_path(objectTypesDir, (file) => !isEditorLocalPath(file));
}

// Return true if layout must be saved.
export type InstanceVisitor = (instance: Instance, index: number, layer: Layer, fullLayerName: string) => boolean;
export type LayerVisitor = (layer: Layer, fullLayerName: string) => number;

/**
 * A single layer surfaced by the layer traversal, with everything a consumer
 * needs to match, name, or mutate it:
 *
 * - `layer`     — the layer object itself.
 * - `name`      — the bare `layer.name` (the natural match target; independent of `prefix`).
 * - `fullName`  — the dotted, global-resetting name (`L.A.B`, or `global.G` for a layer
 *                 flagged `global`). This is the one name policy the traversal hardcodes,
 *                 because `visitLayers` already builds it and existing visitors rely on it.
 * - `ancestors` — the parent layers, root-first, EXCLUDING `layer` itself (`[]` at top level).
 *                 Use this to build any other name shape the traversal does not hardcode,
 *                 e.g. a `>`-separated, NON-resetting display name:
 *                   [...entry.ancestors, entry.layer].map((l) => l.name).join(" > ")
 *                 (`depth` is intentionally not a field — it is `ancestors.length`.)
 * - `parent`    — the sibling array `layer` lives in; enables in-place removal via
 *                 `entry.parent.splice(entry.index, 1)`.
 * - `index`     — `layer`'s index within `parent`.
 */
export type LayerEntry = {
  layer: Layer;
  name: string;
  fullName: string;
  ancestors: Layer[];
  parent: Layer[];
  index: number;
};

/** Predicate over a {@link LayerEntry}; return true to select the layer. */
export type LayerPredicate = (entry: LayerEntry) => boolean;

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
    0,
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
  };
}

export function visit_instances_in_layouts(layouts_path: string, visitor: InstanceVisitor): number {
  const layouts = find_all_layouts_path(layouts_path);
  const layerVisitor = makeLayerVisitorFromInstanceVisitor(visitor);
  return layouts.reduce(
    (changed: number, layoutPath: string) => visit_layers_in_layout(layoutPath, layerVisitor) + changed,
    0,
  );
}

/**
 * The single depth-first traversal of a layer tree, shared by every layer
 * walker/finder. Yields each layer parent-before-children, fully recursive
 * through `subLayers`, building the dotted/global-resetting `fullName` exactly
 * as `visitLayers` historically did (a layer flagged `global` resets the
 * qualifier to "global"). Internal: consumers go through `visitLayers` or the
 * `find*` functions. Because it is a generator, a consumer that stops iterating
 * (the `find*` functions, on first match) halts the walk immediately.
 */
function* walkLayerEntries(layers: Layer[], prefix: string, ancestors: Layer[]): Generator<LayerEntry> {
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const base = layer.global ? "global" : prefix;
    const fullName = base ? `${base}.${layer.name}` : layer.name;
    yield { layer, name: layer.name, fullName, ancestors, parent: layers, index };
    if (layer.subLayers) {
      yield* walkLayerEntries(layer.subLayers, fullName, [...ancestors, layer]);
    }
  }
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
  let changed = 0;
  for (const entry of walkLayerEntries(layers, prefix, [])) {
    changed += visitor(entry.layer, entry.fullName);
  }
  return changed;
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
 * Depth-first search of a layer tree (same order as {@link visitLayers}) that
 * STOPS at the first layer for which `predicate` returns true, returning that
 * layer's {@link LayerEntry} (with `ancestors`, `parent`, and `index`) — or
 * `undefined` if none match. `prefix` mirrors `visitLayers`: default `""`
 * yields bare-name-rooted `fullName`s; pass a layout name (or use
 * {@link findLayerEntryInLayout}) to seed the dotted qualifier.
 */
export function findLayerEntry(layers: Layer[], predicate: LayerPredicate, prefix = ""): LayerEntry | undefined {
  for (const entry of walkLayerEntries(layers, prefix, [])) {
    if (predicate(entry)) return entry;
  }
  return undefined;
}

/** {@link findLayerEntry} convenience returning just the matched layer (or `undefined`). */
export function findLayer(layers: Layer[], predicate: LayerPredicate, prefix = ""): Layer | undefined {
  return findLayerEntry(layers, predicate, prefix)?.layer;
}

/**
 * {@link findLayer} convenience for the dominant case — matching the bare
 * `layer.name`. Equivalent to `findLayer(layers, (e) => e.name === name, prefix)`.
 */
export function findLayerByName(layers: Layer[], name: string, prefix = ""): Layer | undefined {
  return findLayer(layers, (entry) => entry.name === name, prefix);
}

/**
 * {@link findLayerEntry} seeded with the layout name (parity with
 * {@link visitLayout}), so the dotted `fullName` matches the file-based walkers
 * (e.g. `"Layout 1.Layer 0"`).
 */
export function findLayerEntryInLayout(layout: Layout, predicate: LayerPredicate): LayerEntry | undefined {
  return findLayerEntry(layout.layers, predicate, layout.name);
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
  visit_layers_in_layouts(layouts_path, (layer) => {
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

// ─── Piece C: project.c3proj manifest model ──────────────────────────────────

/** A folder of named items (layouts, eventSheets, timelines, …) in the manifest. */
export interface C3NameFolder {
  items: string[];
  subfolders: C3NameFolder[];
  /** Organizational subfolder name (matches the on-disk subdirectory). Absent on the
   *  section root and on degenerate empty subfolders C3 serializes without a name. */
  name?: string;
}

/** A single file entry in a rootFileFolders category. */
export interface C3FileEntry {
  name: string;
  type: string;
  sid: number;
  [key: string]: unknown;
}

/** A folder of file entries in the manifest (scripts, icons, …). */
export interface C3FileFolder {
  items: C3FileEntry[];
  subfolders: C3FileFolder[];
  /** Organizational subfolder name (matches the on-disk subdirectory). Absent on the
   *  category root and on degenerate empty subfolders C3 serializes without a name. */
  name?: string;
}

/** A container declaration: a set of object-type names that travel together. */
export interface C3Container {
  members: string[];
  [key: string]: unknown;
}

/** All seven rootFileFolders categories. */
export interface C3RootFileFolders {
  script: C3FileFolder;
  sound: C3FileFolder;
  music: C3FileFolder;
  video: C3FileFolder;
  font: C3FileFolder;
  icon: C3FileFolder;
  general: C3FileFolder;
}

/** The parsed project.c3proj manifest (folder-project format, NOT the single-file .c3p archive). */
export interface C3ProjectManifest {
  projectFormatVersion: number;
  savedWithRelease: number;
  name: string;
  runtime: string;
  objectTypes: C3NameFolder;
  layouts: C3NameFolder;
  eventSheets: C3NameFolder;
  timelines: C3NameFolder;
  flowcharts: C3NameFolder;
  families: C3NameFolder;
  models3d: C3NameFolder;
  containers: C3Container[];
  rootFileFolders: C3RootFileFolders;
  properties: Record<string, unknown>;
  [key: string]: unknown; // forward-compat: usedAddons, viewportWidth, firstLayout, …
}

/** One section's drift result. Editor-local entries are already filtered out. */
export interface SectionDrift {
  /** e.g. "layouts", "rootFileFolders.script" */
  section: string;
  /** Resolved on-disk folder name, e.g. "layouts", "scripts". */
  folder: string;
  /** Names declared in the manifest but no file found on disk. */
  missingOnDisk: string[];
  /** Files on disk that the manifest doesn't declare. */
  untracked: string[];
}

/** Result of detectManifestDrift. */
export interface ManifestDrift {
  sections: SectionDrift[];
  inSync: boolean;
}

// ─── Private guards ───────────────────────────────────────────────────────────

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`invalid project.c3proj: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertOptionalName(v: Record<string, unknown>, where: string): void {
  assert(v.name === undefined || typeof v.name === "string", `${where}.name must be a string when present`);
}

function assertNameFolder(v: unknown, where: string): asserts v is C3NameFolder {
  assert(isRecord(v), `${where} must be an object`);
  assert(Array.isArray(v.items) && v.items.every((i) => typeof i === "string"), `${where}.items must be string[]`);
  assert(Array.isArray(v.subfolders), `${where}.subfolders must be an array`);
  assertOptionalName(v, where);
  v.subfolders.forEach((sf, i) => assertNameFolder(sf, `${where}.subfolders[${i}]`));
}

function assertFileFolder(v: unknown, where: string): asserts v is C3FileFolder {
  assert(isRecord(v), `${where} must be an object`);
  assert(Array.isArray(v.items), `${where}.items must be an array`);
  v.items.forEach((it, i) => {
    assert(isRecord(it), `${where}.items[${i}] must be an object`);
    assert(typeof it.name === "string", `${where}.items[${i}].name must be a string`);
    assert(typeof it.type === "string", `${where}.items[${i}].type must be a string`);
    assert(typeof it.sid === "number", `${where}.items[${i}].sid must be a number`);
  });
  assert(Array.isArray(v.subfolders), `${where}.subfolders must be an array`);
  assertOptionalName(v, where);
  v.subfolders.forEach((sf, i) => assertFileFolder(sf, `${where}.subfolders[${i}]`));
}

function assertContainer(v: unknown, where: string): asserts v is C3Container {
  assert(isRecord(v), `${where} must be an object`);
  assert(
    Array.isArray(v.members) && v.members.every((mem) => typeof mem === "string"),
    `${where}.members must be string[]`,
  );
}

const NAME_SECTIONS = [
  "layouts",
  "eventSheets",
  "objectTypes",
  "timelines",
  "flowcharts",
  "families",
  "models3d",
] as const;

// ─── Mapping tables ───────────────────────────────────────────────────────────

/**
 * Manifest section key → on-disk folder name for name-folder sections.
 * Every section follows the same shape: flat <Name>.json files arranged in named
 * organizational subfolders that mirror the manifest's subfolder tree (confirmed by a
 * real export, incl. objectTypes — there is NO per-objectType directory). `containers`
 * is intentionally absent (declared inline in the manifest, no on-disk folder).
 */
export const C3_SECTION_FOLDERS = {
  layouts: "layouts",
  eventSheets: "eventSheets",
  objectTypes: "objectTypes",
  timelines: "timelines",
  flowcharts: "flowcharts",
  families: "families",
  models3d: "models3d",
} as const;

/**
 * Manifest rootFileFolders category → on-disk source folder (plural).
 * CONFIRMED by fixture: script→scripts, icon→icons.
 * INFERRED (shipped anyway; c3source owns the fix if wrong):
 * sound→sounds, music→music, video→videos, font→fonts, general→files.
 */
export const C3_ROOT_FILE_FOLDERS = {
  script: "scripts",
  sound: "sounds",
  music: "music",
  video: "videos",
  font: "fonts",
  icon: "icons",
  general: "files",
} as const;

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse and validate a raw JSON value as a C3ProjectManifest.
 * Throws on shape violations. Absent modeled sections are tolerated (treated as empty).
 * Unmodeled top-level fields pass through.
 */
export function parseProjectManifest(json: unknown): C3ProjectManifest {
  assert(isRecord(json), "top-level value must be an object");
  assert(typeof json.name === "string", "name must be a string");
  assert(typeof json.runtime === "string", "runtime must be a string");
  assert(typeof json.projectFormatVersion === "number", "projectFormatVersion must be a number");
  assert(typeof json.savedWithRelease === "number", "savedWithRelease must be a number");
  for (const sec of NAME_SECTIONS) if (sec in json) assertNameFolder(json[sec], sec);
  if ("rootFileFolders" in json) {
    const rff = json.rootFileFolders;
    assert(isRecord(rff), "rootFileFolders must be an object");
    for (const cat of Object.keys(C3_ROOT_FILE_FOLDERS))
      if (cat in rff) assertFileFolder(rff[cat], `rootFileFolders.${cat}`);
  }
  if ("containers" in json) {
    assert(Array.isArray(json.containers), "containers must be an array");
    json.containers.forEach((c, i) => assertContainer(c, `containers[${i}]`));
  }
  return json as unknown as C3ProjectManifest;
}

/** Read and parse a project.c3proj file. Source-folder disk content is NOT consulted. */
export function readProjectManifest(manifestPath: string): C3ProjectManifest {
  return parseProjectManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
}

// ─── Flatteners ───────────────────────────────────────────────────────────────

/** Collect all item names from a C3NameFolder, recursing into subfolders. */
export function collectManifestItemNames(folder: C3NameFolder): string[] {
  const out = [...folder.items];
  for (const sub of folder.subfolders) out.push(...collectManifestItemNames(sub));
  return out;
}

/** Collect all file entry names from a C3FileFolder, recursing into subfolders. */
export function collectManifestFileNames(folder: C3FileFolder): string[] {
  const out = folder.items.map((it) => it.name);
  for (const sub of folder.subfolders) out.push(...collectManifestFileNames(sub));
  return out;
}

// ─── Drift detector ───────────────────────────────────────────────────────────

/** Recursive walk: collect basename-minus-.json for every .json that is not editor-local. */
function diskNameFolderItems(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return find_all_files_path(folder, (f) => f.endsWith(".json") && !isEditorLocalPath(f)).map((p) =>
    path.basename(p, ".json"),
  );
}

/**
 * Shallow walk: collect basenames of files (not dirs) that are not editor-local.
 * Shallow is intentional — manifest rootFileFolder membership is itself flat, so we
 * must NOT recurse. This sidesteps generated subdirs like ts-defs/ without a new
 * exclusion rule (the construct3-chef#36 mitigation).
 */
function diskFileFolderNames(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => !isEditorLocalPath(f))
    .filter((f) => statSync(path.join(folder, f)).isFile());
}

function diffNames(declared: string[], onDisk: string[]): { missingOnDisk: string[]; untracked: string[] } {
  const D = new Set(declared);
  const K = new Set(onDisk);
  return {
    missingOnDisk: declared.filter((n) => !K.has(n)).sort(),
    untracked: onDisk.filter((n) => !D.has(n)).sort(),
  };
}

/**
 * Compare manifest-declared membership against on-disk source (editor-local filtered).
 * When `manifest` is omitted, reads `projectDir/project.c3proj`.
 * Detection only — policy (warn, fail, sync) is the caller's responsibility.
 */
export function detectManifestDrift(projectDir: string, manifest?: C3ProjectManifest): ManifestDrift {
  const m = manifest ?? readProjectManifest(path.join(projectDir, "project.c3proj"));
  const sections: SectionDrift[] = [];
  for (const [section, folderName] of Object.entries(C3_SECTION_FOLDERS)) {
    const declared = m[section] ? collectManifestItemNames(m[section] as C3NameFolder) : [];
    const onDisk = diskNameFolderItems(path.join(projectDir, folderName));
    const d = diffNames(declared, onDisk);
    if (d.missingOnDisk.length || d.untracked.length) sections.push({ section, folder: folderName, ...d });
  }
  const rff = m.rootFileFolders;
  if (rff)
    for (const [cat, folderName] of Object.entries(C3_ROOT_FILE_FOLDERS)) {
      const folder = rff[cat as keyof C3RootFileFolders];
      const declared = folder ? collectManifestFileNames(folder) : [];
      const onDisk = diskFileFolderNames(path.join(projectDir, folderName));
      const d = diffNames(declared, onDisk);
      if (d.missingOnDisk.length || d.untracked.length)
        sections.push({ section: `rootFileFolders.${cat}`, folder: folderName, ...d });
    }
  return { sections, inSync: sections.length === 0 };
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
