import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  find_all_files_path,
  find_all_section_items_path,
  isEditorLocalPath,
  isSectionItemName,
} from "./layouts.js";
import { serializeC3Json, writeC3JsonFile } from "./serialize.js";

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
  /** Name of C3's built-in functions object, configurable per project. Defaults to
   *  `"Functions"` (see `C3_DEFAULT_FUNCTIONS_NAME` in `src/references.ts`) when absent.
   *  Absence is a **release property, not a per-project opt-out**: C3 first serializes the
   *  attribute in **r437** (verified by bisecting the editor's own serializer across
   *  `editor.construct.net/r{NNN}/projectResources.js`; r436 emits none), so any project
   *  last saved before then simply predates it. See `wiki/c3-domain-facts.md` (#68). */
  functionsName?: string;
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

/**
 * A best-effort sub-detector that threw and was skipped. Its section is absent from
 * {@link ManifestDrift.sections} — this is how a caller distinguishes "verified, no
 * drift" from "never verified". Reported rather than swallowed because a rare silent
 * failure is the worst kind (#68).
 */
export interface DriftDegradation {
  /** The omitted section, e.g. `"images"`. */
  section: string;
  /** The failure's message text. */
  message: string;
}

/** Result of detectManifestDrift. */
export interface ManifestDrift {
  sections: SectionDrift[];
  /**
   * `sections.length === 0`. A degradation is **not** drift and never flips this —
   * read {@link ManifestDrift.degraded} to learn whether every section was actually
   * checked.
   */
  inSync: boolean;
  /**
   * Present only when a best-effort sub-detector threw; absent on a fully-verified
   * run. `inSync === true` with a populated `degraded` means "no drift among the
   * sections that were checked", not "no drift".
   */
  degraded?: DriftDegradation[];
  /**
   * Non-item files found under the name-section roots. **Informational, never drift**:
   * populated independently of the manifest, never counted by {@link ManifestDrift.inSync},
   * and never a mappable item (see {@link StrayFile}). Present only when non-empty —
   * same convention as {@link ManifestDrift.degraded}, so a clean project's result object
   * is byte-identical to a pre-2.0.0 one.
   */
  strays?: StrayFile[];
}

// ─── Private guards ───────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * One shape violation collected by {@link validateProjectManifest}. `path` is a
 * dotted/indexed locator (e.g. `"layouts.items"`, `"usedAddons[0]"`, `""` for the root)
 * that mirrors the `where` string the old throw-first asserts embedded in their message.
 * `message` is the exact text `parseProjectManifest` throws AFTER the
 * `"invalid project.c3proj: "` prefix — a hard compatibility surface (see
 * `test/projectManifest.test.ts` / `test/usedAddons.test.ts`).
 */
export interface ManifestValidationIssue {
  path: string;
  rule: ManifestShapeRuleId;
  message: string;
}

/** Discriminates every distinct shape rule {@link validateProjectManifest} can report. */
export type ManifestShapeRuleId =
  | "top-level-object"
  | "name-string"
  | "runtime-string"
  | "project-format-version-number"
  | "saved-with-release-number"
  | "name-folder-object"
  | "name-folder-items"
  | "name-folder-subfolders"
  | "folder-name-string"
  | "root-file-folders-object"
  | "file-folder-object"
  | "file-folder-items"
  | "file-folder-subfolders"
  | "file-entry-object"
  | "file-entry-name"
  | "file-entry-type"
  | "file-entry-sid"
  | "containers-array"
  | "container-object"
  | "container-members"
  | "used-addons-array"
  | "used-addon-object"
  | "used-addon-type"
  | "used-addon-id"
  | "used-addon-name"
  | "used-addon-author"
  | "used-addon-bundled"
  | "used-addon-version";

function collectNameFolderIssues(v: unknown, where: string, issues: ManifestValidationIssue[]): void {
  if (!isRecord(v)) {
    issues.push({ path: where, rule: "name-folder-object", message: `${where} must be an object` });
    return;
  }
  if (!(Array.isArray(v.items) && v.items.every((i) => typeof i === "string")))
    issues.push({ path: `${where}.items`, rule: "name-folder-items", message: `${where}.items must be string[]` });
  if (!Array.isArray(v.subfolders))
    issues.push({
      path: `${where}.subfolders`,
      rule: "name-folder-subfolders",
      message: `${where}.subfolders must be an array`,
    });
  // name is checked LAST (matches the pre-refactor assertNameFolder order) — do not reorder,
  // see the emission-order invariant note on collectManifestIssues.
  if (!(v.name === undefined || typeof v.name === "string"))
    issues.push({
      path: `${where}.name`,
      rule: "folder-name-string",
      message: `${where}.name must be a string when present`,
    });
  if (Array.isArray(v.subfolders))
    v.subfolders.forEach((sf, i) => collectNameFolderIssues(sf, `${where}.subfolders[${i}]`, issues));
}

function collectFileFolderIssues(v: unknown, where: string, issues: ManifestValidationIssue[]): void {
  if (!isRecord(v)) {
    issues.push({ path: where, rule: "file-folder-object", message: `${where} must be an object` });
    return;
  }
  if (!Array.isArray(v.items)) {
    issues.push({ path: `${where}.items`, rule: "file-folder-items", message: `${where}.items must be an array` });
  } else {
    v.items.forEach((it, i) => {
      const itWhere = `${where}.items[${i}]`;
      if (!isRecord(it)) {
        issues.push({ path: itWhere, rule: "file-entry-object", message: `${itWhere} must be an object` });
        return;
      }
      if (typeof it.name !== "string")
        issues.push({ path: `${itWhere}.name`, rule: "file-entry-name", message: `${itWhere}.name must be a string` });
      if (typeof it.type !== "string")
        issues.push({ path: `${itWhere}.type`, rule: "file-entry-type", message: `${itWhere}.type must be a string` });
      if (typeof it.sid !== "number")
        issues.push({ path: `${itWhere}.sid`, rule: "file-entry-sid", message: `${itWhere}.sid must be a number` });
    });
  }
  if (!Array.isArray(v.subfolders))
    issues.push({
      path: `${where}.subfolders`,
      rule: "file-folder-subfolders",
      message: `${where}.subfolders must be an array`,
    });
  // name is checked LAST (matches the pre-refactor assertFileFolder order via assertOptionalName).
  if (!(v.name === undefined || typeof v.name === "string"))
    issues.push({
      path: `${where}.name`,
      rule: "folder-name-string",
      message: `${where}.name must be a string when present`,
    });
  if (Array.isArray(v.subfolders))
    v.subfolders.forEach((sf, i) => collectFileFolderIssues(sf, `${where}.subfolders[${i}]`, issues));
}

function collectContainerIssues(v: unknown, where: string, issues: ManifestValidationIssue[]): void {
  if (!isRecord(v)) {
    issues.push({ path: where, rule: "container-object", message: `${where} must be an object` });
    return;
  }
  if (!(Array.isArray(v.members) && v.members.every((mem) => typeof mem === "string")))
    issues.push({ path: `${where}.members`, rule: "container-members", message: `${where}.members must be string[]` });
}

function collectUsedAddonIssues(v: unknown, where: string, issues: ManifestValidationIssue[]): void {
  if (!isRecord(v)) {
    issues.push({ path: where, rule: "used-addon-object", message: `${where} must be an object` });
    return;
  }
  if (typeof v.type !== "string")
    issues.push({ path: `${where}.type`, rule: "used-addon-type", message: `${where}.type must be a string` });
  if (typeof v.id !== "string")
    issues.push({ path: `${where}.id`, rule: "used-addon-id", message: `${where}.id must be a string` });
  if (typeof v.name !== "string")
    issues.push({ path: `${where}.name`, rule: "used-addon-name", message: `${where}.name must be a string` });
  if (typeof v.author !== "string")
    issues.push({ path: `${where}.author`, rule: "used-addon-author", message: `${where}.author must be a string` });
  if (typeof v.bundled !== "boolean")
    issues.push({
      path: `${where}.bundled`,
      rule: "used-addon-bundled",
      message: `${where}.bundled must be a boolean`,
    });
  if (!(v.version === undefined || typeof v.version === "string"))
    issues.push({
      path: `${where}.version`,
      rule: "used-addon-version",
      message: `${where}.version must be a string when present`,
    });
}

/**
 * Walk a raw JSON value and collect every project.c3proj shape violation, NEVER throwing.
 *
 * EMISSION-ORDER INVARIANT (do not reorder without re-auditing `parseProjectManifest`'s
 * strict callers): `issues[0]` must always be the SAME violation the pre-refactor
 * sequential `assert*` family would have thrown first, for every input — not just the
 * pinned test cases. Concretely: top-level `isRecord` → `name` → `runtime` →
 * `projectFormatVersion` → `savedWithRelease`, then `NAME_SECTIONS` in array order, then
 * `rootFileFolders` in `Object.keys(C3_ROOT_FILE_FOLDERS)` order, then `containers`, then
 * `usedAddons`. Within a name/file-folder node: `isRecord` → `items` → `subfolders` →
 * `name` LAST → recurse subfolders by index — the old `assertNameFolder`/`assertFileFolder`
 * checked `name` AFTER items/subfolders; do not "tidy" that into checking `name` first, or
 * a doubly-malformed input silently throws a different message than before.
 *
 * `parseProjectManifest` is the strict caller that depends on this: it throws using only
 * `issues[0]`, so a reordering here changes which message a malformed manifest reports.
 *
 * Every recursive step is gated on its corresponding array/record check having already
 * passed (e.g. `subfolders` is only walked when `Array.isArray(v.subfolders)`), because —
 * unlike a throw-first assert — this collector keeps walking past a failed check and must
 * never crash with a raw TypeError, for any input whatsoever.
 */
function collectManifestIssues(json: unknown): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];

  if (!isRecord(json)) {
    issues.push({ path: "", rule: "top-level-object", message: "top-level value must be an object" });
    return issues;
  }
  if (typeof json.name !== "string")
    issues.push({ path: "name", rule: "name-string", message: "name must be a string" });
  if (typeof json.runtime !== "string")
    issues.push({ path: "runtime", rule: "runtime-string", message: "runtime must be a string" });
  if (typeof json.projectFormatVersion !== "number")
    issues.push({
      path: "projectFormatVersion",
      rule: "project-format-version-number",
      message: "projectFormatVersion must be a number",
    });
  if (typeof json.savedWithRelease !== "number")
    issues.push({
      path: "savedWithRelease",
      rule: "saved-with-release-number",
      message: "savedWithRelease must be a number",
    });

  for (const sec of NAME_SECTIONS) if (sec in json) collectNameFolderIssues(json[sec], sec, issues);

  if ("rootFileFolders" in json) {
    const rff = json.rootFileFolders;
    if (!isRecord(rff)) {
      issues.push({
        path: "rootFileFolders",
        rule: "root-file-folders-object",
        message: "rootFileFolders must be an object",
      });
    } else {
      for (const cat of Object.keys(C3_ROOT_FILE_FOLDERS))
        if (cat in rff) collectFileFolderIssues(rff[cat], `rootFileFolders.${cat}`, issues);
    }
  }

  if ("containers" in json) {
    if (!Array.isArray(json.containers)) {
      issues.push({ path: "containers", rule: "containers-array", message: "containers must be an array" });
    } else {
      json.containers.forEach((c, i) => collectContainerIssues(c, `containers[${i}]`, issues));
    }
  }

  if ("usedAddons" in json) {
    if (!Array.isArray(json.usedAddons)) {
      issues.push({ path: "usedAddons", rule: "used-addons-array", message: "usedAddons must be an array" });
    } else {
      json.usedAddons.forEach((a, i) => collectUsedAddonIssues(a, `usedAddons[${i}]`, issues));
    }
  }

  return issues;
}

/**
 * Validate a raw JSON value against the `project.c3proj` shape rules, returning every
 * violation found. Detection-only: it NEVER throws, and returns `[]` for a well-formed
 * manifest (cf. `validateForEditor` in `src/eventSheets.ts` — the same detect-don't-throw
 * pattern one level up the stack).
 *
 * A one-line wrapper over {@link collectManifestIssues}: by construction it cannot
 * diverge from the strict path {@link parseProjectManifest} uses (`issues[0]` is exactly
 * what the strict parser throws), which is the entire point of keeping the shape rules in
 * one collector.
 */
export function validateProjectManifest(json: unknown): ManifestValidationIssue[] {
  return collectManifestIssues(json);
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
  const issues = collectManifestIssues(json);
  if (issues.length > 0) throw new Error(`invalid project.c3proj: ${issues[0].message}`);
  return json as unknown as C3ProjectManifest;
}

/** Read and parse a project.c3proj file. Source-folder disk content is NOT consulted. */
export function readProjectManifest(manifestPath: string): C3ProjectManifest {
  return parseProjectManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
}

// ─── Tolerant reader ──────────────────────────────────────────────────────────

/**
 * Result of {@link parseProjectManifestTolerant} / {@link readProjectManifestTolerant}:
 * the manifest paired with every shape violation `validateProjectManifest` found in it.
 */
export interface ManifestReadResult {
  /** The document itself — the SAME object passed in / parsed, never a clone or projection. */
  manifest: C3ProjectManifest;
  issues: ManifestValidationIssue[];
}

/**
 * Parse a raw JSON value as a C3ProjectManifest WITHOUT throwing on shape violations —
 * the tolerant counterpart to {@link parseProjectManifest}. Intended for read-only and
 * repair paths: the manifests most in need of repair are precisely the ones most likely
 * to be field-level incomplete (a missing `savedWithRelease`, a `usedAddons` entry missing
 * `author`), and a strict reader that refuses to open them has the wrong failure mode
 * there. Strict (`parseProjectManifest`) remains the default; this is an opt-in, not a
 * loosening of it. For standalone detection without a document, see
 * {@link validateProjectManifest}. Callers that want to tolerate only SOME rules can filter
 * `issues` by `rule` (e.g. ignore `"saved-with-release-number"` but still act on everything
 * else) — a "tolerant except these rules" pattern.
 *
 * There is exactly ONE documented throw here: a non-object top level (`42`, `null`, `[]`,
 * …) still throws `invalid project.c3proj: top-level value must be an object`, matching
 * `parseProjectManifest`'s message exactly. There is no document to hand back in that case,
 * and returning `{} as C3ProjectManifest` would be a lie — tolerance is about field-level
 * shape, not "is this a manifest at all".
 *
 * The returned `manifest` is the SAME object passed in — no clone, no spread — so a caller
 * that mutates it in place and later calls `serializeProjectManifest`/`writeProjectManifest`
 * keeps the byte-fidelity guarantee those functions document.
 */
export function parseProjectManifestTolerant(json: unknown): ManifestReadResult {
  if (!isRecord(json)) throw new Error("invalid project.c3proj: top-level value must be an object");
  return { manifest: json as unknown as C3ProjectManifest, issues: collectManifestIssues(json) };
}

/**
 * Read and JSON.parse a project.c3proj file, then delegate to
 * {@link parseProjectManifestTolerant}. Source-folder disk content is NOT consulted.
 *
 * I/O errors (e.g. `ENOENT`) and `SyntaxError` from a malformed JSON file propagate
 * UNCHANGED — the second documented throw exception here, deliberately not wrapped: these
 * are I/O and syntax failures, not shape failures, and tolerance is scoped to shape only. A
 * caller that wants to own them composes `parseProjectManifestTolerant(JSON.parse(text))`
 * itself.
 */
export function readProjectManifestTolerant(manifestPath: string): ManifestReadResult {
  return parseProjectManifestTolerant(JSON.parse(readFileSync(manifestPath, "utf-8")));
}

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Serialize a manifest to the canonical `project.c3proj` on-disk form: tab-indented,
 * with NO trailing newline (see {@link serializeC3Json}).
 *
 * Does NOT validate — call `validateProjectManifest(m)` first if you need the gate.
 *
 * Returned as a **string**, separately from {@link writeProjectManifest}, because a
 * caller that needs different write mechanics — an atomic rename, suppressing a file
 * watcher during the write, or a policy that preserves whatever trailing newline the
 * original file happened to have — composes that on top of this string. That policy is
 * caller-side and deliberately NOT built in here.
 *
 * **Byte-fidelity caveat.** Round-tripping a manifest byte-for-byte depends on
 * {@link parseProjectManifest} having returned the parsed object BY IDENTITY and the
 * caller mutating it IN PLACE. Rebuilding the manifest via nested object spreads (e.g.
 * `{ ...m, layouts: { ...m.layouts, items: [...] } }`) reorders keys and loses any
 * unmodeled field not explicitly copied — it will not reproduce the original bytes.
 */
export function serializeProjectManifest(m: C3ProjectManifest): string {
  return serializeC3Json(m);
}

/**
 * Write a manifest to `manifestPath` in the canonical `project.c3proj` on-disk form
 * (see {@link serializeProjectManifest}), utf-8.
 *
 * Does NOT validate — call `validateProjectManifest(m)` first if you need the gate.
 *
 * **Byte-fidelity caveat.** As with {@link serializeProjectManifest}: round-tripping
 * byte-for-byte depends on the manifest object having been mutated IN PLACE from a
 * `parseProjectManifest`/`readProjectManifest` result, not rebuilt via object spreads,
 * which reorders keys and drops unmodeled fields.
 */
export function writeProjectManifest(manifestPath: string, m: C3ProjectManifest): void {
  writeC3JsonFile(manifestPath, m);
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
  /** Subfolder-name segments in the MANIFEST tree (absent on "untracked"). On
   *  "dangling-ref" this carries a synthetic `#<containerIndex>` segment instead
   *  of a subfolder name — the one place a path segment isn't a subfolder name. */
  manifestPath?: ManifestPathSegment[];
  /** Subfolder-name segments on DISK (absent on "missing" and "dangling-ref": a
   *  dangling reference is manifest-vs-manifest, with no disk counterpart). */
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
  for (const name of Array.isArray(folder.items) ? folder.items : []) out.push({ name, path: basePath });
  for (const sub of Array.isArray(folder.subfolders) ? folder.subfolders : []) {
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
  for (const entry of Array.isArray(folder.items) ? folder.items : []) out.push({ name: entry.name, path: basePath });
  for (const sub of Array.isArray(folder.subfolders) ? folder.subfolders : []) {
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
    } else if (isSectionItemName(entry)) {
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
 *
 * The image sub-detector ({@link detectImageDrift}) is best-effort: if it throws (e.g. an
 * unmapped image `fileType`), core drift still returns rather than failing, but the failure
 * is reported via {@link ManifestDrift.degraded} — never silently swallowed — with the
 * "images" section simply absent from {@link ManifestDrift.sections}. A degradation never
 * flips {@link ManifestDrift.inSync}, which stays `sections.length === 0` (#68).
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
      const declared = isRecord(folder) ? walkManifestFileTree(folder) : [];
      const onDisk = isRecord(folder)
        ? walkDiskFileTree(path.join(projectDir, folderName), folder.subfolders)
        : walkDiskFileTree(path.join(projectDir, folderName), []);
      const entries = diffNameMaps(declared, onDisk);
      if (entries.length) sections.push({ section: `rootFileFolders.${cat}`, folder: folderName, entries });
    }
  const containerEntries = detectContainerDrift(m);
  if (containerEntries.length) sections.push({ section: "containers", folder: "", entries: containerEntries });
  let degraded: DriftDegradation[] | undefined;
  try {
    const imagesDrift = detectImageDrift(projectDir, m);
    if (imagesDrift && imagesDrift.entries.length) sections.push(imagesDrift);
  } catch (err) {
    // Best-effort: never fail core drift on image derivation — but never hide the
    // failure either. The section is omitted AND the reason is reported (#68).
    (degraded ??= []).push({ section: "images", message: err instanceof Error ? err.message : String(err) });
  }
  // Strays are manifest-independent and are NOT drift: collected outside the
  // sections loop, never counted by inSync, omitted entirely when empty (the
  // `degraded` convention). See ADR 0025.
  const strayFiles = detectStrayFiles(projectDir);
  return {
    sections,
    inSync: sections.length === 0,
    ...(degraded ? { degraded } : {}),
    ...(strayFiles.length ? { strays: strayFiles } : {}),
  };
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
    for (const member of Array.isArray(container.members) ? container.members : [])
      if (!objectTypeNames.has(member)) entries.push({ kind: "dangling-ref", name: member, manifestPath: [`#${i}`] });
  });
  return entries;
}

// ─── Image-derived drift ──────────────────────────────────────────────────────

/**
 * C3 image `fileType` (MIME) -> on-disk file extension, dotted (`".png"`, matching
 * `path.extname`/`.suffix` convention — see issue #74).
 * A C3 platform fact owned here so downstream need not re-hardcode it (issue #29).
 * Exported so callers can introspect/extend.
 *
 * **AUDITED** for values — every `fileType` observed corpus-wide maps to a known
 * extension.
 *
 * **But VERSION-DEPENDENT**, which the value audit alone could not surface: C3
 * before r402 emits no `fileType` on image nodes at all. Pin exact — the
 * editor's own serializer (`editor.construct.net/r{397…407}/projectResources.js`)
 * first emits it at r402. See {@link C3_LEGACY_IMAGE_EXTENSION} for how that
 * pre-r402 case is handled.
 *
 * **Blast radius:** an unmapped MIME throws — via {@link detectManifestDrift}
 * that throw is caught and reported as a `ManifestDrift.degraded` entry (the
 * images section is then absent); via {@link detectImageDrift} /
 * `C3Project.detectImageDrift` it propagates. See `wiki/c3-domain-facts.md`
 * (#68) for the evidence volume.
 */
export const IMAGE_FILE_TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

/**
 * C3 script `type` (MIME, on a {@link C3FileEntry} under `rootFileFolders.script`) ->
 * on-disk file extension, dotted (`".js"`/`".ts"`, matching `path.extname`/`.suffix`
 * convention — see issue #74). A C3 platform fact owned here so downstream need not
 * re-hardcode it. Exported so callers can introspect/extend — deliberately kept
 * `Record<string, string>` rather than narrowed to a union, matching
 * {@link IMAGE_FILE_TYPE_EXTENSIONS}.
 *
 * **AUDITED** — matches C3's own editor bundle, which derives both extension and MIME
 * from a single ternary (`typescript ? "ts"/application/typescript :
 * "js"/application/javascript`) at `https://editor.construct.net/r{NNN}/projectResources.js`
 * (note: the root path, not `c3runtime/`), corroborated by the project corpus. That
 * ternary is exactly two branches — there is no `.mjs`/`.cjs`/`.jsx` script language in
 * C3, and these two dotted values are members of `SCRIPT_SOURCE_EXTENSIONS` (exported
 * from `./layouts.js`).
 *
 * **Version pin:** `application/typescript` exists only from **r433** onward; r432 has
 * no TypeScript MIME at all.
 *
 * **Blast radius:** an unmapped MIME is a silent miss in manifest interpretation, NOT a
 * throw — unlike {@link IMAGE_FILE_TYPE_EXTENSIONS}, which throws. See
 * `wiki/c3-domain-facts.md` for the evidence volume.
 */
export const SCRIPT_FILE_TYPE_EXTENSIONS: Record<string, string> = {
  "application/javascript": ".js",
  "application/typescript": ".ts",
};

/**
 * Resolve the on-disk extension for a C3 image `fileType` MIME string, treating an
 * absent/empty value as malformed (throws) rather than tolerating it as a pre-r402
 * legacy node. Unmapped (present but unrecognized) `fileType` also throws.
 * `context` is included in the error message to aid diagnosis.
 *
 * As of #68, {@link deriveExpectedImageNames} and {@link deriveExpectedImages} both derive
 * extensions through {@link extensionForFileTypeOrUndefined} (the absent-tolerant sibling)
 * instead — this strict variant has no remaining caller in this module. It is kept as the
 * documented "always throw on absent" contract for any future strict-only call site; it is
 * not wired into the current derivation path.
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

/** One expected on-disk image, as derived structurally from an object type. */
export interface ExpectedImage {
  /** Filename stem, no extension: "bullet-default-000", "tiledbackground". */
  stem: string;
  /** Dotted extension resolved from `fileType` via IMAGE_FILE_TYPE_EXTENSIONS (e.g. ".png"); absent for pre-r402 nodes that record no MIME. */
  ext?: string;
  /** Locator for diagnostics: "TiledBackground" or "Bullet/Default#0". */
  context: string;
}

/**
 * Pre-r402 C3 releases serialize image nodes with no `fileType` (MIME) field at all —
 * they write `exportFormat`/`exportQuality` (export re-encoding settings) instead, and
 * the on-disk file is still a real image, e.g. `bullet-default-000.png`.
 * `C3_LEGACY_IMAGE_EXTENSION` is the DEFAULT this repo assumes for such legacy nodes.
 *
 * This default is **not a guess**: C3's own project loader applies the identical
 * fallback (`t.fileType ?? "image/png"`, unchanged r402 -> r447), so c3source matches
 * the editor's own behavior rather than inventing a default (see `wiki/c3-domain-facts.md`,
 * #68).
 *
 * Do NOT read `exportFormat` (`"lossless"` / `"lossy"`) as a format proxy anywhere — it
 * is an export re-encoding setting, not the source MIME: `exportFormat: "lossy"` was
 * observed on real nodes whose actual source format is `image/png`. (#68)
 */
export const C3_LEGACY_IMAGE_EXTENSION = ".png";

/**
 * Resolve the on-disk extension for a C3 image `fileType` MIME string, tolerating an
 * absent/empty value (pre-r402 legacy nodes — see {@link C3_LEGACY_IMAGE_EXTENSION}) by
 * returning `undefined` rather than throwing. Still throws when `fileType` is present but
 * unmapped (unknown format). `context` is included in the error message to aid diagnosis.
 */
function extensionForFileTypeOrUndefined(fileType: unknown, context: string): string | undefined {
  if (fileType == null || fileType === "") return undefined;
  const ext = IMAGE_FILE_TYPE_EXTENSIONS[String(fileType)];
  if (ext === undefined) {
    throw new Error(`unknown image fileType "${String(fileType)}" on "${context}"`);
  }
  return ext;
}

/**
 * Structured counterpart of {@link deriveExpectedImageNames}: returns one
 * {@link ExpectedImage} per expected on-disk image, carrying the derived `ext` (or
 * `undefined` when the source `fileType` is absent, tolerated rather than treated as
 * malformed — see {@link C3_LEGACY_IMAGE_EXTENSION}) and a diagnostic `context` locator,
 * instead of a pre-joined filename string.
 *
 * Same structural derivation rules as `deriveExpectedImageNames` — a top-level `image`
 * field yields one entry (`stem` = the lowercased object type name), a top-level
 * `animations` field yields one entry per animation frame (`stem` =
 * `<lowercased-name>-<lowercased-animation-name>-<frame3>`, subfolders collapsed) — see
 * that function's doc comment for the full V1 coverage rule and explicit limits.
 *
 * An unmapped (but present) `fileType` still throws (unknown format); only an
 * absent/empty `fileType` is tolerated here, unlike `deriveExpectedImageNames`.
 */
export function deriveExpectedImages(objectType: Record<string, unknown>): ExpectedImage[] {
  const name = String(objectType.name).toLowerCase();
  if ("image" in objectType) {
    const img = objectType.image as Record<string, unknown>;
    const ext = extensionForFileTypeOrUndefined(img?.fileType, String(objectType.name));
    return [{ stem: name, ext, context: String(objectType.name) }];
  }
  if ("animations" in objectType) {
    const result: ExpectedImage[] = [];
    const collectAnimations = (folder: AnimationFolder): void => {
      for (const animItem of folder.items) {
        const animName = String(animItem.name).toLowerCase();
        const frames = Array.isArray(animItem.frames) ? animItem.frames : [];
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i] as Record<string, unknown>;
          const context = `${String(objectType.name)}/${animItem.name}#${i}`;
          const ext = extensionForFileTypeOrUndefined(frame?.fileType, context);
          result.push({ stem: `${name}-${animName}-${String(i).padStart(3, "0")}`, ext, context });
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
 * Derive the expected on-disk image filenames for a single object type — "what filename
 * would C3 have written?" A thin renderer over {@link deriveExpectedImages}: joins each
 * `ExpectedImage`'s `stem` and `ext` into a concrete filename, always. It must answer with
 * a name, so an absent `ext` (pre-r402 legacy node) is not left dangling — it renders with
 * the labelled default {@link C3_LEGACY_IMAGE_EXTENSION} instead of throwing.
 *
 * **V1 coverage rule (structural detection):**
 * - Object type with a top-level `image` field (NinePatch, TiledBg, Tilemap plugins and
 *   any future single-image plugin): exactly one expected image
 *   `<lowercased-name><ext>` (`ext` is dotted), where `ext` is derived from `image.fileType`
 *   via {@link IMAGE_FILE_TYPE_EXTENSIONS}.
 * - Object type with a top-level `animations` field (Sprite plugin and compatible):
 *   one `<lowercased-name>-<lowercased-animation-name>-<frame3><ext>` per animation frame
 *   (`ext` is dotted), where `frame3` is the zero-based frame index zero-padded to 3 digits
 *   (000, 001, …) and `ext` is derived from each frame's own `fileType` field via
 *   {@link IMAGE_FILE_TYPE_EXTENSIONS} (frames in the same animation may differ in format).
 *   Animation subfolders **collapse** — the subfolder name does NOT appear in the filename;
 *   animation names are unique within an object type.
 * - Object types with neither `image` nor `animations` (Text, JSON, etc.): no images.
 *
 * An **absent** `fileType` no longer throws: it renders as `<stem>{@link C3_LEGACY_IMAGE_EXTENSION}`.
 * A **present but unmapped** `fileType` still throws (unknown format) — that throw now
 * originates in {@link deriveExpectedImages}, not here.
 *
 * See {@link detectImageDrift} for the sibling function that answers a different question
 * ("is anything missing or orphaned?") and deliberately does NOT reuse this rendering for
 * legacy nodes — it stem-matches instead, so it can never manufacture a finding from the
 * default alone.
 *
 * **Explicit limits (extensible in future releases):**
 * - Does NOT cover spritesheet/atlas packing (a sprite whose frames are packed into a
 *   single atlas sheet will not match the per-frame pattern).
 * - Does NOT cover collision-polygon or image-point sidecar files.
 * - Detection is structural (field presence), not plugin-id allowlist — robust to
 *   third-party single-image plugins but may over-derive for unusual plugin shapes.
 */
export function deriveExpectedImageNames(objectType: Record<string, unknown>): string[] {
  return deriveExpectedImages(objectType).map((e) => `${e.stem}${e.ext ?? C3_LEGACY_IMAGE_EXTENSION}`);
}

/** Strip a filename's extension (the substring after the last `.`); returns the input
 *  unchanged if there is no extension (or the only `.` is a leading dotfile marker). */
function stripExt(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i <= 0 ? fileName : fileName.slice(0, i);
}

/**
 * Compare derived expected image names against the `images/` folder on disk — "is anything
 * missing or orphaned?" Returns a `SectionDrift` for the "images" section, or `null` if
 * `images/` is absent. Expected images are derived from all object-type JSON files under
 * `objectTypes/` via {@link deriveExpectedImages} (not {@link deriveExpectedImageNames}: this
 * function needs the structured `ext?` field, not a pre-joined name). Actual names are the
 * flat files found in `images/` (editor-local entries filtered). All paths are `[]` (images/
 * is a flat folder — no subfolder nesting for moves).
 *
 * **Ext-aware matching, deliberately more conservative than {@link deriveExpectedImageNames}:**
 * an `ExpectedImage` with a known `ext` is matched on the full filename `<stem><ext>` — exact,
 * unweakened (the #29 regression guard: a real extension mismatch still reports drift). An
 * `ExpectedImage` with `ext: undefined` (pre-r402 legacy node — see
 * {@link C3_LEGACY_IMAGE_EXTENSION}) is instead matched on its **stem** against the on-disk
 * `images/` filenames: if some on-disk file shares that stem (whatever its actual extension),
 * that file's real name is used, so it round-trips with no drift; otherwise the comparison
 * falls back to `<stem>{@link C3_LEGACY_IMAGE_EXTENSION}`, which reports as `missing` because
 * nothing on disk can match it. This is the mirror image of `deriveExpectedImageNames`'s
 * "must answer with a concrete name" contract: that function may never leave a legacy node
 * unlabeled, while this one may never let the legacy default alone *manufacture* a finding —
 * stem-matching is the more conservative choice, so an on-disk file in any recognized or
 * unrecognized format still satisfies a legacy expectation.
 *
 * Detection is best-effort (see `deriveExpectedImages` for coverage limits). A malformed or
 * unknown (present-but-unmapped) `fileType` in any object type causes `deriveExpectedImages` to
 * throw; that error propagates to the caller. `detectManifestDrift` wraps this function in a
 * try/catch so such a failure degrades gracefully to "images section omitted".
 */
export function detectImageDrift(projectDir: string, _manifest?: C3ProjectManifest): SectionDrift | null {
  const imagesDir = path.join(projectDir, IMAGES_FOLDER);
  if (!existsSync(imagesDir)) return null;

  const expectedImages: ExpectedImage[] = [];
  const objectTypesDir = path.join(projectDir, "objectTypes");
  if (existsSync(objectTypesDir)) {
    const jsonPaths = find_all_section_items_path(objectTypesDir);
    for (const jsonPath of jsonPaths) {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
      expectedImages.push(...deriveExpectedImages(parsed));
    }
  }

  const actualNames = readdirSync(imagesDir).filter(
    (f) => !isEditorLocalPath(f) && statSync(path.join(imagesDir, f)).isFile(),
  );
  const actualNameByStem = new Map<string, string>();
  for (const f of actualNames) actualNameByStem.set(stripExt(f), f);

  const expectedNames = expectedImages.map((e) =>
    e.ext !== undefined
      ? `${e.stem}${e.ext}`
      : (actualNameByStem.get(e.stem) ?? `${e.stem}${C3_LEGACY_IMAGE_EXTENSION}`),
  );

  const entries = diffNameMaps(
    expectedNames.map((n) => ({ name: n, path: [] as ManifestPathSegment[] })),
    actualNames.map((n) => ({ name: n, path: [] as ManifestPathSegment[] })),
  );

  return { section: "images", folder: IMAGES_FOLDER, entries };
}

// ─── Stray files ───────────────────────────────────────────────────────────

/**
 * A file found under a name-section root that is neither a section item
 * ({@link isSectionItemName}) nor editor-local ({@link isEditorLocalPath}) —
 * e.g. `layouts/Level1.dsl.txt`, `objectTypes/tiles/notes.md`. See ADR 0025.
 *
 * This is deliberately NOT drift: a name section keys its items on `<name>`
 * derived from `<name>.json` (see {@link C3_SECTION_ITEM_EXTENSION}), so a
 * stray file has no manifest position and can never acquire one — it can be
 * neither `missing` nor `untracked`, and there is nothing a caller could map
 * it to. That is why, unlike {@link DriftEntry}, `StrayFile` carries no
 * `manifestPath` — the absence is load-bearing, not an oversight. It is
 * surfaced so a misfiled file is visible at all, never as a worklist item.
 *
 * Under a name-section root, every non-editor-local file is exactly one of an
 * item or a stray: {@link find_all_section_items_path} and
 * {@link detectStrayFiles} partition the same walk disjointly and
 * exhaustively.
 */
export interface StrayFile {
  /** The name-section key, e.g. `"layouts"` — a {@link C3_SECTION_FOLDERS} key. */
  section: string;
  /** The resolved on-disk folder name, e.g. `"layouts"`. */
  folder: string;
  /** The bare basename, e.g. `"Level1.dsl.txt"`. */
  name: string;
  /** Section-root-relative subfolder segments; `[]` at the section root. */
  diskPath: ManifestPathSegment[];
}

/**
 * Find every stray file (see {@link StrayFile}) under each of the seven
 * name-section roots ({@link C3_SECTION_FOLDERS}).
 *
 * **Manifest-independent**: reads no `project.c3proj` and takes none — it
 * works even when the manifest is absent or malformed, because item-hood is
 * decided purely from a basename (`isSectionItemName`) and provenance purely
 * from a basename (`isEditorLocalPath`), never from declared membership. A
 * section directory that does not exist on disk is skipped, not reported.
 *
 * **Deliberately not wrapped in a degradation guard** (contrast
 * {@link detectImageDrift}'s try/catch): there is no domain-level throw here
 * to catch — this only classifies basenames the walk already read — so any
 * failure would be a filesystem failure ({@link find_all_files_path} itself
 * throwing) that the surrounding drift run could not have survived either.
 * Do not add a try/catch around this call; it would silently hide a real
 * failure rather than degrade a best-effort sub-detector.
 *
 * The exact complement of {@link find_all_section_items_path} over the same
 * walk: for a given section directory, the two functions' results are
 * disjoint and their union is every non-editor-local file in that directory.
 *
 * Scoped to the seven name sections only. `rootFileFolders` categories
 * (`scripts/`, `sounds/`, …) are out of scope because file-folder membership
 * is extension-agnostic by design — there is no item-hood rule for a stray to
 * violate there (`scripts/` has its own, separate rule, ADR 0024). `images/`
 * is out of scope because it is a flat asset folder, not a name section, at
 * all.
 */
export function detectStrayFiles(projectDir: string): StrayFile[] {
  const out: StrayFile[] = [];
  for (const [section, folderName] of Object.entries(C3_SECTION_FOLDERS)) {
    const dir = path.join(projectDir, folderName);
    if (!existsSync(dir)) continue;
    for (const abs of find_all_files_path(dir, (f) => !isSectionItemName(f) && !isEditorLocalPath(f))) {
      const rel = path.relative(dir, abs).split(path.sep);
      out.push({ section, folder: folderName, name: rel[rel.length - 1], diskPath: rel.slice(0, -1) });
    }
  }
  return out;
}

