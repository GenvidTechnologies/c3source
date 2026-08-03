import { Layer, Layout, walkLayerEntries } from "./layouts.js";
import { C3ProjectManifest, collectManifestItemNames } from "./manifest.js";

// ─── Reference-integrity types ─────────────────────────────────────────────
//
// Cross-reference detection: a C3 project can declare a reference (an addon id,
// an object-type name, an event-sheet `objectClass`) that does not resolve to
// anything on the other side. Detection-only, like `detectManifestDrift` and
// `validateForEditor` — nothing here ever mutates its inputs. The four detectors
// (one per resolvable kind, `addon-undeclared`/`addon-unused` sharing one pass)
// and the I/O orchestrator that reads a project and runs them all land in later
// tasks; this file is types, domain-fact tables, and pure helpers only.

/**
 * The five kinds of unresolved cross-reference this module detects:
 * - `addon-undeclared` — an addon derived from source (object-type/family/layout/layer
 *   attribution) has no matching entry in the manifest's `usedAddons`.
 * - `addon-unused` — a manifest `usedAddons` entry is derived from nothing in source.
 * - `family-member-missing` — a family's `members` names an object type absent from the manifest.
 * - `instance-type-missing` — a layout instance's `type` names an object type absent from the manifest.
 * - `event-class-unresolved` — an event-sheet ACE's `objectClass` resolves to neither an
 *   object type nor a family nor a known pseudo-class (see {@link C3_PSEUDO_OBJECT_CLASSES}).
 */
export type ReferenceIssueKind =
  | "addon-undeclared"
  | "addon-unused"
  | "family-member-missing"
  | "instance-type-missing"
  | "event-class-unresolved";

/** `error` = C3 fails to load the project. `warning` = hygiene, or detector uncertainty. */
export type ReferenceIssueSeverity = "error" | "warning";

/** A parsed source artifact paired with the file it came from. */
export interface SourceDoc<T> {
  /** Project-root-relative, forward-slash-normalized when produced by the orchestrator;
   *  whatever the caller supplies (may be "") for the pure detectors. */
  file: string;
  value: T;
}

/** One unresolved cross-reference. Detection only — never mutating. */
export interface ReferenceIssue {
  kind: ReferenceIssueKind;
  severity: ReferenceIssueSeverity;
  /** The unresolved reference text itself: an addon id, an object-type name, an `objectClass`. */
  name: string;
  /** File holding the reference (the `project.c3proj` path for `addon-unused`). */
  file: string;
  /** C3 `name` of the holding artifact ("Second Layout", "TextFamily"); "" for the manifest root. */
  owner: string;
  /** Intra-file locator. Same grammar as `formatSidPath`. */
  jsonPath: string;
  /** `LayerEntry.fullName` of the holding layer — `instance-type-missing` only. */
  layerFullName?: string;
  /** `usedAddons[].type` — `addon-*` only. */
  addonType?: string;
  message: string;
}

/** The full result of a reference-integrity pass. */
export interface ReferenceIntegrityResult {
  issues: ReferenceIssue[];
  /** `issues.length === 0` — mirrors `ManifestDrift.inSync`. */
  ok: boolean;
}

/** Options tuning the reference-integrity detectors' domain-fact tables per call. */
export interface ReferenceIntegrityOptions {
  /** REPLACES C3_PSEUDO_OBJECT_CLASSES (spread it to extend). */
  pseudoObjectClasses?: readonly string[];
  /** REPLACES NON_ATTRIBUTABLE_ADDON_TYPES. */
  nonAttributableAddonTypes?: readonly string[];
}

// ─── Domain-fact tables (ADR 0008 convention — cf. EVENTVAR_REFERENCE_ACES,
//      IMAGE_FILE_TYPE_EXTENSIONS, EDITOR_FIELD_RULES) ──────────────────────

/**
 * `objectClass` values in an event-sheet ACE that resolve to no object type and
 * no family **by design** — C3 r487-pinned.
 *
 * - `"System"` — the built-in System object.
 * - `"Functions"` — C3's built-in event-sheet-functions object (observed ACE ids:
 *   `set-function-return-value`, `map-function`, `map-function-default`,
 *   `call-mapped-function`). It is **absent from the canonical fixture** and was
 *   found only by scanning a 16-project corpus, where it occurred **212 times in
 *   a single project**.
 *
 * This table is **KNOWN INCOMPLETE**: extend it either by array mutation (the
 * `EDITOR_FIELD_RULES` convention) or, without mutating shared state, by passing
 * {@link ReferenceIntegrityOptions.pseudoObjectClasses} (which REPLACES this
 * table for that call — spread it in to extend rather than replace).
 *
 * `Mouse`/`Keyboard`/`Touch`/`Audio`/`Browser` are **NOT** pseudo-classes: each
 * is an ordinary object type with its own entry under `objectTypes/` and in the
 * manifest, so an `event-class-unresolved` check must resolve them normally, not
 * special-case them here.
 */
export const C3_PSEUDO_OBJECT_CLASSES: string[] = ["System", "Functions"];

/**
 * `usedAddons[].type` values that can never appear on the derived (source-attributed)
 * side, so an `addon-unused` detector must never report them. Seeded from
 * `C3UsedAddon`'s JSDoc (`src/manifest.ts:51`): `type` is documented as "plugin,
 * behavior, theme", and only `plugin`/`behavior`/`effect` are attributable from
 * source (`AddonAttribution.pluginId`/`behaviorIds`/`effectIds`) — a `theme` has no
 * source-side counterpart to derive.
 *
 * **UNVALIDATED**: `"theme"` was never actually observed across a 16-project real-world
 * corpus (only `plugin`/`behavior`/`effect` were seen). The failure mode if this table
 * is wrong is benign either way — it only *suppresses* an `addon-unused` warning, so
 * being wrong costs a missed warning, never a false alarm.
 *
 * REPLACED wholesale (not merged) by {@link ReferenceIntegrityOptions.nonAttributableAddonTypes}
 * when supplied — spread this table in to extend rather than replace.
 */
export const NON_ATTRIBUTABLE_ADDON_TYPES: string[] = ["theme"];

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Manifest-declared object-type names, as a Set. Thin `collectManifestItemNames`
 * consumer; empty-safe — `m.objectTypes` can legitimately be absent from a
 * tolerantly-read manifest (mirrors the `m.objectTypes ? … : []` guard style in
 * `src/manifest.ts`'s `detectContainerDrift`).
 */
export function manifestObjectTypeNames(m: C3ProjectManifest): Set<string> {
  return new Set(m.objectTypes ? collectManifestItemNames(m.objectTypes) : []);
}

/** Manifest-declared family names, as a Set. Same empty-safe shape as {@link manifestObjectTypeNames}. */
export function manifestFamilyNames(m: C3ProjectManifest): Set<string> {
  return new Set(m.families ? collectManifestItemNames(m.families) : []);
}

/**
 * Every `effectId` carried by a layout's own top-level `effectTypes` and by every
 * layer's and sublayer's, with its intra-file `jsonPath` and (for a layer-borne
 * effect) the holding layer's `LayerEntry.fullName`.
 *
 * This is the attribution surface `collectAddonAttribution` (`src/addons.ts`)
 * deliberately does NOT cover: that function derives strictly from an item's own
 * declared fields (object type / family), and a layer is neither — widening it to
 * accept `"layout" | "layer"` would add a case to its exported `AddonAttribution.source`
 * union, an exhaustive-`switch` break (a major bump). Measured impact of covering
 * this surface separately: on a real project it eliminates 2 false `addon-undeclared`
 * positives (2 → 0).
 *
 * Built on the exported `walkLayerEntries` generator (ADR 0005: one canonical layer
 * walk) rather than a second recursion, and reuses its `jsonPath`/`fullName` rather
 * than re-deriving them (ADR 0007).
 */
export function collectLayoutEffectIds(
  layout: Layout,
): Array<{ effectId: string; jsonPath: string; layerFullName?: string }> {
  const out: Array<{ effectId: string; jsonPath: string; layerFullName?: string }> = [];

  (layout.effectTypes ?? []).forEach((effect, i) => {
    out.push({ effectId: effect.effectId, jsonPath: `effectTypes[${i}]` });
  });

  for (const entry of walkLayerEntries(layout.layers, layout.name, [])) {
    const layer: Layer = entry.layer;
    (layer.effectTypes ?? []).forEach((effect, i) => {
      out.push({
        effectId: effect.effectId,
        jsonPath: `${entry.jsonPath}.effectTypes[${i}]`,
        layerFullName: entry.fullName,
      });
    });
  }

  return out;
}
