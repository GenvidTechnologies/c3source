import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { find_all_files_path, isEditorLocalPath } from "./layouts.js";

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

/** A single addon (plugin/behavior/theme) declared in the manifest's `usedAddons` list. */
export interface C3UsedAddon {
  type: string;
  id: string;
  name: string;
  author: string;
  bundled: boolean;
  version?: string; // OPTIONAL — absent in real fixtures even when bundleAddons is true
  [k: string]: unknown;
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
  bundleAddons?: boolean;
  usedAddons?: C3UsedAddon[];
  [key: string]: unknown; // forward-compat: viewportWidth, firstLayout, …
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

function assertUsedAddon(v: unknown, where: string): asserts v is C3UsedAddon {
  assert(isRecord(v), `${where} must be an object`);
  assert(typeof v.type === "string", `${where}.type must be a string`);
  assert(typeof v.id === "string", `${where}.id must be a string`);
  assert(typeof v.name === "string", `${where}.name must be a string`);
  assert(typeof v.author === "string", `${where}.author must be a string`);
  assert(typeof v.bundled === "boolean", `${where}.bundled must be a boolean`);
  assert(v.version === undefined || typeof v.version === "string", `${where}.version must be a string when present`);
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
  if ("usedAddons" in json) {
    assert(Array.isArray(json.usedAddons), "usedAddons must be an array");
    json.usedAddons.forEach((a, i) => assertUsedAddon(a, `usedAddons[${i}]`));
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

/** The manifest's declared addons, or `[]` when `usedAddons` is absent (an optional section). */
export function getUsedAddons(m: C3ProjectManifest): C3UsedAddon[] {
  return m.usedAddons ?? [];
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

