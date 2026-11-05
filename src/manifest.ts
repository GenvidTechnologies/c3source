import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
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
   *  section root and on degenerate empty subfolders C3 serializes without a name. A nameless
   *  direct child of `timelines` is the transitions container ({@link TIMELINE_TRANSITIONS_FOLDER});
   *  drift never reports it `folder-missing`, and {@link resolveManifestFolders} maps a path back. */
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

/**
 * An item name that occurs more than once in a uniqueness scope, reported by {@link ManifestDrift.duplicates}.
 * A repeat is counted on either side (manifest or disk).
 *
 * What counts as a duplicate depends on the scope:
 * - `layouts`: case-insensitive (`normalize().toLowerCase()`), whatever folder the layout sits in;
 * - `eventSheets`: the same as `layouts`;
 * - `objectClasses`: `objectTypes` and `families` together, one namespace, case-insensitive. An object
 *   type and a family with the same name are a duplicate;
 * - `timelines`, `flowcharts`, `models3d`: exact comparison, whatever folder the item sits in;
 * - `rootFileFolders.<cat>` and `images`: exact comparison, two occurrences in the same folder (the same
 *   path) only. The same file name in different folders is legitimate and not reported.
 *   For `images`, the declared side is derived from object-type animation names
 *   (`deriveExpectedImages`), not listed in the manifest. A repeat there is therefore a derivation
 *   collision, such as type `A-B` / anim `C` vs type `A` / anim `B-C`. It is fixed by renaming an
 *   object type or animation, not by editing the manifest.
 *
 * Drift keying (`diffNameMaps`) stays exact: a case-only rename reads as `missing` plus `untracked`.
 *
 * `System`: a user object class named `System` is not reported here, because the built-in `System` is not
 * in the manifest. {@link itemNameIssue} reports that name as reserved.
 *
 * **Advisory**: a duplicate is never drift and never affects {@link ManifestDrift.inSync}.
 *
 * **AUDITED against the C3 editor bundle at r495-2**: the editor's r495-2 name lookup treats these as one
 * name. The capture is `raw/issue-125-duplicate-name-lookups-bundle-evidence-2026-11-04.md`. It covers the
 * seven name sections. Residual: r379 and r402 were not traced, no editor was run, the project load path
 * was not traced, and folding once may differ from the editor's lowercase-then-`hM` order for some
 * non-ASCII names.
 *
 * **UNVALIDATED**: for the `rootFileFolders.*` sections and `images` only, the per-folder scope was
 * inferred, not confirmed against the C3 editor.
 */
export interface DuplicateName {
  /** The uniqueness scope: a section key, or `"objectClasses"` for objectTypes and families together. */
  scope: string;
  /** The compared form: `name.normalize().toLowerCase()` in a folded scope, the name itself otherwise. */
  key: string;
  /** Every declared occurrence, sorted by section walk order, then path key, then name. */
  manifest: DuplicateOccurrence[];
  /** Every on-disk occurrence, same order. */
  disk: DuplicateOccurrence[];
}

/** One occurrence of a repeated name, reported in {@link DuplicateName}. */
export interface DuplicateOccurrence {
  /** The section holding the occurrence, e.g. `"objectTypes"`, `"rootFileFolders.script"`, `"images"`. */
  section: string;
  /** The section's on-disk folder, e.g. `"objectTypes"`, `"scripts"`. */
  folder: string;
  /** The name as written: the manifest item name, or the on-disk stem or file name. */
  name: string;
  /** The folder path below the section root. */
  path: ManifestPathSegment[];
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
   * sections that were checked", not "no drift". A section the caller skipped through
   * `ManifestDriftOptions` is also absent, and is not listed here.
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
  /**
   * Item names repeated within a uniqueness scope (see {@link DuplicateName} for the scopes).
   * **Advisory, never drift**: never counted by {@link ManifestDrift.inSync}. Present only when
   * non-empty — same convention as {@link ManifestDrift.degraded} and {@link ManifestDrift.strays}.
   * Ordered by scope (the name scopes in walk order, with `objectClasses` at the position of `objectTypes`,
   * then the file sections, then `images`), then by `key` (UTF-16 code unit order).
   */
  duplicates?: DuplicateName[];
  /**
   * Symbolic links and junctions found below a section root and not followed (see {@link SkippedLink}).
   * **Advisory, never drift**: never counted by {@link ManifestDrift.inSync}. Present only when
   * non-empty — same convention as {@link ManifestDrift.degraded} and {@link ManifestDrift.strays}.
   * Ordered by the walk order of sections, then pre-order with sorted names within a section.
   */
  links?: SkippedLink[];
}

/** Options scoping a {@link detectManifestDrift} call. Every field is optional; `{}` equals no options. */
export interface ManifestDriftOptions {
  /**
   * When true, the seven `rootFileFolders.<cat>` sections are not checked. Neither their manifest walk
   * nor their disk walk runs, so a filesystem error under a file folder (e.g. `scripts` being a
   * regular file) is not raised. The result then holds no `rootFileFolders.*` entry in `sections`,
   * `duplicates` or `links`. `inSync` keeps its definition and counts only the sections that were
   * checked. The manifest object is not read differently or modified. When `manifest` is omitted it is
   * still read and validated in full. Default false: identical to a call without options.
   */
  skipFileSections?: boolean;
}

/** A symbolic link or junction found below a section root and not followed. Advisory, never drift. */
export interface SkippedLink {
  /** The section, e.g. `"layouts"`, `"rootFileFolders.script"`, `"images"`. */
  section: string;
  /** The section's on-disk folder, e.g. `"layouts"`, `"scripts"`, `"images"`. */
  folder: string;
  /** The bare basename of the link. */
  name: string;
  /** Section-root-relative subfolder segments of the link's parent; `[]` at the section root. */
  diskPath: ManifestPathSegment[];
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
  | "name-folder-item-empty"
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
 * `usedAddons`, then, after everything else, the empty-item-name pass over `NAME_SECTIONS`
 * (last so that `issues[0]` stays unchanged for any input that already had an issue). Within
 * a name/file-folder node: `isRecord` → `items` → `subfolders` → `name` LAST → recurse
 * subfolders by index — the old `assertNameFolder`/`assertFileFolder` checked `name` AFTER
 * items/subfolders; do not "tidy" that into checking `name` first, or a doubly-malformed
 * input silently throws a different message than before.
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

  for (const sec of NAME_SECTIONS) if (sec in json) collectEmptyItemNameIssues(json[sec], sec, issues);

  return issues;
}

/**
 * Report every item named `""` in a name-section tree, pre-order (a node's own items, then its
 * subfolders by index). Descends only into well-shaped nodes: a record whose `items` is a
 * string[] is checked, and `subfolders` is walked only when it is an array. Never throws.
 */
function collectEmptyItemNameIssues(v: unknown, where: string, issues: ManifestValidationIssue[]): void {
  if (!isRecord(v)) return;
  if (Array.isArray(v.items) && v.items.every((i) => typeof i === "string"))
    v.items.forEach((it, j) => {
      if (it === "")
        issues.push({
          path: `${where}.items[${j}]`,
          rule: "name-folder-item-empty",
          message: `${where}.items[${j}] must not be an empty string`,
        });
    });
  if (Array.isArray(v.subfolders))
    v.subfolders.forEach((sf, i) => collectEmptyItemNameIssues(sf, `${where}.subfolders[${i}]`, issues));
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
 * C3 always saves the container, but the directory exists only while it holds something, so
 * drift never reports it `folder-missing`; {@link resolveManifestFolders} maps a path back to
 * its declaring folders.
 */
export const TIMELINE_TRANSITIONS_FOLDER = "transitions";

/**
 * Manifest rootFileFolders category → on-disk source folder (plural).
 * CONFIRMED by fixture: script→scripts, icon→icons, sound→sounds, music→music,
 * font→fonts, general→files (the last four since construct3-sample v1.2.0, which
 * populates them; the drift tests walk each one).
 * Also confirmed by an editor save at C3 r506.3: video→videos. construct3-sample v1.3.0
 * populates the `video` section from that save, and the drift tests walk it. Evidence:
 * `raw/issue-113-video-section-editor-save-2026-11-02.md`.
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
  for (const visit of walkManifestFolders(folder, basePath, unnamedSubfolderName))
    for (const name of Array.isArray(visit.folder.items) ? visit.folder.items : [])
      out.push({ name, path: visit.path });
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
  for (const visit of walkManifestFolders(folder, basePath))
    for (const entry of Array.isArray(visit.folder.items) ? visit.folder.items : [])
      out.push({ name: entry.name, path: visit.path });
  return out;
}

/**
 * How a folder's drift-path segment came about: `"root"` is the section root (no segment of its own),
 * `"named"` a folder contributing its own name, `"transitions-container"` the nameless direct child
 * of the `timelines` root that C3 maps to `transitions`, and `"transparent"` any other nameless
 * folder, which shares its parent's path.
 */
export type ManifestFolderOrigin = "root" | "named" | "transitions-container" | "transparent";

/** One folder reached by the manifest folder walk. */
interface FolderVisit<F extends C3NameFolder | C3FileFolder> {
  folder: F;
  parent: F | null;
  path: ManifestPathSegment[];
  origin: ManifestFolderOrigin;
}

/**
 * The one folder-segment rule shared by every manifest walk. Visits come in manifest pre-order.
 * - The root has origin "root" and path `basePath` (its own `name` is never a segment).
 * - A named folder contributes its name (origin "named").
 * - A nameless DIRECT child of the walked root contributes `unnamedSubfolderName` when given
 *   (origin "transitions-container"); it is not propagated deeper.
 * - Every other nameless folder is transparent: same path as its parent.
 */
function walkManifestFolders<F extends C3NameFolder | C3FileFolder>(
  root: F,
  basePath: ManifestPathSegment[] = [],
  unnamedSubfolderName?: string,
): FolderVisit<F>[] {
  const out: FolderVisit<F>[] = [{ folder: root, parent: null, path: basePath, origin: "root" }];
  const descend = (parent: F, parentPath: ManifestPathSegment[], isRoot: boolean): void => {
    for (const sub of (Array.isArray(parent.subfolders) ? parent.subfolders : []) as F[]) {
      let path = parentPath;
      let origin: ManifestFolderOrigin = "transparent";
      if (sub.name !== undefined) {
        path = [...parentPath, sub.name];
        origin = "named";
      } else if (isRoot && unnamedSubfolderName !== undefined) {
        path = [...parentPath, unnamedSubfolderName];
        origin = "transitions-container";
      }
      out.push({ folder: sub, parent, path, origin });
      descend(sub, path, false);
    }
  };
  descend(root, basePath, true);
  return out;
}

/** The segment C3 gives a section's unnamed top-level subfolder, if that section has one. */
function unnamedSegmentFor(section: string): string | undefined {
  return section === "timelines" ? TIMELINE_TRANSITIONS_FOLDER : undefined;
}

/** Map key for a manifest/disk path. */
function pathKey(path: ReadonlyArray<ManifestPathSegment>): string {
  return formatManifestPath(path);
}

/** One folder returned by {@link resolveManifestFolders}. */
export interface ResolvedManifestFolder<F extends C3NameFolder | C3FileFolder = C3NameFolder> {
  /** The live folder object from the walked tree; callers may mutate it. */
  folder: F;
  /** The folder's parent in the manifest tree, or null for the section root. */
  parent: F | null;
  /** How the folder's drift-path segment came about. */
  origin: ManifestFolderOrigin;
}

/**
 * Resolve a drift `manifestPath` back to the manifest folder(s) that declare it: the inverse of the
 * drift path model.
 *
 * Returns EVERY folder whose drift path equals `manifestPath`, in manifest pre-order (a folder before
 * its descendants, siblings in manifest order), and `[]` when nothing matches. It never picks one
 * match for the caller.
 *
 * Several folders can share one path. In the `timelines` section a named `"transitions"` folder and the
 * nameless transitions container both have the path `["transitions"]`, so both are returned, told
 * apart by `origin` (`"named"` vs `"transitions-container"`). A transparent nameless folder shares its
 * parent's path, so it is returned alongside that parent (and alongside any of its own direct children
 * whose path equals it).
 *
 * The result order is pre-order, NOT level-order. construct3-chef's local `foldersAt` walks level by
 * level, so `[0]` can differ between the two when a transparent folder and a direct child share a path.
 *
 * `section` is {@link SectionDrift.section} verbatim: a manifest section key such as `"timelines"`.
 * `"timelines"` enables the nameless-container segment; any other key, including
 * `"rootFileFolders.<cat>"`, makes every nameless folder transparent. An unknown key (a typo like
 * `"Timelines"`) gets no container segment, so `["transitions"]` resolves to `[]` for it.
 */
export function resolveManifestFolders<F extends C3NameFolder | C3FileFolder>(
  sectionFolder: F,
  manifestPath: readonly ManifestPathSegment[],
  section: string,
): ResolvedManifestFolder<F>[] {
  const key = pathKey(manifestPath);
  return walkManifestFolders(sectionFolder, [], unnamedSegmentFor(section))
    .filter((v) => pathKey(v.path) === key)
    .map((v) => ({ folder: v.folder, parent: v.parent, origin: v.origin }));
}

// ─── Path-preserving disk tree walks ─────────────────────────────────────────

/**
 * Yield every source-name item found on disk under a name-section root directory,
 * with its section-root-relative subfolder path.
 * `path` segments are relative to `diskFolder` (the section root), never absolute.
 * Skips editor-local entries via `isEditorLocalPath`. Returns [] if `diskFolder` absent.
 * Never yields an empty name: an empty-stem `.json` is not a section item
 * (`isSectionItemName`), so it is a stray, not an entry here.
 * Uses `readdirSync`/`lstatSync` directly (NOT `find_all_files_path`) to preserve path context.
 * Classifies each entry with `lstatSync`, so a symbolic link or junction below `diskFolder` is
 * neither descended into nor yielded as an item.
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
    const st = lstatSync(full);
    if (st.isDirectory()) {
      out.push(...walkDiskNameTree(full, [...basePath, entry]));
    } else if (st.isFile() && isSectionItemName(entry)) {
      out.push({ name: path.basename(entry, ".json"), path: basePath });
    }
  }
  return out;
}

/**
 * Yield every source file found on disk under a file-section root directory,
 * with its section-root-relative subfolder path.
 * By default (D3/R5) recurses ONLY into subdirectories whose name matches a declared subfolder's
 * `name`; undeclared subdirs are never walked.
 * With `options.walkUndeclared` it recurses into every directory that is not editor-local, so files
 * under undeclared subfolders are yielded too (an undeclared directory recurses with no declared
 * subfolders). `isEditorLocalPath` (which covers `ts-defs/`, `uistate/`, `*.uistate.json` and
 * `tsconfig.json`) is the only exclusion under that option.
 * Emits full filenames WITH extension (file-folder matching is extension-agnostic, R11).
 * Classifies each entry with `lstatSync`, so a symbolic link or junction below `diskFolder` is
 * neither descended into nor yielded.
 * Returns [] if `diskFolder` absent.
 */
export function walkDiskFileTree(
  diskFolder: string,
  declaredSubfolders: C3FileFolder[],
  basePath: ManifestPathSegment[] = [],
  options?: { walkUndeclared?: boolean },
): Array<{ name: string; path: ManifestPathSegment[] }> {
  if (!existsSync(diskFolder)) return [];
  const out: Array<{ name: string; path: ManifestPathSegment[] }> = [];
  for (const entry of readdirSync(diskFolder).sort()) {
    if (isEditorLocalPath(entry)) continue;
    const full = path.join(diskFolder, entry);
    const st = lstatSync(full);
    if (st.isDirectory()) {
      // Default: only recurse into declared subfolders. Editor-local dirs (e.g. ts-defs/) were
      // already skipped above, so they stay out under walkUndeclared too.
      const matched = declaredSubfolders.find((sf) => sf.name === entry);
      if (matched) out.push(...walkDiskFileTree(full, matched.subfolders, [...basePath, entry], options));
      else if (options?.walkUndeclared) out.push(...walkDiskFileTree(full, [], [...basePath, entry], options));
    } else if (st.isFile()) {
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

/**
 * Sort drift entries deterministically (in place; returns the array): kind, then name, then
 * manifestPath, then diskPath. The path tiebreaks use plain `<`/`>` so the order is locale-independent.
 */
function sortDriftEntries(entries: DriftEntry[]): DriftEntry[] {
  const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
  entries.sort(
    (a, b) =>
      DRIFT_KIND_ORDER[a.kind] - DRIFT_KIND_ORDER[b.kind] ||
      a.name.localeCompare(b.name) ||
      cmp(pathKey(a.manifestPath ?? []), pathKey(b.manifestPath ?? [])) ||
      cmp(pathKey(a.diskPath ?? []), pathKey(b.diskPath ?? [])),
  );
  return entries;
}

/** Group name→path lists by name, keeping every occurrence. */
function groupPathsByName(
  items: Array<{ name: string; path: ManifestPathSegment[] }>,
): Map<string, ManifestPathSegment[][]> {
  const byName = new Map<string, ManifestPathSegment[][]>();
  for (const { name, path: p } of items) {
    const paths = byName.get(name);
    if (paths) paths.push(p);
    else byName.set(name, [p]);
  }
  return byName;
}

/**
 * Diff two name→path lists and return structured DriftEntry records.
 * A name can repeat at several paths (it is only unique per folder), so occurrences are compared by
 * name AND path:
 * - name occurring exactly once on each side, paths differ → moved (carries both manifestPath and diskPath)
 * - name occurring exactly once on each side, same path → no entry
 * - otherwise, each manifest path with no equal disk path → missing; each disk path with no equal
 *   manifest path → untracked (repeats of an identical path collapse)
 * Results are sorted deterministically by kind, then name, then path.
 */
export function diffNameMaps(
  manifestItems: Array<{ name: string; path: ManifestPathSegment[] }>,
  diskItems: Array<{ name: string; path: ManifestPathSegment[] }>,
): DriftEntry[] {
  const mByName = groupPathsByName(manifestItems);
  const dByName = groupPathsByName(diskItems);

  const entries: DriftEntry[] = [];
  for (const name of new Set([...mByName.keys(), ...dByName.keys()])) {
    const mPaths = mByName.get(name) ?? [];
    const dPaths = dByName.get(name) ?? [];
    if (mPaths.length === 1 && dPaths.length === 1) {
      if (pathKey(mPaths[0]) !== pathKey(dPaths[0])) {
        entries.push({ kind: "moved", name, manifestPath: mPaths[0], diskPath: dPaths[0] });
      }
      continue;
    }
    const mKeys = new Map(mPaths.map((p) => [pathKey(p), p]));
    const dKeys = new Map(dPaths.map((p) => [pathKey(p), p]));
    for (const [key, p] of mKeys) if (!dKeys.has(key)) entries.push({ kind: "missing", name, manifestPath: p });
    for (const [key, p] of dKeys) if (!mKeys.has(key)) entries.push({ kind: "untracked", name, diskPath: p });
  }
  return sortDriftEntries(entries);
}

/** Compare two strings by UTF-16 code unit, with plain `<`/`>`. */
const byCodePoint = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** The form of an item name that a folded scope compares. */
const foldItemName = (name: string): string => name.normalize().toLowerCase();

/**
 * Uniqueness scopes of the seven name sections, in walk order; a shared scope sits at its first section.
 * Every key of C3_SECTION_FOLDERS must be in exactly one scope (test "#125 D8").
 *
 * Paired invariant: this table and the bullets of the {@link DuplicateName} JSDoc change together.
 * The scopes follow the r495-2 editor lookups: `Jpt`/`HU` (layouts), `Qpt`/`JU` (event sheets),
 * `lU` on `QCn` (object types and families, one map), `q4s`/`O$` (timelines), `Ypt`/`Y$` (flowcharts)
 * and `xVt`/`vG` (models 3D).
 */
const NAME_DUPLICATE_SCOPES: ReadonlyArray<{ scope: string; sections: readonly C3NameSection[]; fold: boolean }> = [
  { scope: "layouts", sections: ["layouts"], fold: true },
  { scope: "eventSheets", sections: ["eventSheets"], fold: true },
  { scope: "objectClasses", sections: ["objectTypes", "families"], fold: true },
  { scope: "timelines", sections: ["timelines"], fold: false },
  { scope: "flowcharts", sections: ["flowcharts"], fold: false },
  { scope: "models3d", sections: ["models3d"], fold: false },
];

/** Group occurrences by `keyOf(name)`, keeping every occurrence. */
function groupOccurrences(
  items: DuplicateOccurrence[],
  keyOf: (name: string) => string,
): Map<string, DuplicateOccurrence[]> {
  const byKey = new Map<string, DuplicateOccurrence[]>();
  for (const item of items) {
    const key = keyOf(item.name);
    const group = byKey.get(key);
    if (group) group.push(item);
    else byKey.set(key, [item]);
  }
  return byKey;
}

/** Order occurrences by section walk order, then path key, then name. */
function compareOccurrences(a: DuplicateOccurrence, b: DuplicateOccurrence): number {
  const rank = (section: string): number => {
    const i = Object.keys(C3_SECTION_FOLDERS).indexOf(section);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return (
    rank(a.section) - rank(b.section) || byCodePoint(pathKey(a.path), pathKey(b.path)) || byCodePoint(a.name, b.name)
  );
}

/**
 * Report the keys repeated on either side of a scope. `extent` "section": any key occurring more than
 * once anywhere; "folder": a key occurring twice at the same path. Keys are ordered with plain `<`/`>`.
 */
function collectDuplicates(
  scope: string,
  extent: "section" | "folder",
  fold: boolean,
  manifestItems: DuplicateOccurrence[],
  diskItems: DuplicateOccurrence[],
): DuplicateName[] {
  const keyOf = fold ? foldItemName : (name: string): string => name;
  const m = groupOccurrences(manifestItems, keyOf);
  const d = groupOccurrences(diskItems, keyOf);
  const repeats = (items: DuplicateOccurrence[]): boolean =>
    extent === "section" ? items.length > 1 : new Set(items.map((o) => pathKey(o.path))).size < items.length;
  const keys = [...new Set([...m.keys(), ...d.keys()])].sort(byCodePoint);
  const out: DuplicateName[] = [];
  for (const key of keys) {
    const manifest = [...(m.get(key) ?? [])].sort(compareOccurrences);
    const disk = [...(d.get(key) ?? [])].sort(compareOccurrences);
    if (repeats(manifest) || repeats(disk)) out.push({ scope, key, manifest, disk });
  }
  return out;
}

/**
 * Collect every subfolder path (segment chains of names) declared in a manifest name- or file-folder tree.
 * `unnamedSubfolderName` mirrors {@link walkManifestNameTree}: a nameless direct child of the
 * section root adopts that name (the `timelines/transitions` exception); not propagated into
 * recursion, so it applies to top-level children only. Returns `{path, origin}` for the named folders
 * and the transitions container (origin `"named"` or `"transitions-container"`).
 */
function collectManifestFolderPaths(
  folder: C3NameFolder | C3FileFolder,
  base: ManifestPathSegment[] = [],
  unnamedSubfolderName?: string,
): Array<{ path: ManifestPathSegment[]; origin: ManifestFolderOrigin }> {
  return walkManifestFolders(folder, base, unnamedSubfolderName)
    .filter((v) => v.origin === "named" || v.origin === "transitions-container")
    .map((v) => ({ path: v.path, origin: v.origin }));
}

/** A symbolic link or junction met by {@link collectDiskFolderPaths}: its name and its parent's path. */
interface DiskLink {
  name: string;
  path: ManifestPathSegment[];
}

/**
 * Collect every subdirectory path (segment chains, section-root-relative) on disk, editor-local filtered.
 * A symbolic link or junction is not followed and is not returned; it is pushed to `links` when given.
 */
function collectDiskFolderPaths(
  dir: string,
  base: ManifestPathSegment[] = [],
  links?: DiskLink[],
): ManifestPathSegment[][] {
  if (!existsSync(dir)) return [];
  const out: ManifestPathSegment[][] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (isEditorLocalPath(entry)) continue;
    const st = lstatSync(path.join(dir, entry));
    if (st.isSymbolicLink()) {
      links?.push({ name: entry, path: base });
      continue;
    }
    if (st.isDirectory()) {
      const childPath = [...base, entry];
      out.push(childPath);
      out.push(...collectDiskFolderPaths(path.join(dir, entry), childPath, links));
    }
  }
  return out;
}

/**
 * Diff manifest-declared subfolder paths against on-disk subdirectory paths, returning
 * folder-level drift entries (folder-missing for manifest-only, folder-untracked for
 * disk-only). A subfolder present on both sides yields no entry (folders are keyed by
 * their full path, so there is no folder "move"). `name` is the leaf subfolder name.
 * The transitions container's `folder-missing` is skipped (its directory is absent while empty), and
 * each manifest path is reported once even if declared by several folders.
 */
function diffFolderPaths(
  manifestFolders: Array<{ path: ManifestPathSegment[]; origin: ManifestFolderOrigin }>,
  diskPaths: ManifestPathSegment[][],
): DriftEntry[] {
  const mSet = new Set(manifestFolders.map((f) => pathKey(f.path)));
  const dSet = new Set(diskPaths.map(pathKey));
  const entries: DriftEntry[] = [];
  const reported = new Set<string>();
  for (const { path: p, origin } of manifestFolders) {
    // C3 always saves the timelines transitions container, but its directory is absent while the
    // container is empty. Keyed on origin, not the path string: a user-NAMED "transitions" folder
    // must still be reported when its directory is missing.
    if (origin === "transitions-container") continue;
    const key = pathKey(p);
    if (dSet.has(key) || reported.has(key)) continue;
    reported.add(key);
    entries.push({ kind: "folder-missing", name: p[p.length - 1], manifestPath: p });
  }
  for (const p of diskPaths)
    if (!mSet.has(pathKey(p))) entries.push({ kind: "folder-untracked", name: p[p.length - 1], diskPath: p });
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
 *
 * The result also carries the advisory {@link ManifestDrift.duplicates}: item names occurring more
 * than once in a uniqueness scope (see {@link DuplicateName}). They never count as drift and never affect `inSync`.
 *
 * A symbolic link or junction below a section root is not followed: it is not an item, not a
 * folder and not a stray. Each one is listed in the advisory {@link ManifestDrift.links}, which is
 * never drift and never affects `inSync`. A tree with no such link has no `links` key.
 *
 * `options.skipFileSections` ({@link ManifestDriftOptions}) is the supported way to skip the seven
 * `rootFileFolders.<cat>` sections. Without it, the file sections are walked only when the manifest's
 * `rootFileFolders` is truthy: with `rootFileFolders` absent they are not walked, with
 * `rootFileFolders: {}` they are walked (each category read as empty), and with a name-section key
 * absent its folder is still walked.
 */
export function detectManifestDrift(
  projectDir: string,
  manifest?: C3ProjectManifest,
  options?: ManifestDriftOptions,
): ManifestDrift {
  const m = manifest ?? readProjectManifest(path.join(projectDir, PROJECT_MANIFEST_FILE));
  const sections: SectionDrift[] = [];
  const duplicates: DuplicateName[] = [];
  const links: SkippedLink[] = [];
  type NameLeaf = ReturnType<typeof walkDiskNameTree>[number];
  const nameSides = new Map<string, { declared: DuplicateOccurrence[]; onDisk: DuplicateOccurrence[] }>();
  for (const [section, folderName] of Object.entries(C3_SECTION_FOLDERS)) {
    const sectionFolder = m[section] as C3NameFolder | undefined;
    // timelines exception: the unnamed top-level subfolder is the on-disk transitions/ ("Eases") dir.
    const unnamed = unnamedSegmentFor(section);
    const declared = sectionFolder ? walkManifestNameTree(sectionFolder, [], unnamed) : [];
    const onDisk = walkDiskNameTree(path.join(projectDir, folderName));
    const itemEntries = diffNameMaps(declared, onDisk);
    const skipped: DiskLink[] = [];
    const folderEntries = diffFolderPaths(
      sectionFolder ? collectManifestFolderPaths(sectionFolder, [], unnamed) : [],
      collectDiskFolderPaths(path.join(projectDir, folderName), [], skipped),
    );
    for (const l of skipped) links.push({ section, folder: folderName, name: l.name, diskPath: l.path });
    const entries = sortDriftEntries([...itemEntries, ...folderEntries]);
    if (entries.length) sections.push({ section, folder: folderName, entries });
    const occurrences = (items: NameLeaf[]): DuplicateOccurrence[] =>
      items.map(({ name, path: p }) => ({ section, folder: folderName, name, path: p }));
    nameSides.set(section, { declared: occurrences(declared), onDisk: occurrences(onDisk) });
  }
  for (const { scope, sections: members, fold } of NAME_DUPLICATE_SCOPES) {
    const sides = members.map((s) => nameSides.get(s));
    duplicates.push(
      ...collectDuplicates(
        scope,
        "section",
        fold,
        sides.flatMap((s) => s?.declared ?? []),
        sides.flatMap((s) => s?.onDisk ?? []),
      ),
    );
  }
  const rff = options?.skipFileSections ? undefined : m.rootFileFolders;
  if (rff)
    for (const [cat, folderName] of Object.entries(C3_ROOT_FILE_FOLDERS)) {
      const folder = rff[cat as keyof C3RootFileFolders];
      const declared = isRecord(folder) ? walkManifestFileTree(folder) : [];
      const diskDir = path.join(projectDir, folderName);
      const onDisk = walkDiskFileTree(diskDir, isRecord(folder) ? folder.subfolders : [], [], { walkUndeclared: true });
      const skipped: DiskLink[] = [];
      const folderEntries = diffFolderPaths(
        isRecord(folder) ? collectManifestFolderPaths(folder) : [],
        collectDiskFolderPaths(diskDir, [], skipped),
      );
      for (const l of skipped)
        links.push({ section: `rootFileFolders.${cat}`, folder: folderName, name: l.name, diskPath: l.path });
      const entries = sortDriftEntries([...diffNameMaps(declared, onDisk), ...folderEntries]);
      if (entries.length) sections.push({ section: `rootFileFolders.${cat}`, folder: folderName, entries });
      const fileOcc = (items: Array<{ name: string; path: ManifestPathSegment[] }>): DuplicateOccurrence[] =>
        items.map(({ name, path: p }) => ({ section: `rootFileFolders.${cat}`, folder: folderName, name, path: p }));
      const mOcc = fileOcc(declared);
      const dOcc = fileOcc(onDisk);
      duplicates.push(...collectDuplicates(`rootFileFolders.${cat}`, "folder", false, mOcc, dOcc));
    }
  const containerEntries = detectContainerDrift(m);
  if (containerEntries.length) sections.push({ section: "containers", folder: "", entries: containerEntries });
  let degraded: DriftDegradation[] | undefined;
  try {
    const lists = imageDriftLists(projectDir);
    if (lists) {
      const entries = diffNameMaps(lists.expected, lists.actual);
      if (entries.length) sections.push({ section: "images", folder: IMAGES_FOLDER, entries });
      const imgOcc = (items: Array<{ name: string; path: ManifestPathSegment[] }>): DuplicateOccurrence[] =>
        items.map(({ name, path: p }) => ({ section: "images", folder: IMAGES_FOLDER, name, path: p }));
      duplicates.push(...collectDuplicates("images", "folder", false, imgOcc(lists.expected), imgOcc(lists.actual)));
      for (const name of lists.links) links.push({ section: "images", folder: IMAGES_FOLDER, name, diskPath: [] });
    }
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
    ...(duplicates.length ? { duplicates } : {}),
    ...(links.length ? { links } : {}),
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
 * File extension, dotted and lowercase (`".png"`), -> the `type` (MIME) the C3 editor
 * records on a {@link C3FileEntry} under `rootFileFolders`. The writer direction of
 * {@link IMAGE_FILE_TYPE_EXTENSIONS} / {@link SCRIPT_FILE_TYPE_EXTENSIONS}, which
 * map the other way. The editor takes `type` from its MIME registry, by extension plus a
 * section hint [bundle r495] [bundle r460]. The table is flat in every `rootFileFolders`
 * section (the r49502 experiment showed general, sound, music and font agree), except
 * where {@link SECTION_EXTENSION_FILE_TYPES} overrides it; resolve a section-aware `type`
 * with {@link fileTypeForSection}. Today the only such cell is the `video` section's
 * `.webm`. Evidence: `raw/issue-113-video-section-bundle-evidence-2026-11-02.md` and
 * `raw/issue-113-video-section-editor-save-2026-11-02.md`. Exported so callers
 * can introspect/extend — an open `Record<string, string>`, see ADR 0024 Compromise 5.
 *
 * **KNOWN INCOMPLETE** — this table is not exhaustive and never claims to be. The registry
 * grows across releases: r509 registers `.mtl`, which has no row [bundle r509].
 *
 * **AUDITED** (observed in two or more independent editor-saved projects): `.css`,
 * `.html`, `.json`, `.png`, `.js`, `.ts`, `.ttf`, `.webm`, `.plist`.
 *
 * **UNVALIDATED** (seen in one project or one editor save): `.txt`, `.xml`, `.vtt`,
 * `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.mp4`, `.mp3`, `.m4a`. `.ogv` and `.mov` have
 * one save each, in `video` [editor save r50603].
 *
 * **BUNDLE-PREDICTED** (the value is what the editor bundle's own lookup returns for the
 * extension, which has exactly one MIME registration, so no section hint or browser
 * `File.type` can change it, and the r495 trace of the entry paths found none that can; no
 * editor-saved project has recorded it; a row moves to UNVALIDATED at its first editor save
 * that records the value): `.htm`, `.scon`, `.scml`,
 * `.csv`, `.tsv`, `.md`, `.ini`, `.apng`, `.jxl`, `.tif`, `.tiff`, `.bmp`, `.ico`, `.avif`,
 * `.avifs`, `.opus`, `.ogg`, `.wav`, `.flac`, `.mid`, `.midi`, `.kar`, `.mpg`, `.mpeg`, `.qt`,
 * `.avi`, `.woff`, `.woff2`, `.otf`, `.eot`, `.pdf`, `.zip`, `.c3p`, `.capx`, `.wasm`,
 * `.wast`, `.mem`, `.c3addon`, `.c2addon`, `.glb`, `.gltf` [bundle r495] [bundle r506-3];
 * `.fbx` and `.obj` [bundle r506-3] (absent from the r495 registry).
 *
 * **Observed, not specified:** the registry lives in the editor bundle and is not a
 * documented contract. AUDITED and UNVALIDATED values are observed editor outputs
 * (C3 r49502); BUNDLE-PREDICTED values are read from the registry. Other OSes are untested.
 *
 * **Blast radius:** a silently wrong `type` is written into `project.c3proj`. The editor
 * keeps a registered stored `type` on load and does not re-derive it from the extension, so
 * a wrong registered `type` survives a project load [bundle r495].
 *
 * **Fallback policy**, contrasted with both siblings: {@link IMAGE_FILE_TYPE_EXTENSIONS}
 * throws on an unknown key (via its accessor), and {@link SCRIPT_FILE_TYPE_EXTENSIONS}
 * yields a silent `undefined`. This table, indexed directly, is also `undefined`;
 * {@link fileTypeForName} instead falls back to {@link C3_DEFAULT_FILE_TYPE}. See
 * `wiki/c3-domain-facts.md` for the evidence.
 */
export const EXTENSION_FILE_TYPES: Record<string, string> = {
  // AUDITED
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".ttf": "application/font-sfnt",
  ".webm": "audio/webm; codecs=opus",
  ".plist": "application/octet-stream",
  // UNVALIDATED
  ".txt": "text/plain",
  ".xml": "text/xml",
  ".vtt": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  // BUNDLE-PREDICTED
  ".htm": "text/html",
  ".scon": "application/json",
  ".scml": "text/xml",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".md": "text/markdown",
  ".ini": "text/x-ini",
  ".apng": "image/apng",
  ".jxl": "image/jxl",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".avifs": "image/avif",
  ".opus": "audio/ogg; codecs=opus",
  ".ogg": "audio/ogg; codecs=vorbis",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".kar": "audio/midi",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".qt": "video/quicktime",
  ".avi": "video/avi",
  ".woff": "application/font-woff",
  ".woff2": "font/woff2",
  ".otf": "application/font-sfnt",
  ".eot": "application/vnd.ms-fontobject",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".c3p": "application/zip",
  ".capx": "application/zip",
  ".wasm": "application/wasm",
  ".wast": "application/wast",
  ".mem": "application/octet-stream",
  ".c3addon": "application/x-construct3-addon",
  ".c2addon": "application/x-construct2-addon",
  ".glb": "model/glb",
  ".gltf": "model/gltf",
  ".fbx": "model/fbx",
  ".obj": "model/obj",
};

/**
 * The `type` {@link fileTypeForName} returns for an extension absent from {@link EXTENSION_FILE_TYPES}.
 * It equals the registry's fallback type for an unregistered extension [bundle r495].
 */
export const C3_DEFAULT_FILE_TYPE = "application/octet-stream";

/**
 * The `type` (MIME) the C3 editor would record for a file entry named `name`, resolved
 * from its extension via {@link EXTENSION_FILE_TYPES}. Case-insensitive; accepts a bare
 * name or a `/`- or `\`-separated path (only the basename is considered). A name with no
 * extension, a trailing dot, or an unlisted extension returns {@link C3_DEFAULT_FILE_TYPE}.
 *
 * @example
 * fileTypeForName("files/sub/PHOTO.JPG"); // "image/jpeg"
 * fileTypeForName("LICENSE"); // "application/octet-stream"
 */
export function fileTypeForName(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot);
  return Object.prototype.hasOwnProperty.call(EXTENSION_FILE_TYPES, ext)
    ? EXTENSION_FILE_TYPES[ext]
    : C3_DEFAULT_FILE_TYPE;
}

/** A key of {@link C3RootFileFolders}: one root file section of the manifest. */
export type C3FileSection = keyof C3RootFileFolders;

/**
 * The info-object key each file section's entries carry. The editor's item serializer
 * writes `icon-info` for `icon`, `script-info` for `script` and `file-info` for every other
 * section [bundle r495] [bundle r460]. Evidence:
 * `raw/issue-113-video-section-bundle-evidence-2026-11-02.md`.
 */
export const C3_FILE_INFO_KEYS = {
  script: "script-info",
  sound: "file-info",
  music: "file-info",
  video: "file-info",
  font: "file-info",
  icon: "icon-info",
  general: "file-info",
} as const satisfies Record<C3FileSection, string>;

/**
 * The `purpose` value of a default file-info object. The editor's item constructor starts the
 * icon, script and file purposes at `"none"` [bundle r495] [bundle r460]. An `icon` item
 * loaded without an `icon-info` key does not keep that default: its purpose is chosen from
 * its name (for example `loading-logo.png` gives `loading-logo`). Evidence:
 * `raw/issue-113-video-section-bundle-evidence-2026-11-02.md`.
 */
export const C3_DEFAULT_FILE_INFO_PURPOSE = "none";

/**
 * Per-section extension overrides of {@link EXTENSION_FILE_TYPES}, keyed by section, then by
 * dotted lowercase extension. Read through {@link fileTypeForSection}.
 *
 * It holds only the cells whose type differs by section; today that is the `video` `.webm`
 * cell. The section hint `video/` selects the second `.webm` registration, `video/webm`, over
 * the first, `audio/webm; codecs=opus` [bundle r495]. The cell is confirmed by one editor save
 * at r506.3 [editor save r50603], so it is UNVALIDATED (one save). The imported `.webm` also
 * recorded `video/webm`, which depends on the browser's `File.type`. Evidence:
 * `raw/issue-113-video-section-bundle-evidence-2026-11-02.md` and
 * `raw/issue-113-video-section-editor-save-2026-11-02.md`.
 */
export const SECTION_EXTENSION_FILE_TYPES: Partial<Record<C3FileSection, Record<string, string>>> = {
  video: { ".webm": "video/webm" },
};

/**
 * The extensions of the Videos set in the editor's Import Files dialog [bundle r495]
 * (r460 has the same video set). This is one of two answers to "which extensions does the
 * video section accept"; the other is below.
 *
 * - **Import dialog:** `.webm`, `.ogv`, `.mp4`, which is this constant.
 * - **Rescanning the `videos/` folder on disk:** a file is admitted when the category of its
 *   registry type (the first segment of the type string) is `video`. The type is looked up
 *   by extension with the section hint `video/` [bundle r495]. This is not a list of
 *   extensions. For example `.mpg`, `.mov` and `.avi` have `video/` registry types, so the
 *   bundle predicts a rescan can admit them although the dialog does not offer them. Only
 *   `.mov` was observed being admitted [editor save r50603].
 *
 * The content checks (`Acs` and `Ocs` in the bundle) appear in the folder-import dialog's
 * `_us` callback, while the rescan computes admission by registry category [bundle r495].
 * Inference: the rescan runs no content check, a reading from absence. The content checks
 * decide which section accepts an imported file, not which `type` is stored.
 *
 * The `type` of a file added through the Import dialog depends on the browser's `File.type`:
 * a registered `File.type` that lists the extension is kept, otherwise the lookup runs with
 * no section hint [bundle r495]. The editor save at r506.3 imported a `.webm` and recorded
 * `video/webm`, which depends on the browser's `File.type` [editor save r50603]; no other
 * browser has been observed. Evidence: `raw/issue-113-video-section-bundle-evidence-2026-11-02.md`
 * and `raw/issue-113-video-section-editor-save-2026-11-02.md`.
 */
export const C3_VIDEO_IMPORT_EXTENSIONS = [".webm", ".ogv", ".mp4"] as const;

/**
 * The `type` (MIME) for a file named `name` in the given section, where the editor's type is
 * known to c3source. Section-aware form of {@link fileTypeForName}: it applies the section's
 * row in {@link SECTION_EXTENSION_FILE_TYPES} when the extension has one, and otherwise returns
 * {@link fileTypeForName}`(name)`. Name parsing is the same as {@link fileTypeForName}: only
 * the basename of a `/`- or `\`-separated path counts, case-insensitively.
 *
 * The section override comes from the bundle [bundle r495]. The `.webm` cell is confirmed by
 * one editor save at r506.3 [editor save r50603], so it is UNVALIDATED (one save). See
 * `raw/issue-113-video-section-bundle-evidence-2026-11-02.md`
 * and `raw/issue-113-video-section-editor-save-2026-11-02.md`.
 *
 * @example
 * fileTypeForSection("video", "intro.webm"); // "video/webm"
 * fileTypeForSection("sound", "intro.webm"); // "audio/webm; codecs=opus"
 * fileTypeForSection("general", "x.mov"); // "video/quicktime"
 */
export function fileTypeForSection(section: C3FileSection, name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot);
  const rows = Object.prototype.hasOwnProperty.call(SECTION_EXTENSION_FILE_TYPES, section)
    ? SECTION_EXTENSION_FILE_TYPES[section]
    : undefined;
  return rows && Object.prototype.hasOwnProperty.call(rows, ext) ? rows[ext] : fileTypeForName(name);
}

/**
 * **AUDITED against the C3 editor bundle at r495-2.**
 *
 * The System plugin's expression names (`expressionName` in the release's `plugins/allAces.json`),
 * deprecated ones included. The C3 editor reserves an object-class name that matches one of them,
 * ignoring letter case (the System plugin's expression lookup). The capability flags that add common
 * expressions to that lookup are all off for System at r495-2 (observed in the bundle). Other routes
 * to the System plugin-info object were not traced. See
 * `raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md`.
 *
 * The table is pinned to r495-2: a later release can reserve names it lacks. Regenerate it with
 * `scripts/system-expression-names.mjs` on that release's `allAces.json`.
 *
 * A name missing from the table lets a caller accept an object-class name the editor refuses on
 * create or rename. An extra name refuses a name the editor would accept.
 */
export const C3_SYSTEM_EXPRESSION_NAMES: readonly string[] = [
  "WindowWidth",
  "WindowHeight",
  "OriginalWindowWidth",
  "OriginalWindowHeight",
  "OriginalViewportWidth",
  "OriginalViewportHeight",
  "LayerScale",
  "LayerOpacity",
  "LayerScaleRate",
  "LayerAngle",
  "ViewportLeft",
  "ViewportTop",
  "ViewportRight",
  "ViewportBottom",
  "ViewportWidth",
  "ViewportHeight",
  "ViewportMidX",
  "ViewportMidY",
  "LayerToCanvasX",
  "LayerToCanvasY",
  "CanvasToLayerX",
  "CanvasToLayerY",
  "LayerToLayerX",
  "LayerToLayerY",
  "LayerScrollX",
  "LayerScrollY",
  "LayerParallaxX",
  "LayerParallaxY",
  "LayerIndex",
  "LayerZElevation",
  "CallMapped",
  "scrollx",
  "scrolly",
  "LayoutWidth",
  "LayoutHeight",
  "LayoutScale",
  "LayoutName",
  "LayoutAngle",
  "CanvasSnapshot",
  "VanishingPointX",
  "VanishingPointY",
  "sqrt",
  "abs",
  "round",
  "roundToDp",
  "floor",
  "ceil",
  "sign",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "exp",
  "ln",
  "log10",
  "max",
  "min",
  "distance",
  "distance3d",
  "angle",
  "lerp",
  "pi",
  "anglediff",
  "anglelerp",
  "anglerotate",
  "unlerp",
  "Infinity",
  "setbit",
  "togglebit",
  "getbit",
  "qarp",
  "cubic",
  "cosp",
  "imageloadingprogress",
  "SaveStateJSON",
  "objectcount",
  "loopindex",
  "renderer",
  "projectversion",
  "projectid",
  "projectuniqueid",
  "loadingprogress",
  "ImageMemoryUsage",
  "projectname",
  "rendererDetail",
  "CurrentEventSheetName",
  "CurrentEventNumber",
  "ProjectFileCount",
  "ProjectFileNameAt",
  "len",
  "newline",
  "uppercase",
  "lowercase",
  "find",
  "left",
  "right",
  "mid",
  "tokenat",
  "tokencount",
  "replace",
  "StringSub",
  "trim",
  "zeropad",
  "URLEncode",
  "URLDecode",
  "RegexSearch",
  "RegexReplace",
  "RegexMatchCount",
  "RegexMatchAt",
  "findCase",
  "dt",
  "wallclockdt",
  "timescale",
  "time",
  "tickcount",
  "fps",
  "wallclocktime",
  "cpuutilisation",
  "gpuutilisation",
  "unixtime",
  "int",
  "float",
  "str",
  "random",
  "clamp",
  "choose",
  "chooseindex",
  "rgb",
  "rgbEx",
  "rgba",
  "rgbEx255",
  "rgba255",
  "HexColor",
  "ColorToHexString",
];

/** A name-section key: a manifest section whose items are `<name>.json` files. */
export type C3NameSection = keyof typeof C3_SECTION_FOLDERS;

/**
 * One finding from {@link itemNameIssue}. `rewritten` is not a refusal: the editor stores `name`
 * instead of the input. Every other kind is a refusal; `name` is the transformed name the editor
 * checked and `message` is the text the editor throws.
 */
export type ItemNameIssue =
  | { kind: "rewritten"; name: string }
  | {
      kind: "empty" | "too-long" | "device-name" | "reserved-word" | "system-expression";
      name: string;
      message: string;
    };

const ITEM_NAME_LENGTH_LIMIT = 200;
const ITEM_NAME_DEVICES: ReadonlySet<string> = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `com${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `lpt${n}`),
]);
const ITEM_NAME_FORBIDDEN: ReadonlySet<string> = new Set([
  String.fromCharCode(92),
  "/",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
  "~",
]);
const ITEM_NAME_WHITESPACE: ReadonlySet<string> = new Set(
  [
    0x0020, 0x0009, 0x000a, 0x000d, 0x00a0, 0x0085, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  ].map((c) => String.fromCodePoint(c)),
);
// Characters the object-class transform drops (besides whitespace).
const OBJECT_CLASS_DROPPED: ReadonlySet<string> = new Set(
  [
    ...[0x2e, 0x3002, 0x2c, 0xff0c, 0x22, 0x201c, 0x201d, 0x28, 0xff08, 0x29, 0xff09, 0x3f, 0xff1f, 0x3a, 0xff1a],
    ...[0x5c, 0x2f, 0x3b, 0x2a, 0x7c, 0x27, 0x2d, 0x60, 0x21, 0xac, 0xa3, 0x24, 0x25, 0x5e, 0x26, 0x2b, 0x3d],
    ...[0x3c, 0x3e, 0x7b, 0x7d, 0x5b, 0x5d, 0x40, 0x23, 0x7e, 0xad],
  ].map((c) => String.fromCodePoint(c)),
);
const OBJECT_CLASS_RESERVED_WORDS: ReadonlySet<string> = new Set(["self", "true", "false", "system"]);
const SYSTEM_EXPRESSION_NAMES_LOWER: ReadonlySet<string> = new Set(
  C3_SYSTEM_EXPRESSION_NAMES.map((n) => n.toLowerCase()),
);

const STRIP_SECTION_LABELS: Readonly<Record<string, string>> = {
  layouts: "layout",
  eventSheets: "event sheet",
  timelines: "timeline",
  flowcharts: "flowchart",
  models3d: "model 3d",
};

/** The editor's strip for layout-style names: NFC, drop forbidden characters, trim edges, cut to the limit. */
function stripItemName(name: string): string {
  const chars = [...name.normalize()].filter((c) => !ITEM_NAME_FORBIDDEN.has(c));
  while (chars.length && (chars[chars.length - 1] === "." || ITEM_NAME_WHITESPACE.has(chars[chars.length - 1]))) {
    chars.pop();
  }
  while (chars.length && (chars[0] === "." || ITEM_NAME_WHITESPACE.has(chars[0]))) chars.shift();
  if (chars.length > ITEM_NAME_LENGTH_LIMIT) chars.length = ITEM_NAME_LENGTH_LIMIT;
  return chars.join("");
}

/** The editor's object-class transform (`nit(name, true)`). */
function normalizeObjectClassItemName(name: string): string {
  const chars = [...name.normalize()];
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i] === " ") chars[i + 1] = chars[i + 1].toUpperCase();
  }
  const kept = chars.filter((c) => !OBJECT_CLASS_DROPPED.has(c) && !ITEM_NAME_WHITESPACE.has(c));
  while (kept.length && kept[0] === "_") kept.shift();
  return kept.every((c) => /^[0-9]$/.test(c)) ? "" : kept.join("");
}

/**
 * **AUDITED against the C3 editor bundle at r495-2.**
 *
 * What the C3 editor does with an item name in the strip sections (`layouts`, `eventSheets`,
 * `timelines`, `flowcharts`, `models3d`) and in `objectTypes` and `families`. r379 and r402 are not
 * traced for these rules. The rules are quoted in
 * `raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md` [bundle r495-2].
 *
 * Returns the first issue in the editor's order, or `undefined` when the editor stores the name
 * unchanged. `rewritten` is not a refusal: the editor's rename UI accepts it with a warning, and a
 * stricter caller may refuse it. `issue?.name ?? name` is the stored name when the name is not refused.
 * The setter returns early, without checks, when the new name equals the current one; that case is
 * not modelled.
 *
 * - Strip sections: strip the name (NFC, forbidden characters, edge dots and whitespace, cut to 200
 *   code points), then refuse an empty name, a name of 200 or more code points (counted on the NFC
 *   form of the stripped name, because removing a character can bring a base letter next to a
 *   combining mark), or a device name. The `name` of a result is the stripped name, which is what the
 *   setter stores. The `message` is the section's setter text with the input name in it.
 * - Object classes: models the rename setter (and the constructor's result for an empty name), not the
 *   object-type loader. The name is transformed, then refused when empty (`invalid name`) or reserved
 *   (`name is reserved`): a device name, then `self`/`true`/`false`/`system` ignoring case, then a
 *   System expression name ({@link C3_SYSTEM_EXPRESSION_NAMES}) ignoring case. `System` is reported as
 *   `reserved-word` with the setter's already-used text (`object class name 'System' already used`),
 *   because the setter checks "already used" before "reserved" and the System object class is always
 *   registered.
 *
 * The object-class create path (the object-class constructor) differs from the setter. An exact
 * `System` is exempt from its reserved check, the reserved check is skipped while the project is
 * loading (inferred from the code, not run), and it checks reserved before used. The object-type
 * loader gives a literal empty stem an automatic name rather than throwing, so `empty` is not the
 * loader's result; the family loader throws `invalid name` (observed in the r495-2 bundle). `System`
 * itself is already registered in every project, so a create or rename to `System` fails as already
 * used (observed).
 *
 * Uniqueness (`already used`, case-insensitive, shared by `objectTypes` and `families`) needs project
 * state and is not checked here. {@link detectManifestDrift} reports it in the advisory
 * {@link ManifestDrift.duplicates}. {@link validateProjectManifest} does not call
 * `itemNameIssue`; its empty check tests the raw string.
 *
 * Blast radius: a false accept in a strip section can make the project fail to open (the setter runs
 * on load; issue #100 saw this live for `""`). A false accept of a rewritten object-class name means
 * the editor stores a different name, and a later save can lose the file. A false refusal only blocks
 * a name the editor would accept.
 *
 * Residual, inferred: `normalize` and `toUpperCase` follow the JS engine's Unicode version, which may
 * differ from the editor's browser for newly assigned code points.
 *
 * @throws Error when `section` is not a name section (a JS caller can pass any string).
 *
 * @example
 * itemNameIssue("layouts", "a/b"); // { kind: "rewritten", name: "ab" }
 * itemNameIssue("objectTypes", "Time"); // { kind: "system-expression", name: "Time", message: "name is reserved" }
 */
export function itemNameIssue(section: C3NameSection, name: string): ItemNameIssue | undefined {
  if (Object.prototype.hasOwnProperty.call(STRIP_SECTION_LABELS, section)) {
    const stripped = stripItemName(name);
    const message = `invalid ${STRIP_SECTION_LABELS[section]} name '${name}'`;
    if (stripped === "") return { kind: "empty", name: stripped, message };
    if ([...stripped.normalize()].length >= ITEM_NAME_LENGTH_LIMIT) {
      return { kind: "too-long", name: stripped, message };
    }
    if (ITEM_NAME_DEVICES.has(stripped.toLowerCase())) return { kind: "device-name", name: stripped, message };
    return stripped !== name ? { kind: "rewritten", name: stripped } : undefined;
  }
  if (section === "objectTypes" || section === "families") {
    const n = normalizeObjectClassItemName(name);
    if (n === "") return { kind: "empty", name: n, message: "invalid name" };
    const lower = n.toLowerCase();
    if (lower === "system") {
      return { kind: "reserved-word", name: n, message: `object class name '${n}' already used` };
    }
    const message = "name is reserved";
    if (ITEM_NAME_DEVICES.has(lower)) return { kind: "device-name", name: n, message };
    if (OBJECT_CLASS_RESERVED_WORDS.has(lower)) return { kind: "reserved-word", name: n, message };
    if (SYSTEM_EXPRESSION_NAMES_LOWER.has(lower)) return { kind: "system-expression", name: n, message };
    return n !== name ? { kind: "rewritten", name: n } : undefined;
  }
  throw new Error(`itemNameIssue: unknown name section '${String(section)}'`);
}

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
 *
 * A symbolic link or junction below `images/` is not followed and is not an image, so it never
 * appears in the result. {@link detectManifestDrift} lists such links in {@link ManifestDrift.links}.
 */
export function detectImageDrift(projectDir: string, _manifest?: C3ProjectManifest): SectionDrift | null {
  const lists = imageDriftLists(projectDir);
  if (lists === null) return null;

  const entries = diffNameMaps(lists.expected, lists.actual);

  return { section: "images", folder: IMAGES_FOLDER, entries };
}

/** The expected (derived from object types) and actual (on-disk `images/`) name lists that
 *  {@link detectImageDrift} diffs. Every `path` is `[]` (`images/` is flat). */
interface ImageDriftLists {
  expected: Array<{ name: string; path: ManifestPathSegment[] }>;
  actual: Array<{ name: string; path: ManifestPathSegment[] }>;
  /** Root-level names in `images/` that are symbolic links or junctions: skipped, not followed. */
  links: string[];
}

/** Build the lists {@link detectImageDrift} diffs; `null` if `images/` is absent. May throw
 *  (see {@link deriveExpectedImages}). */
function imageDriftLists(projectDir: string): ImageDriftLists | null {
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
    (f) => !isEditorLocalPath(f) && lstatSync(path.join(imagesDir, f)).isFile(),
  );
  const actualNameByStem = new Map<string, string>();
  for (const f of actualNames) actualNameByStem.set(stripExt(f), f);

  const expectedNames = expectedImages.map((e) =>
    e.ext !== undefined
      ? `${e.stem}${e.ext}`
      : (actualNameByStem.get(e.stem) ?? `${e.stem}${C3_LEGACY_IMAGE_EXTENSION}`),
  );

  const links = readdirSync(imagesDir)
    .sort()
    .filter((f) => !isEditorLocalPath(f) && lstatSync(path.join(imagesDir, f)).isSymbolicLink());

  return {
    expected: expectedNames.map((n) => ({ name: n, path: [] as ManifestPathSegment[] })),
    actual: actualNames.map((n) => ({ name: n, path: [] as ManifestPathSegment[] })),
    links,
  };
}

// ─── Stray files ───────────────────────────────────────────────────────────

/**
 * A file found under a name-section root that is neither a section item
 * ({@link isSectionItemName}) nor editor-local ({@link isEditorLocalPath}) —
 * e.g. `layouts/Level1.dsl.txt`, `objectTypes/tiles/notes.md`, or an
 * empty-stem `layouts/.json`. See ADR 0025.
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

