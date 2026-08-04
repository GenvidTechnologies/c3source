import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { writeC3JsonFile } from "./serialize.js";

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
  effectTypes?: EffectTypeRef[];
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
  effectTypes?: EffectTypeRef[];
}

export interface BehaviorTypeRef {
  behaviorId: string;
  name: string;
  sid?: number;
  [k: string]: unknown;
}

export interface EffectTypeRef {
  effectId: string;
  name: string;
  [k: string]: unknown;
}

export interface ObjectType {
  [x: string]: unknown;
  name: string;
  "plugin-id": string;
  behaviorTypes?: BehaviorTypeRef[];
  effectTypes?: EffectTypeRef[];
}

export interface Family {
  [x: string]: unknown;
  name: string;
  "plugin-id": string;
  members: string[];
  behaviorTypes?: BehaviorTypeRef[];
  effectTypes?: EffectTypeRef[];
}

/** C3's generated-TypeScript-declarations folder under `scripts/` (C3 domain fact, r487+). */
export const C3_TS_DEFS_FOLDER = "ts-defs";

/**
 * The canonical set of C3-editor-local artifacts that are NOT project source.
 *
 * **AUDITED** — no unflagged editor-local artifact found anywhere in the corpus,
 * measured with the real {@link isEditorLocalPath} predicate rather than a
 * re-encoding of this table. Independent corroboration: C3's own editor skips a
 * `ts-defs` directory at the root of `scripts/` when reconciling a folder project
 * against disk — the same rule this table encodes. See `docs/domain-fact-audit.md`
 * (#68) for the evidence volume.
 *
 * **Blast radius: the widest of the six — contaminating.** An unlisted
 * editor-local artifact is treated as project source and surfaces as spurious
 * `untracked` drift across every section.
 */
export const EDITOR_LOCAL_EXCLUSIONS: {
  dirs: readonly string[];
  fileSuffixes: readonly string[];
  exactNames: readonly string[];
} = {
  dirs: ["uistate", C3_TS_DEFS_FOLDER], // C3 r487+ uistate/ subfolders; ts-defs/ is C3-generated TS typings
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

/** Default directory-descent rule: enter every directory that is not editor-local. */
const descendSourceDirs = (name: string): boolean => !isEditorLocalPath(name);

/**
 * The single recursive file walk behind every `find_all_*_path` collector, and
 * the generic primitive for discovering files c3source has no named collector
 * for (e.g. generated `.dsl.txt` artifacts): collect file paths under `dir` for
 * which `predicate(filename)` is true. `predicate` receives the bare basename
 * (e.g. `"Level1.dsl.txt"`), not the full path.
 *
 * This owns the recursion, the directory-descent rule, and the ordering so
 * callers don't maintain a parallel walker that can drift:
 * - **Recursion** — fully recursive through subdirectories.
 * - **Skip rule** — does not descend into any directory the default `descend`
 *   rejects (`uistate/`, `ts-defs/` — i.e. `isEditorLocalPath`). C3 r487+ writes
 *   editor UI state and generated TS typings into these next to the real files,
 *   and their non-source contents crash the parsers (mirrors the per-file
 *   `.uistate.json` skip the source predicates apply).
 * - **Ordering** — deterministic, per-level `readdirSync().sort()` depth-first.
 *
 * The named collectors (`find_all_layouts_path`, `find_all_eventsheets_path`, …)
 * differ only in their predicate, so they are thin wrappers over this; never
 * re-implement the recursion or the descent rule.
 *
 * @param descend Controls which directories the walk enters, separately from
 * `predicate` (which only selects files). Defaults to `descendSourceDirs`
 * (`!isEditorLocalPath(name)`), so 2-argument callers are unaffected. This
 * separation exists because `isEditorLocalPath` conflates two questions —
 * "is this C3 source?" and "may the walk enter it?" — and some C3-generated,
 * non-source directories (e.g. `scripts/ts-defs/`) still need to be reachable
 * by a caller that wants their contents (issue #63; see ADR 0020).
 *
 * Overriding `descend` disables inherited editor-local classification for the
 * entered subtree — the caller's `predicate` becomes the only filter, and it
 * sees bare basenames that `isEditorLocalPath` will not flag (e.g.
 * `objects.d.ts`, `Main Layout.instancesBar.json`).
 *
 * @example
 * find_all_files_path(scriptsDir, (f) => f.endsWith(".d.ts"),
 *   (d) => d === C3_TS_DEFS_FOLDER || !isEditorLocalPath(d));
 */
export function find_all_files_path(
  dir: string,
  predicate: (filename: string) => boolean,
  descend: (dirname: string) => boolean = descendSourceDirs,
): string[] {
  const result: string[] = [];
  readdirSync(dir)
    .sort()
    .forEach((file) => {
      const filepath = path.join(dir, file);
      const stats = statSync(filepath);
      if (stats.isDirectory()) {
        if (!descend(file)) return; // C3 r487+ uistate/ and ts-defs/ subfolders are not descended by default
        result.push(...find_all_files_path(filepath, predicate, descend));
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

/**
 * A {@link LayerEntry} plus its JSON locator within the owning layout, e.g.
 * `"layers[2].subLayers[0]"` — same grammar as `formatSidPath` in
 * `src/eventSheets.ts` (see {@link walkLayerEntries} for why the rendering is
 * duplicated rather than shared).
 */
export interface LayerEntryWithPath extends LayerEntry {
  jsonPath: string;
}

/** Predicate over a {@link LayerEntry}; return true to select the layer. */
export type LayerPredicate = (entry: LayerEntry) => boolean;

function visit_layers_in_layout(layout_path: string, visitor: LayerVisitor): number {
  const content = readFileSync(layout_path, "utf-8");
  const layout = JSON.parse(content) as Layout;
  // The in-memory visitLayout owns the one traversal; the file wrapper only
  // adds read/parse and the write-when-changed rule (writeC3JsonFile owns the
  // canonical C3 project-source form: tab indent, no trailing newline).
  const changed = layout.layers ? visitLayout(layout, visitor) : 0;
  if (changed > 0) {
    writeC3JsonFile(layout_path, layout);
  }
  return changed;
}

export function visit_layers_in_layouts(layouts_path: string, visitor: LayerVisitor): number {
  // find_all_layouts_path filters only on !isEditorLocalPath (no .json predicate — that is
  // intentional, see its JSDoc), so a stray non-JSON file under layouts/ would otherwise
  // reach visit_layers_in_layout's JSON.parse and crash. Filter to .json here, at the parse
  // boundary, rather than narrowing the finder's documented contract.
  const layouts = find_all_layouts_path(layouts_path).filter((p) => p.endsWith(".json"));
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
  // Same non-JSON-file hazard as visit_layers_in_layouts above (this ultimately calls the
  // same visit_layers_in_layout, whose JSON.parse would crash on a stray non-JSON file) —
  // filter to .json here, at the parse boundary, rather than narrowing find_all_layouts_path.
  const layouts = find_all_layouts_path(layouts_path).filter((p) => p.endsWith(".json"));
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
 * qualifier to "global"), plus a `jsonPath` locator (e.g.
 * `"layers[2].subLayers[0]"`) built inline as the recursion descends. Exported
 * so a consumer needing the JSON coordinate of a layer (e.g. an instance-level
 * dangling-reference report) can drive the walk directly instead of
 * re-deriving the index chain from `ancestors`; most consumers still go
 * through `visitLayers` or the `find*` functions below, which simply ignore
 * `jsonPath`. Because it is a generator, a consumer that stops iterating (the
 * `find*` functions, on first match) halts the walk immediately.
 *
 * `jsonPath` rendering is a deliberate ~3-line duplicate of `formatSidPath`'s
 * grammar (`src/eventSheets.ts`, `[i]` for array indices, `.key` for object
 * keys, no leading dot) rather than a call to it: `eventSheets.ts` imports
 * `layouts.ts`, so calling back would create a `layouts -> eventSheets` cycle
 * (`layouts` may import only `serialize`). If the path grammar ever changes,
 * update both this site and `formatSidPath`.
 */
export function* walkLayerEntries(
  layers: Layer[],
  prefix: string,
  ancestors: Layer[],
  basePath = "layers",
): Generator<LayerEntryWithPath> {
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const base = layer.global ? "global" : prefix;
    const fullName = base ? `${base}.${layer.name}` : layer.name;
    const jsonPath = `${basePath}[${index}]`;
    yield { layer, name: layer.name, fullName, ancestors, parent: layers, index, jsonPath };
    if (layer.subLayers) {
      yield* walkLayerEntries(layer.subLayers, fullName, [...ancestors, layer], `${jsonPath}.subLayers`);
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

