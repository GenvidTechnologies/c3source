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
  EventSheetVariable | BlockEvent | FunctionBlockEvent | CustomAceBlockEvent | GroupEvent | IncludeEvent | CommentEvent;

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
  /**
   * Structured drift entries for this section. Each entry carries a `kind`
   * (missing | untracked | moved | folder-missing | folder-untracked | dangling-ref)
   * and the path-segment arrays (`manifestPath`, `diskPath`) needed to locate the
   * item within the manifest/disk subfolder nesting without re-walking the tree.
   */
  entries: DriftEntry[];
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

/** The project manifest filename (constant C3 domain fact). */
export const PROJECT_MANIFEST_FILE = "project.c3proj";

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
 * On-disk directory name for a timeline's auto-managed transition container — shown as
 * **"Eases"** in the C3 editor (English). This is a C3 format **exception**: the editor
 * serializes the `timelines/transitions/` directory as an **unnamed** subfolder under
 * `timelines` in `project.c3proj` (a `{items, subfolders}` node with NO `name` key), and
 * it is the one place a nameless manifest subfolder is meaningful rather than degenerate.
 * Drift detection maps that unnamed top-level subfolder back to this directory name so a
 * timeline-with-transitions project round-trips without false drift (#28). Exported so the
 * C3 domain fact is owned here (cf. {@link EVENTVAR_REFERENCE_ACES}) rather than re-hardcoded
 * downstream. The container can itself hold ordinary named subfolders (e.g. "Other Eases").
 */
export const TIMELINE_TRANSITIONS_FOLDER = "transitions";

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

/**
 * The special flat folder C3 writes object-type and animation image files into.
 * Owned here as a C3 domain fact (cf. {@link TIMELINE_TRANSITIONS_FOLDER},
 * {@link IMAGE_FILE_TYPE_EXTENSIONS}) so downstream does not re-hardcode it.
 */
export const IMAGES_FOLDER = "images";

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

/**
 * Collect all item names from a C3NameFolder, recursing into subfolders.
 * Thin consumer of `walkManifestNameTree` — delegates to the canonical walk, no parallel recursion.
 */
export function collectManifestItemNames(folder: C3NameFolder): string[] {
  return walkManifestNameTree(folder).map((e) => e.name);
}

/**
 * Collect all file entry names from a C3FileFolder, recursing into subfolders.
 * Thin consumer of `walkManifestFileTree` — delegates to the canonical walk, no parallel recursion.
 */
export function collectManifestFileNames(folder: C3FileFolder): string[] {
  return walkManifestFileTree(folder).map((e) => e.name);
}

// ─── Path-bearing drift types ─────────────────────────────────────────────────

/** A path segment locating an item in the manifest/disk subfolder tree (subfolder name). */
export type ManifestPathSegment = string; // subfolder name; number is reserved to mirror SidPathSegment

/** The kind of drift a DriftEntry represents. */
export type DriftKind = "missing" | "untracked" | "moved" | "folder-missing" | "folder-untracked" | "dangling-ref";

/** A structured drift entry locating an item within the manifest/disk subfolder nesting. */
export interface DriftEntry {
  kind: DriftKind;
  name: string;
  /** Subfolder-name segments in the MANIFEST tree (absent on "untracked" and "dangling-ref"). */
  manifestPath?: ManifestPathSegment[];
  /** Subfolder-name segments on DISK (absent on "missing" and "dangling-ref"). */
  diskPath?: ManifestPathSegment[];
}

/** Render manifest path segments into a slash-joined string. Empty segments → "". */
export function formatManifestPath(segments: ReadonlyArray<ManifestPathSegment>): string {
  return segments.length === 0 ? "" : segments.join("/");
}

// ─── Path-preserving manifest tree walks ─────────────────────────────────────

/**
 * Yield every declared item from a C3NameFolder tree with its ancestor subfolder path.
 * `path` is the chain of ancestor subfolder NAMES (NOT including the item name itself).
 * The section root's own `name` is never included in any item's path.
 *
 * A subfolder with no `name` normally contributes no segment (the section root's items
 * inherit the parent path). The exception is `unnamedSubfolderName`: when supplied, a
 * nameless DIRECT child of the section root adopts that name as its segment. This models
 * the `timelines/transitions/` ("Eases") container, which C3 serializes as an unnamed
 * subfolder (see {@link TIMELINE_TRANSITIONS_FOLDER}). The param is intentionally NOT
 * propagated into recursion, so it applies to top-level children only — matching C3, where
 * the transitions container is always a direct child of the `timelines` root.
 */
export function walkManifestNameTree(
  folder: C3NameFolder,
  basePath: ManifestPathSegment[] = [],
  unnamedSubfolderName?: string,
): Array<{ name: string; path: ManifestPathSegment[] }> {
  const out: Array<{ name: string; path: ManifestPathSegment[] }> = [];
  for (const name of folder.items) out.push({ name, path: basePath });
  for (const sub of folder.subfolders) {
    // Nameless subfolder contributes no segment, UNLESS unnamedSubfolderName names it
    // (the timelines/transitions exception). Not propagated → top-level children only.
    const effectiveName = sub.name ?? unnamedSubfolderName;
    const childPath = effectiveName !== undefined ? [...basePath, effectiveName] : basePath;
    out.push(...walkManifestNameTree(sub, childPath));
  }
  return out;
}

/**
 * Yield every declared file entry from a C3FileFolder tree with its ancestor subfolder path.
 * `path` is the chain of ancestor subfolder NAMES; emitted `name` is `entry.name`.
 * The category root's own `name` is never included in any entry's path.
 * Nameless subfolders (degenerate case) contribute no segment to the path.
 */
export function walkManifestFileTree(
  folder: C3FileFolder,
  basePath: ManifestPathSegment[] = [],
): Array<{ name: string; path: ManifestPathSegment[] }> {
  const out: Array<{ name: string; path: ManifestPathSegment[] }> = [];
  for (const entry of folder.items) out.push({ name: entry.name, path: basePath });
  for (const sub of folder.subfolders) {
    const childPath = sub.name !== undefined ? [...basePath, sub.name] : basePath;
    out.push(...walkManifestFileTree(sub, childPath));
  }
  return out;
}

// ─── Path-preserving disk tree walks ─────────────────────────────────────────

/**
 * Yield every source-name item found on disk under a name-section root directory,
 * with its section-root-relative subfolder path.
 * `path` segments are relative to `diskFolder` (the section root), never absolute.
 * Skips editor-local entries via `isEditorLocalPath`. Returns [] if `diskFolder` absent.
 * Uses `readdirSync`/`statSync` directly (NOT `find_all_files_path`) to preserve path context.
 */
export function walkDiskNameTree(
  diskFolder: string,
  basePath: ManifestPathSegment[] = [],
): Array<{ name: string; path: ManifestPathSegment[] }> {
  if (!existsSync(diskFolder)) return [];
  const out: Array<{ name: string; path: ManifestPathSegment[] }> = [];
  for (const entry of readdirSync(diskFolder).sort()) {
    if (isEditorLocalPath(entry)) continue;
    const full = path.join(diskFolder, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkDiskNameTree(full, [...basePath, entry]));
    } else if (entry.endsWith(".json")) {
      out.push({ name: path.basename(entry, ".json"), path: basePath });
    }
  }
  return out;
}

/**
 * Yield every source file found on disk under a file-section root directory,
 * with its section-root-relative subfolder path.
 * Recurses ONLY into subdirectories whose name matches a declared subfolder's `name`
 * (D3/R5: undeclared subdirs like `ts-defs/` are never walked).
 * Emits full filenames WITH extension (file-folder matching is extension-agnostic, R11).
 * Returns [] if `diskFolder` absent.
 */
export function walkDiskFileTree(
  diskFolder: string,
  declaredSubfolders: C3FileFolder[],
  basePath: ManifestPathSegment[] = [],
): Array<{ name: string; path: ManifestPathSegment[] }> {
  if (!existsSync(diskFolder)) return [];
  const out: Array<{ name: string; path: ManifestPathSegment[] }> = [];
  for (const entry of readdirSync(diskFolder).sort()) {
    if (isEditorLocalPath(entry)) continue;
    const full = path.join(diskFolder, entry);
    if (statSync(full).isDirectory()) {
      // Only recurse into declared subfolders; skip undeclared dirs (e.g. ts-defs/).
      const matched = declaredSubfolders.find((sf) => sf.name === entry);
      if (matched) out.push(...walkDiskFileTree(full, matched.subfolders, [...basePath, entry]));
    } else if (statSync(full).isFile()) {
      out.push({ name: entry, path: basePath });
    }
  }
  return out;
}

// ─── Diff engine ──────────────────────────────────────────────────────────────

const DRIFT_KIND_ORDER: Record<DriftKind, number> = {
  missing: 0,
  untracked: 1,
  moved: 2,
  "folder-missing": 3,
  "folder-untracked": 4,
  "dangling-ref": 5,
};

/** Sort drift entries deterministically by kind then name (in place; returns the array). */
function sortDriftEntries(entries: DriftEntry[]): DriftEntry[] {
  entries.sort((a, b) => DRIFT_KIND_ORDER[a.kind] - DRIFT_KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
  return entries;
}

/**
 * Diff two name→path lists and return structured DriftEntry records.
 * Per-category name uniqueness (a C3 invariant) means the maps have no collisions.
 * - name in manifest only → missing
 * - name in disk only → untracked
 * - name in both, paths differ → moved (carries both manifestPath and diskPath)
 * - name in both, same path → no entry
 * Results are sorted deterministically by kind then name.
 */
export function diffNameMaps(
  manifestItems: Array<{ name: string; path: ManifestPathSegment[] }>,
  diskItems: Array<{ name: string; path: ManifestPathSegment[] }>,
): DriftEntry[] {
  const mMap = new Map<string, ManifestPathSegment[]>();
  for (const { name, path: p } of manifestItems) mMap.set(name, p);
  const dMap = new Map<string, ManifestPathSegment[]>();
  for (const { name, path: p } of diskItems) dMap.set(name, p);

  const entries: DriftEntry[] = [];
  for (const [name, mPath] of mMap) {
    const dPath = dMap.get(name);
    if (dPath === undefined) {
      entries.push({ kind: "missing", name, manifestPath: mPath });
    } else if (formatManifestPath(mPath) !== formatManifestPath(dPath)) {
      entries.push({ kind: "moved", name, manifestPath: mPath, diskPath: dPath });
    }
    // same path → no entry
  }
  for (const [name, dPath] of dMap) {
    if (!mMap.has(name)) entries.push({ kind: "untracked", name, diskPath: dPath });
  }
  return sortDriftEntries(entries);
}

/**
 * Collect every subfolder path (segment chains of names) declared in a manifest name-folder tree.
 * `unnamedSubfolderName` mirrors {@link walkManifestNameTree}: a nameless direct child of the
 * section root adopts that name (the `timelines/transitions` exception); not propagated into
 * recursion, so it applies to top-level children only.
 */
function collectManifestFolderPaths(
  folder: C3NameFolder,
  base: ManifestPathSegment[] = [],
  unnamedSubfolderName?: string,
): ManifestPathSegment[][] {
  const out: ManifestPathSegment[][] = [];
  for (const sub of folder.subfolders) {
    // Nameless subfolder contributes no path, UNLESS unnamedSubfolderName names it.
    const effectiveName = sub.name ?? unnamedSubfolderName;
    const childPath = effectiveName !== undefined ? [...base, effectiveName] : base;
    if (effectiveName !== undefined) out.push(childPath);
    out.push(...collectManifestFolderPaths(sub, childPath));
  }
  return out;
}

/** Collect every subdirectory path (segment chains, section-root-relative) on disk, editor-local filtered. */
function collectDiskFolderPaths(dir: string, base: ManifestPathSegment[] = []): ManifestPathSegment[][] {
  if (!existsSync(dir)) return [];
  const out: ManifestPathSegment[][] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (isEditorLocalPath(entry)) continue;
    if (statSync(path.join(dir, entry)).isDirectory()) {
      const childPath = [...base, entry];
      out.push(childPath);
      out.push(...collectDiskFolderPaths(path.join(dir, entry), childPath));
    }
  }
  return out;
}

/**
 * Diff manifest-declared subfolder paths against on-disk subdirectory paths, returning
 * folder-level drift entries (folder-missing for manifest-only, folder-untracked for
 * disk-only). A subfolder present on both sides yields no entry (folders are keyed by
 * their full path, so there is no folder "move"). `name` is the leaf subfolder name.
 */
function diffFolderPaths(manifestPaths: ManifestPathSegment[][], diskPaths: ManifestPathSegment[][]): DriftEntry[] {
  const mSet = new Set(manifestPaths.map(formatManifestPath));
  const dSet = new Set(diskPaths.map(formatManifestPath));
  const entries: DriftEntry[] = [];
  for (const p of manifestPaths)
    if (!dSet.has(formatManifestPath(p)))
      entries.push({ kind: "folder-missing", name: p[p.length - 1], manifestPath: p });
  for (const p of diskPaths)
    if (!mSet.has(formatManifestPath(p)))
      entries.push({ kind: "folder-untracked", name: p[p.length - 1], diskPath: p });
  return entries;
}

// ─── Drift detector ───────────────────────────────────────────────────────────

/**
 * Compare manifest-declared membership against on-disk source (editor-local filtered).
 * When `manifest` is omitted, reads `projectDir/project.c3proj`.
 * Detection only — policy (warn, fail, sync) is the caller's responsibility.
 */
export function detectManifestDrift(projectDir: string, manifest?: C3ProjectManifest): ManifestDrift {
  const m = manifest ?? readProjectManifest(path.join(projectDir, PROJECT_MANIFEST_FILE));
  const sections: SectionDrift[] = [];
  for (const [section, folderName] of Object.entries(C3_SECTION_FOLDERS)) {
    const sectionFolder = m[section] as C3NameFolder | undefined;
    // timelines exception: the unnamed top-level subfolder is the on-disk transitions/ ("Eases") dir.
    const unnamed = section === "timelines" ? TIMELINE_TRANSITIONS_FOLDER : undefined;
    const declared = sectionFolder ? walkManifestNameTree(sectionFolder, [], unnamed) : [];
    const onDisk = walkDiskNameTree(path.join(projectDir, folderName));
    const itemEntries = diffNameMaps(declared, onDisk);
    const folderEntries = diffFolderPaths(
      sectionFolder ? collectManifestFolderPaths(sectionFolder, [], unnamed) : [],
      collectDiskFolderPaths(path.join(projectDir, folderName)),
    );
    const entries = sortDriftEntries([...itemEntries, ...folderEntries]);
    if (entries.length) sections.push({ section, folder: folderName, entries });
  }
  const rff = m.rootFileFolders;
  if (rff)
    for (const [cat, folderName] of Object.entries(C3_ROOT_FILE_FOLDERS)) {
      const folder = rff[cat as keyof C3RootFileFolders];
      const declared = folder ? walkManifestFileTree(folder) : [];
      const onDisk = folder
        ? walkDiskFileTree(path.join(projectDir, folderName), folder.subfolders)
        : walkDiskFileTree(path.join(projectDir, folderName), []);
      const entries = diffNameMaps(declared, onDisk);
      if (entries.length) sections.push({ section: `rootFileFolders.${cat}`, folder: folderName, entries });
    }
  const containerEntries = detectContainerDrift(m);
  if (containerEntries.length) sections.push({ section: "containers", folder: "", entries: containerEntries });
  try {
    const imagesDrift = detectImageDrift(projectDir, m);
    if (imagesDrift && imagesDrift.entries.length) sections.push(imagesDrift);
  } catch {
    // images derivation is best-effort; never fail core drift on it
  }
  return { sections, inSync: sections.length === 0 };
}

/**
 * Referential-integrity check for containers: a container member that names an
 * object type absent from the manifest is a dangling reference. Containers are
 * declared inline (no on-disk folder), so this is manifest-vs-manifest only.
 * `manifestPath` carries `#<containerIndex>` to locate which container holds the
 * dangling member; `name` is the missing object-type name.
 */
function detectContainerDrift(m: C3ProjectManifest): DriftEntry[] {
  if (!Array.isArray(m.containers) || m.containers.length === 0) return [];
  const objectTypeNames = new Set(m.objectTypes ? walkManifestNameTree(m.objectTypes).map((e) => e.name) : []);
  const entries: DriftEntry[] = [];
  m.containers.forEach((container, i) => {
    for (const member of container.members)
      if (!objectTypeNames.has(member)) entries.push({ kind: "dangling-ref", name: member, manifestPath: [`#${i}`] });
  });
  return entries;
}

// ─── Image-derived drift ──────────────────────────────────────────────────────

/** C3 image `fileType` (MIME) -> on-disk file extension (no leading dot).
 *  A C3 platform fact owned here so downstream need not re-hardcode it (issue #29).
 *  Exported so callers can introspect/extend. */
export const IMAGE_FILE_TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/**
 * Resolve the on-disk extension for a C3 image `fileType` MIME string.
 * Throws if `fileType` is absent/empty (malformed object type) or unmapped (unknown format).
 * `context` is included in the error message to aid diagnosis.
 */
function extensionForFileType(fileType: unknown, context: string): string {
  if (fileType == null || fileType === "") {
    throw new Error(`malformed object type: missing fileType on "${context}"`);
  }
  const ext = IMAGE_FILE_TYPE_EXTENSIONS[String(fileType)];
  if (ext === undefined) {
    throw new Error(`unknown image fileType "${String(fileType)}" on "${context}"`);
  }
  return ext;
}

/** Shape of an animation item within an object type's `animations` tree. */
interface AnimationItem {
  name: string;
  frames?: Record<string, unknown>[];
}

/** Shape of an animation folder node within an object type's `animations` tree. */
interface AnimationFolder {
  items: AnimationItem[];
  subfolders: AnimationFolder[];
}

/**
 * Derive the expected on-disk image filenames for a single object type.
 *
 * **V1 coverage rule (structural detection):**
 * - Object type with a top-level `image` field (NinePatch, TiledBg, Tilemap plugins and
 *   any future single-image plugin): exactly one expected image
 *   `<lowercased-name>.<ext>`, where `ext` is derived from `image.fileType` via
 *   {@link IMAGE_FILE_TYPE_EXTENSIONS}.
 * - Object type with a top-level `animations` field (Sprite plugin and compatible):
 *   one `<lowercased-name>-<lowercased-animation-name>-<frame3>.<ext>` per animation frame,
 *   where `frame3` is the zero-based frame index zero-padded to 3 digits (000, 001, …) and
 *   `ext` is derived from each frame's own `fileType` field via {@link IMAGE_FILE_TYPE_EXTENSIONS}
 *   (frames in the same animation may differ in format).
 *   Animation subfolders **collapse** — the subfolder name does NOT appear in the filename;
 *   animation names are unique within an object type.
 * - Object types with neither `image` nor `animations` (Text, JSON, etc.): no images.
 *
 * An absent or unmapped `fileType` throws (malformed object type / unknown format).
 *
 * **Explicit limits (extensible in future releases):**
 * - Does NOT cover spritesheet/atlas packing (a sprite whose frames are packed into a
 *   single atlas sheet will not match the per-frame pattern).
 * - Does NOT cover collision-polygon or image-point sidecar files.
 * - Detection is structural (field presence), not plugin-id allowlist — robust to
 *   third-party single-image plugins but may over-derive for unusual plugin shapes.
 */
export function deriveExpectedImageNames(objectType: Record<string, unknown>): string[] {
  const name = String(objectType.name).toLowerCase();
  if ("image" in objectType) {
    const img = objectType.image as Record<string, unknown>;
    const ext = extensionForFileType(img?.fileType, String(objectType.name));
    return [`${name}.${ext}`];
  }
  if ("animations" in objectType) {
    const result: string[] = [];
    const collectAnimations = (folder: AnimationFolder): void => {
      for (const animItem of folder.items) {
        const animName = String(animItem.name).toLowerCase();
        const frames = Array.isArray(animItem.frames) ? animItem.frames : [];
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i] as Record<string, unknown>;
          const ext = extensionForFileType(frame?.fileType, `${String(objectType.name)}/${animItem.name}#${i}`);
          result.push(`${name}-${animName}-${String(i).padStart(3, "0")}.${ext}`);
        }
      }
      for (const sub of folder.subfolders) {
        collectAnimations(sub);
      }
    };
    const animationsRoot = objectType.animations as AnimationFolder;
    if (animationsRoot && typeof animationsRoot === "object") {
      collectAnimations({
        items: Array.isArray(animationsRoot.items) ? animationsRoot.items : [],
        subfolders: Array.isArray(animationsRoot.subfolders) ? animationsRoot.subfolders : [],
      });
    }
    return result;
  }
  return [];
}

/**
 * Compare derived expected image names against the `images/` folder on disk.
 * Returns a `SectionDrift` for the "images" section, or `null` if `images/` is absent.
 * Expected names are derived from all object-type JSON files under `objectTypes/`.
 * Actual names are the flat files found in `images/` (editor-local entries filtered).
 * All paths are `[]` (images/ is a flat folder — no subfolder nesting for moves).
 *
 * Detection is best-effort (see `deriveExpectedImageNames` for coverage limits).
 * A malformed or unknown `fileType` in any object type causes `deriveExpectedImageNames`
 * to throw; that error propagates to the caller. `detectManifestDrift` wraps this
 * function in a try/catch so such a failure degrades gracefully to "images section omitted".
 */
export function detectImageDrift(projectDir: string, _manifest?: C3ProjectManifest): SectionDrift | null {
  const imagesDir = path.join(projectDir, IMAGES_FOLDER);
  if (!existsSync(imagesDir)) return null;

  const expectedNames: string[] = [];
  const objectTypesDir = path.join(projectDir, "objectTypes");
  if (existsSync(objectTypesDir)) {
    const jsonPaths = find_all_files_path(objectTypesDir, (f) => f.endsWith(".json") && !isEditorLocalPath(f));
    for (const jsonPath of jsonPaths) {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
      expectedNames.push(...deriveExpectedImageNames(parsed));
    }
  }

  const actualNames = readdirSync(imagesDir).filter(
    (f) => !isEditorLocalPath(f) && statSync(path.join(imagesDir, f)).isFile(),
  );

  const entries = diffNameMaps(
    expectedNames.map((n) => ({ name: n, path: [] as ManifestPathSegment[] })),
    actualNames.map((n) => ({ name: n, path: [] as ManifestPathSegment[] })),
  );

  return { section: "images", folder: IMAGES_FOLDER, entries };
}

// ─── Piece D: C3Project handle ────────────────────────────────────────────────

/**
 * A handle to an open C3 folder-project root. All path fields are computed once
 * at construction with no I/O; `has*()` queries call `existsSync` fresh on each
 * invocation so they reflect the actual state of the disk at call time.
 *
 * Obtain via {@link openProject}.
 */
export interface C3Project {
  /** Absolute path to the project root (the directory containing `project.c3proj`). */
  readonly root: string;
  /** Absolute path to `project.c3proj`. */
  readonly manifestPath: string;
  /** Absolute path to the event sheets source directory. */
  readonly eventSheetsDir: string;
  /** Absolute path to the layouts source directory. */
  readonly layoutsDir: string;
  /** Absolute path to the object types source directory. */
  readonly objectTypesDir: string;
  /** Absolute path to the families source directory. */
  readonly familiesDir: string;
  /** Absolute path to the scripts source directory. */
  readonly scriptsDir: string;
  /** Absolute path to the timelines source directory. */
  readonly timelinesDir: string;
  /** Absolute path to the flowcharts source directory. */
  readonly flowchartsDir: string;
  /** Absolute path to the 3D models source directory. */
  readonly models3dDir: string;
  /** Absolute path to the images flat directory (cf. {@link IMAGES_FOLDER}). */
  readonly imagesDir: string;
  /** Absolute path to the sounds source directory. */
  readonly soundsDir: string;
  /** Absolute path to the music source directory. */
  readonly musicDir: string;
  /** Absolute path to the videos source directory. */
  readonly videosDir: string;
  /** Absolute path to the fonts source directory. */
  readonly fontsDir: string;
  /** Absolute path to the icons source directory. */
  readonly iconsDir: string;
  /** Absolute path to the general files source directory. */
  readonly filesDir: string;

  /** Whether the event sheets directory exists on disk (evaluated fresh on each call). */
  hasEventSheets(): boolean;
  /** Whether the layouts directory exists on disk (evaluated fresh on each call). */
  hasLayouts(): boolean;
  /** Whether the object types directory exists on disk (evaluated fresh on each call). */
  hasObjectTypes(): boolean;
  /** Whether the families directory exists on disk (evaluated fresh on each call). */
  hasFamilies(): boolean;
  /** Whether the scripts directory exists on disk (evaluated fresh on each call). */
  hasScripts(): boolean;
  /** Whether the timelines directory exists on disk (evaluated fresh on each call). */
  hasTimelines(): boolean;
  /** Whether the flowcharts directory exists on disk (evaluated fresh on each call). */
  hasFlowcharts(): boolean;
  /** Whether the 3D models directory exists on disk (evaluated fresh on each call). */
  hasModels3d(): boolean;
  /** Whether the images directory exists on disk (evaluated fresh on each call). */
  hasImages(): boolean;
  /** Whether the sounds directory exists on disk (evaluated fresh on each call). */
  hasSounds(): boolean;
  /** Whether the music directory exists on disk (evaluated fresh on each call). */
  hasMusic(): boolean;
  /** Whether the videos directory exists on disk (evaluated fresh on each call). */
  hasVideos(): boolean;
  /** Whether the fonts directory exists on disk (evaluated fresh on each call). */
  hasFonts(): boolean;
  /** Whether the icons directory exists on disk (evaluated fresh on each call). */
  hasIcons(): boolean;
  /** Whether the general files directory exists on disk (evaluated fresh on each call). */
  hasFiles(): boolean;

  /**
   * The parsed project manifest. Lazy: first call reads and caches the result;
   * subsequent calls return the cached value without re-reading disk.
   */
  manifest(): C3ProjectManifest;

  /**
   * Return all event sheet paths under `eventSheetsDir` (or its `sub` subdirectory).
   * Delegates to {@link find_all_eventsheets_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `eventSheetsDir` (default `""`).
   */
  findAllEventSheets(sub?: string): string[];

  /**
   * Return all layout paths under `layoutsDir` (or its `sub` subdirectory).
   * Delegates to {@link find_all_layouts_path} — all non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `layoutsDir` (default `""`).
   */
  findAllLayouts(sub?: string): string[];

  /**
   * Return all object-type paths under `objectTypesDir` (or its `sub` subdirectory).
   * Delegates to {@link find_all_objectTypes_path} — all non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `objectTypesDir` (default `""`).
   */
  findAllObjectTypes(sub?: string): string[];

  /**
   * Return all family paths under `familiesDir` (or its `sub` subdirectory).
   * Families are pure `<Name>.json` name-section files (no sub-assets).
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `familiesDir` (default `""`).
   */
  findAllFamilies(sub?: string): string[];

  /**
   * Return all source script paths under `scriptsDir` (or its `sub` subdirectory).
   * Returns only `.ts` source files — excludes generated `.d.ts` declaration files
   * (all of which live under `ts-defs/` and carry the `.d.ts` suffix).
   * Built on {@link find_all_files_path} — the recursive walk handles `ts-defs/`
   * correctly because every file inside it ends in `.d.ts`.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `scriptsDir` (default `""`).
   */
  findAllScripts(sub?: string): string[];

  /**
   * Return all timeline paths under `timelinesDir` (or its `sub` subdirectory).
   * Timelines are `.json` name-section files; the walk is recursive so it also includes
   * files under the unnamed transitions/ "Eases" subfolder. Callers can scope with `sub`.
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `timelinesDir` (default `""`).
   */
  findAllTimelines(sub?: string): string[];

  /**
   * Return all flowchart paths under `flowchartsDir` (or its `sub` subdirectory).
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `flowchartsDir` (default `""`).
   */
  findAllFlowcharts(sub?: string): string[];

  /**
   * Return all 3D model paths under `models3dDir` (or its `sub` subdirectory).
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `models3dDir` (default `""`).
   */
  findAllModels3d(sub?: string): string[];

  /**
   * Detect manifest drift for this project.
   * Delegates to {@link detectManifestDrift} with the project root and the handle's
   * cached manifest (reuses the already-parsed manifest instead of re-reading disk).
   */
  detectManifestDrift(): ManifestDrift;

  /**
   * Detect image-derived drift for this project.
   * Delegates to {@link detectImageDrift} with the project root.
   * Returns `null` if the `images/` directory does not exist.
   */
  detectImageDrift(): SectionDrift | null;
}

/**
 * Open a C3 folder-project at `root` and return a {@link C3Project} handle.
 *
 * **No I/O at construction** — path fields are string joins; the manifest is read
 * lazily on the first call to `manifest()`. Safe to call on a non-existent path.
 */
export function openProject(root: string): C3Project {
  const manifestPath = path.join(root, PROJECT_MANIFEST_FILE);
  const eventSheetsDir = path.join(root, C3_SECTION_FOLDERS.eventSheets);
  const layoutsDir = path.join(root, C3_SECTION_FOLDERS.layouts);
  const objectTypesDir = path.join(root, C3_SECTION_FOLDERS.objectTypes);
  const familiesDir = path.join(root, C3_SECTION_FOLDERS.families);
  const scriptsDir = path.join(root, C3_ROOT_FILE_FOLDERS.script);
  const timelinesDir = path.join(root, C3_SECTION_FOLDERS.timelines);
  const flowchartsDir = path.join(root, C3_SECTION_FOLDERS.flowcharts);
  const models3dDir = path.join(root, C3_SECTION_FOLDERS.models3d);
  const imagesDir = path.join(root, IMAGES_FOLDER);
  const soundsDir = path.join(root, C3_ROOT_FILE_FOLDERS.sound);
  const musicDir = path.join(root, C3_ROOT_FILE_FOLDERS.music);
  const videosDir = path.join(root, C3_ROOT_FILE_FOLDERS.video);
  const fontsDir = path.join(root, C3_ROOT_FILE_FOLDERS.font);
  const iconsDir = path.join(root, C3_ROOT_FILE_FOLDERS.icon);
  const filesDir = path.join(root, C3_ROOT_FILE_FOLDERS.general);

  // Capture free-function references before the returned object methods shadow them.
  // Without these aliases, a method named `detectManifestDrift` inside the returned
  // object literal would shadow the module-level function of the same name, causing
  // infinite recursion when the method tries to call `detectManifestDrift(...)`.
  const freeDetectManifestDrift = detectManifestDrift;
  const freeDetectImageDrift = detectImageDrift;

  let cachedManifest: C3ProjectManifest | undefined;

  /** Walk `sectionDir/sub` with `rawFinder`; return `[]` if the target dir is absent. */
  function findInSection(sectionDir: string, sub: string = "", rawFinder: (dir: string) => string[]): string[] {
    const targetDir = path.join(sectionDir, sub);
    if (!existsSync(targetDir)) return [];
    return rawFinder(targetDir);
  }

  return {
    root,
    manifestPath,
    eventSheetsDir,
    layoutsDir,
    objectTypesDir,
    familiesDir,
    scriptsDir,
    timelinesDir,
    flowchartsDir,
    models3dDir,
    imagesDir,
    soundsDir,
    musicDir,
    videosDir,
    fontsDir,
    iconsDir,
    filesDir,

    hasEventSheets: () => existsSync(eventSheetsDir),
    hasLayouts: () => existsSync(layoutsDir),
    hasObjectTypes: () => existsSync(objectTypesDir),
    hasFamilies: () => existsSync(familiesDir),
    hasScripts: () => existsSync(scriptsDir),
    hasTimelines: () => existsSync(timelinesDir),
    hasFlowcharts: () => existsSync(flowchartsDir),
    hasModels3d: () => existsSync(models3dDir),
    hasImages: () => existsSync(imagesDir),
    hasSounds: () => existsSync(soundsDir),
    hasMusic: () => existsSync(musicDir),
    hasVideos: () => existsSync(videosDir),
    hasFonts: () => existsSync(fontsDir),
    hasIcons: () => existsSync(iconsDir),
    hasFiles: () => existsSync(filesDir),

    manifest() {
      if (cachedManifest === undefined) {
        cachedManifest = readProjectManifest(manifestPath);
      }
      return cachedManifest;
    },

    findAllEventSheets(sub?: string): string[] {
      return findInSection(eventSheetsDir, sub, find_all_eventsheets_path);
    },

    findAllLayouts(sub?: string): string[] {
      return findInSection(layoutsDir, sub, find_all_layouts_path);
    },

    findAllObjectTypes(sub?: string): string[] {
      return findInSection(objectTypesDir, sub, find_all_objectTypes_path);
    },

    findAllFamilies(sub?: string): string[] {
      // Families are pure <Name>.json files — same predicate shape as find_all_eventsheets_path.
      return findInSection(familiesDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    findAllScripts(sub?: string): string[] {
      // Source scripts are .ts files. Generated declaration files in ts-defs/ all end in
      // .d.ts, so filtering !file.endsWith(".d.ts") is sufficient to exclude them while
      // find_all_files_path recurses normally (ts-defs/ is not an editor-local dir so it
      // is not skipped by isEditorLocalPath — it is excluded by the predicate alone).
      return findInSection(scriptsDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !isEditorLocalPath(file)),
      );
    },

    findAllTimelines(sub?: string): string[] {
      // The walk is recursive so it includes files under the unnamed transitions/ "Eases" subfolder.
      return findInSection(timelinesDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    findAllFlowcharts(sub?: string): string[] {
      return findInSection(flowchartsDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    findAllModels3d(sub?: string): string[] {
      return findInSection(models3dDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    detectManifestDrift(): ManifestDrift {
      // Pass the handle's cached manifest as the second arg so the free function reuses
      // the already-parsed manifest instead of re-reading project.c3proj from disk.
      return freeDetectManifestDrift(root, this.manifest());
    },

    detectImageDrift(): SectionDrift | null {
      return freeDetectImageDrift(root);
    },
  };
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
