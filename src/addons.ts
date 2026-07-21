import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { BehaviorTypeRef, EffectTypeRef, Family, ObjectType, find_all_files_path, isEditorLocalPath } from "./layouts.js";

// ─── Addon attribution model ───────────────────────────────────────────────

/**
 * Which addon (plugin/behavior/effect) an object type or family draws on, distilled
 * from its own declared fields. Pure derivation — no manifest cross-reference, no I/O.
 */
export interface AddonAttribution {
  /** The object type's or family's own `name`. */
  name: string;
  /** Which kind of source item this attribution was derived from. */
  source: "objectType" | "family";
  /** The `plugin-id` the item is built on (e.g. `"Sprite"`, `"Text"`). */
  pluginId: string;
  /** `behaviorId` of every attached behavior, in declared order. */
  behaviorIds: string[];
  /** `effectId` of every attached effect, in declared order. */
  effectIds: string[];
}

/**
 * Derive the addon attribution of a single object type from its own declared fields:
 * `plugin-id`, and the `behaviorId`/`effectId` of each entry in `behaviorTypes`/`effectTypes`
 * (both optional — absent treated as empty).
 */
export function attributeObjectType(ot: ObjectType): AddonAttribution {
  return {
    name: ot.name,
    source: "objectType",
    pluginId: ot["plugin-id"],
    behaviorIds: (ot.behaviorTypes ?? []).map((b: BehaviorTypeRef) => b.behaviorId),
    effectIds: (ot.effectTypes ?? []).map((e: EffectTypeRef) => e.effectId),
  };
}

/**
 * Derive the addon attribution of a single family from its own declared fields — same
 * shape and derivation as {@link attributeObjectType}, `source: "family"`.
 */
export function attributeFamily(f: Family): AddonAttribution {
  return {
    name: f.name,
    source: "family",
    pluginId: f["plugin-id"],
    behaviorIds: (f.behaviorTypes ?? []).map((b: BehaviorTypeRef) => b.behaviorId),
    effectIds: (f.effectTypes ?? []).map((e: EffectTypeRef) => e.effectId),
  };
}

/**
 * Derive addon attribution for a full set of object types and families. Pure: object
 * types first (in the given order), then families (in the given order) — no I/O, no
 * manifest cross-reference.
 */
export function collectAddonAttribution(objectTypes: ObjectType[], families: Family[]): AddonAttribution[] {
  return objectTypes.map(attributeObjectType).concat(families.map(attributeFamily));
}

// ─── .c3addon discovery ────────────────────────────────────────────────────

/**
 * File extension of a C3 addon package (a zip archive containing an addon's
 * `addon.json` + assets). C3 r487-pinned fact, owned here as a domain fact
 * (cf. {@link EVENTVAR_REFERENCE_ACES} in eventSheets.ts) so downstream does
 * not re-hardcode it.
 */
export const C3ADDON_EXTENSION = ".c3addon";

/**
 * Find all `.c3addon` package files under `dir`, recursively. There is no
 * canonical C3 subfolder for addon-source storage (unlike layouts/objectTypes/
 * etc.), so this takes a bare directory rather than a project-derived path.
 * Built on {@link find_all_files_path} — same pattern as `find_all_objectTypes_path`
 * etc.: only the extension and the non-editor-local check gate inclusion.
 */
export function findAllAddons(dir: string): string[] {
  return find_all_files_path(dir, (file) => file.endsWith(C3ADDON_EXTENSION) && !isEditorLocalPath(file));
}

// ─── .c3addon package reading ───────────────────────────────────────────────

/**
 * The UTF-8 byte-order-mark character. C3's own addon-authoring tooling writes
 * a leading BOM on some (not all) files inside a `.c3addon` package — observed
 * on `aces.json` but not `addon.json` in SDK samples — so readers must tolerate
 * it. C3 r487-pinned fact, owned here (cf. {@link C3ADDON_EXTENSION}).
 */
export const UTF8_BOM = "﻿";

/** Filename of an addon's manifest entry within a `.c3addon` package (C3 r487-pinned domain fact). */
export const ADDON_MANIFEST_FILE = "addon.json";

/** Filename of an addon's ACE-definitions entry within a `.c3addon` package (C3 r487-pinned domain fact). */
export const ADDON_ACES_FILE = "aces.json";

/** Drop a single leading {@link UTF8_BOM} character, if present. Idempotent. */
export function stripBom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
}

/**
 * A read-only handle over a `.c3addon` package's entries, uniform over its two
 * on-disk forms: an unpacked directory (as an addon author works with it) or a
 * zip archive (the `.c3addon` file itself, as C3 loads it). See {@link readAddonPackage}.
 */
export interface AddonPackage {
  /** The directory or zip file path this package was opened from. */
  readonly source: string;
  /** Which on-disk form `source` is. */
  readonly kind: "directory" | "zip";
  /** Entry names available in this package (top-level only for directory mode). */
  entryNames(): string[];
  /** Whether `name` is a known entry. */
  hasEntry(name: string): boolean;
  /** Read an entry's raw bytes. Throws if `name` is not a known entry. */
  readBytes(name: string): Uint8Array;
  /** Read an entry as UTF-8 text, with a leading BOM (if any) stripped. */
  readText(name: string): string;
  /** Read and parse an entry as JSON (BOM-stripped first). Throws `invalid <name>: ...` on parse failure. */
  readJson(name: string): unknown;
}

/**
 * Build the `readText`/`readJson` pair from a `readBytes` implementation — the single
 * code path shared by both {@link readAddonPackage} modes: decode via `strFromU8`, strip
 * a leading BOM, and (for JSON) parse with an `invalid <name>: ...` error prefix on failure
 * (mirrors `parseProjectManifest`'s error-prefix idiom in manifest.ts).
 */
function textReaders(readBytes: (name: string) => Uint8Array): Pick<AddonPackage, "readText" | "readJson"> {
  const readText = (name: string): string => stripBom(strFromU8(readBytes(name)));
  const readJson = (name: string): unknown => {
    const text = readText(name);
    try {
      return JSON.parse(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`invalid ${name}: ${message}`);
    }
  };
  return { readText, readJson };
}

/**
 * Open a `.c3addon` package for reading, auto-detecting its on-disk form: a
 * directory (an unpacked addon source tree) or a zip file (the `.c3addon`
 * archive itself, as C3 loads it). Zip mode eagerly unzips at construction
 * (packages are small); directory mode reads entries lazily (top-level only —
 * addon.json/aces.json are always top-level, so nested zip-internal paths are
 * out of scope). Throws if `source` does not exist.
 */
export function readAddonPackage(source: string): AddonPackage {
  const stat = statSync(source, { throwIfNoEntry: false });
  if (!stat) throw new Error(`addon package not found: ${source}`);

  if (stat.isDirectory()) {
    const readBytes = (name: string): Uint8Array => readFileSync(join(source, name));
    return {
      source,
      kind: "directory",
      entryNames: () => readdirSync(source).filter((entry) => statSync(join(source, entry)).isFile()),
      hasEntry: (name) => statSync(join(source, name), { throwIfNoEntry: false })?.isFile() ?? false,
      readBytes,
      ...textReaders(readBytes),
    };
  }

  const entries = unzipSync(readFileSync(source));
  const readBytes = (name: string): Uint8Array => {
    const bytes = entries[name];
    if (bytes === undefined) throw new Error(`no such entry "${name}" in ${source}`);
    return bytes;
  };
  return {
    source,
    kind: "zip",
    entryNames: () => Object.keys(entries),
    hasEntry: (name) => name in entries,
    readBytes,
    ...textReaders(readBytes),
  };
}

// ─── aces.json / addon.json structured parser model ─────────────────────────
//
// Both parsers below are PURE: they take a JSON value (`unknown`), never a path — the
// `unknown` a caller feeds in is expected to come from `readAddonPackage(...).readJson(name)`
// (or an equivalent `JSON.parse` in tests), never read from disk directly here.

/** The three kinds of ACE (action/condition/expression) declarable in an aces.json category. */
export type AceKind = "action" | "condition" | "expression";

/** A single ACE parameter declaration. `id`/`type` are required; unmodeled fields pass through. */
export interface AceParam {
  id: string;
  type: string;
  [k: string]: unknown;
}

/** A single action declaration, flattened out of its originating category. */
export interface AceAction {
  kind: "action";
  /** The category (object-class name, e.g. `"custom"`) this ACE was declared under. */
  category: string;
  id: string;
  scriptName: string;
  params: AceParam[];
  [k: string]: unknown;
}

/** A single condition declaration, flattened out of its originating category. */
export interface AceCondition {
  kind: "condition";
  category: string;
  id: string;
  scriptName: string;
  params: AceParam[];
  [k: string]: unknown;
}

/**
 * A single expression declaration, flattened out of its originating category.
 *
 * DOMAIN FACT: `id` (the dash-cased ACE identifier, e.g. `"current-value"`) and
 * `expressionName` (the PascalCase name used in event-sheet expressions, e.g.
 * `"CurrentValue"`) are DISTINCT fields that need not share a stem — do not conflate
 * them. Resolve by `id` via {@link findAce}, or by `expressionName` via {@link findExpression}.
 */
export interface AceExpression {
  kind: "expression";
  category: string;
  id: string;
  expressionName: string;
  returnType: string;
  params: AceParam[];
  [k: string]: unknown;
}

/** Any ACE declaration, discriminated by `kind`. */
export type Ace = AceAction | AceCondition | AceExpression;

/** All ACEs declared across every category of an aces.json, flattened out and grouped by kind. */
export interface AcesModel {
  actions: AceAction[];
  conditions: AceCondition[];
  expressions: AceExpression[];
}

/**
 * An addon's `addon.json` top-level metadata. `is-c3-addon`/`sdk-version` are lenient/optional
 * (observed on real SDK samples but not required for parsing); the rest are required strings.
 * Unmodeled fields (e.g. `file-list`) pass through.
 */
export interface AddonMetadata {
  "is-c3-addon"?: boolean;
  "sdk-version"?: number;
  type: "plugin" | "behavior" | "effect";
  name: string;
  id: string;
  version: string;
  author: string;
  [k: string]: unknown;
}

function assertAces(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`invalid aces.json: ${msg}`);
}

function assertAddon(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`invalid addon.json: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate and default an ACE's `params` array — OPTIONAL in real SDK samples (e.g. `do-alert` has none). */
function parseAceParams(v: unknown, where: string): AceParam[] {
  if (v === undefined) return [];
  assertAces(Array.isArray(v), `${where}.params must be an array when present`);
  v.forEach((p, i) => {
    assertAces(isRecord(p), `${where}.params[${i}] must be an object`);
    assertAces(typeof p.id === "string", `${where}.params[${i}].id must be a string`);
    assertAces(typeof p.type === "string", `${where}.params[${i}].type must be a string`);
  });
  return v as AceParam[];
}

/**
 * Parse and validate a raw JSON value as an AcesModel.
 *
 * `aces.json`'s top level is one key per **category** (object-class name, e.g. `"custom"`)
 * aside from an ignored `$schema` key; each category holds optional `conditions`/`actions`/
 * `expressions` arrays (absent -> treated as `[]`). Every ACE's originating `category` and
 * `kind` are stamped onto the flattened output so identity `(kind, id)` can be resolved without
 * re-walking categories (see {@link aceIdentity}); unmodeled per-ACE fields (e.g. `highlight`,
 * `isAsync`) pass through. Throws `invalid aces.json: <detail>` on shape violation (mirrors
 * `parseProjectManifest`'s error-prefix idiom in manifest.ts).
 */
export function parseAcesModel(json: unknown): AcesModel {
  assertAces(isRecord(json), "top-level value must be an object");
  const model: AcesModel = { actions: [], conditions: [], expressions: [] };
  for (const [category, raw] of Object.entries(json)) {
    if (category === "$schema") continue;
    assertAces(isRecord(raw), `${category} must be an object`);

    const conditions = raw.conditions ?? [];
    assertAces(Array.isArray(conditions), `${category}.conditions must be an array`);
    conditions.forEach((c, i) => {
      const where = `${category}.conditions[${i}]`;
      assertAces(isRecord(c), `${where} must be an object`);
      assertAces(typeof c.id === "string", `${where}.id must be a string`);
      assertAces(typeof c.scriptName === "string", `${where}.scriptName must be a string`);
      model.conditions.push({
        ...c,
        kind: "condition",
        category,
        id: c.id,
        scriptName: c.scriptName,
        params: parseAceParams(c.params, where),
      });
    });

    const actions = raw.actions ?? [];
    assertAces(Array.isArray(actions), `${category}.actions must be an array`);
    actions.forEach((a, i) => {
      const where = `${category}.actions[${i}]`;
      assertAces(isRecord(a), `${where} must be an object`);
      assertAces(typeof a.id === "string", `${where}.id must be a string`);
      assertAces(typeof a.scriptName === "string", `${where}.scriptName must be a string`);
      model.actions.push({
        ...a,
        kind: "action",
        category,
        id: a.id,
        scriptName: a.scriptName,
        params: parseAceParams(a.params, where),
      });
    });

    const expressions = raw.expressions ?? [];
    assertAces(Array.isArray(expressions), `${category}.expressions must be an array`);
    expressions.forEach((e, i) => {
      const where = `${category}.expressions[${i}]`;
      assertAces(isRecord(e), `${where} must be an object`);
      assertAces(typeof e.id === "string", `${where}.id must be a string`);
      assertAces(typeof e.expressionName === "string", `${where}.expressionName must be a string`);
      assertAces(typeof e.returnType === "string", `${where}.returnType must be a string`);
      model.expressions.push({
        ...e,
        kind: "expression",
        category,
        id: e.id,
        expressionName: e.expressionName,
        returnType: e.returnType,
        params: parseAceParams(e.params, where),
      });
    });
  }
  return model;
}

/**
 * Parse and validate a raw JSON value as AddonMetadata (an addon's `addon.json`).
 * `type`/`id`/`name`/`version`/`author` are required strings; `is-c3-addon`/`sdk-version`
 * stay optional/lenient. Throws `invalid addon.json: <detail>` on shape violation.
 */
export function parseAddonMetadata(json: unknown): AddonMetadata {
  assertAddon(isRecord(json), "top-level value must be an object");
  assertAddon(typeof json.type === "string", "type must be a string");
  assertAddon(typeof json.id === "string", "id must be a string");
  assertAddon(typeof json.name === "string", "name must be a string");
  assertAddon(typeof json.version === "string", "version must be a string");
  assertAddon(typeof json.author === "string", "author must be a string");
  return json as unknown as AddonMetadata;
}

/**
 * Build the canonical identity string for an ACE: `` `${kind}:${id}` ``. DOMAIN FACT: an
 * ACE's identity within an aces.json is the pair `(kind, id)`, NOT `id` alone — an action
 * and a condition (or expression) may legally share the same `id`.
 */
export function aceIdentity(kind: AceKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Find a single action/condition/expression by its `(kind, id)` identity (see {@link aceIdentity}).
 * Expressions ARE matched by `id` here too — use {@link findExpression} to resolve by the
 * distinct `expressionName` instead.
 */
export function findAce(model: AcesModel, kind: AceKind, id: string): Ace | undefined {
  switch (kind) {
    case "action":
      return model.actions.find((a) => a.id === id);
    case "condition":
      return model.conditions.find((c) => c.id === id);
    case "expression":
      return model.expressions.find((e) => e.id === id);
  }
}

/**
 * Find an expression by its `expressionName` (the PascalCase name used in event-sheet
 * expressions), NOT its `id`. See the {@link AceExpression} doc comment for why the two differ.
 */
export function findExpression(model: AcesModel, expressionName: string): AceExpression | undefined {
  return model.expressions.find((e) => e.expressionName === expressionName);
}
