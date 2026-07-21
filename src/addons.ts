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
