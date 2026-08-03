import { attributeFamily, attributeObjectType } from "./addons.js";
import { Family, Layer, Layout, ObjectType, walkLayerEntries } from "./layouts.js";
import { C3ProjectManifest, collectManifestItemNames, getUsedAddons } from "./manifest.js";

// ─── Reference-integrity types ─────────────────────────────────────────────
//
// Cross-reference detection: a C3 project can declare a reference (an addon id,
// an object-type name, an event-sheet `objectClass`) that does not resolve to
// anything on the other side. Detection-only, like `detectManifestDrift` and
// `validateForEditor` — nothing here ever mutates its inputs. `detectAddonReferenceIssues`
// (the `addon-undeclared`/`addon-unused` pass) is implemented below; the remaining three
// detectors and the I/O orchestrator that reads a project and runs them all land in later
// tasks.

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

// ─── addon-undeclared / addon-unused detector ──────────────────────────────

/** One addon usage derived from source (object type, family, or layout/layer), pre-joined to a location. */
interface DerivedAddonUsage {
  addonType: string;
  id: string;
  file: string;
  owner: string;
  jsonPath: string;
  layerFullName?: string;
}

/**
 * Push the three usages ({@link AddonAttribution}'s `pluginId`/`behaviorIds`/`effectIds`) an
 * object type or family attributes, at `file`/`owner`.
 */
function pushDerivedAttribution(
  out: DerivedAddonUsage[],
  attribution: { pluginId: string; behaviorIds: string[]; effectIds: string[] },
  file: string,
  owner: string,
): void {
  out.push({ addonType: "plugin", id: attribution.pluginId, file, owner, jsonPath: "plugin-id" });
  // behaviorIds[i] corresponds to behaviorTypes[i]: src/addons.ts's attributeObjectType/attributeFamily
  // build behaviorIds by .map()ing over behaviorTypes in declared order — keep the two in sync.
  attribution.behaviorIds.forEach((id, i) => {
    out.push({ addonType: "behavior", id, file, owner, jsonPath: `behaviorTypes[${i}]` });
  });
  // effectIds[i] corresponds to effectTypes[i]: same src/addons.ts .map() correspondence as above.
  attribution.effectIds.forEach((id, i) => {
    out.push({ addonType: "effect", id, file, owner, jsonPath: `effectTypes[${i}]` });
  });
}

/**
 * Detect addon references that fail to resolve either direction:
 *
 * - `addon-undeclared` — an object type, family, layout, or layer draws on an addon
 *   (plugin/behavior/effect, via `attributeObjectType`/`attributeFamily`/{@link collectLayoutEffectIds})
 *   with no matching entry in the manifest's `usedAddons` — C3 fails to load the project, so
 *   `severity: "error"`.
 * - `addon-unused` — a `usedAddons` entry matches nothing derived from source — hygiene only, so
 *   `severity: "warning"`. Entries whose `type` is in the effective non-attributable set
 *   ({@link ReferenceIntegrityOptions.nonAttributableAddonTypes} or, by default,
 *   {@link NON_ATTRIBUTABLE_ADDON_TYPES}) are skipped — they can never appear on the derived side,
 *   so reporting them would always be a false positive.
 *
 * The derived side attributes `objectTypes` and `families` **individually** (not as a merged
 * pool) — a family-only addon (e.g. a behavior attached only to a family, never to any object
 * type) must still count as used — and folds in every layout's own and every layer's
 * `effectTypes` via {@link collectLayoutEffectIds}, so an effect applied only at the layout/layer
 * level is not misreported as unused.
 *
 * The join key is always the pair `(type, id)` — **never** `name`: C3 display names diverge
 * systematically from ids (`NinePatch` -> `"9-patch"`, `Json` -> `"JSON"`, `TextBox` ->
 * `"Text input"`, `MyCompany_MyEffect` -> `"My custom effect"`), so a name join would silently
 * produce wrong answers.
 *
 * Pure — no I/O, no mutation of `manifest`/`objectTypes`/`families`/`layouts`.
 */
export function detectAddonReferenceIssues(
  manifest: C3ProjectManifest,
  objectTypes: SourceDoc<ObjectType>[],
  families: SourceDoc<Family>[],
  layouts: SourceDoc<Layout>[],
  options?: ReferenceIntegrityOptions,
): ReferenceIssue[] {
  const nonAttributable = new Set(options?.nonAttributableAddonTypes ?? NON_ATTRIBUTABLE_ADDON_TYPES);
  const declared = getUsedAddons(manifest);
  const declaredKeys = new Set(declared.map((a) => `${a.type}:${a.id}`));

  const derived: DerivedAddonUsage[] = [];
  for (const doc of objectTypes) {
    pushDerivedAttribution(derived, attributeObjectType(doc.value), doc.file, doc.value.name);
  }
  for (const doc of families) {
    pushDerivedAttribution(derived, attributeFamily(doc.value), doc.file, doc.value.name);
  }
  for (const doc of layouts) {
    for (const effect of collectLayoutEffectIds(doc.value)) {
      derived.push({
        addonType: "effect",
        id: effect.effectId,
        file: doc.file,
        owner: doc.value.name,
        jsonPath: effect.jsonPath,
        layerFullName: effect.layerFullName,
      });
    }
  }

  const issues: ReferenceIssue[] = [];
  const derivedKeys = new Set<string>();

  for (const usage of derived) {
    derivedKeys.add(`${usage.addonType}:${usage.id}`);
    if (declaredKeys.has(`${usage.addonType}:${usage.id}`)) continue;
    issues.push({
      kind: "addon-undeclared",
      severity: "error",
      name: usage.id,
      file: usage.file,
      owner: usage.owner,
      jsonPath: usage.jsonPath,
      ...(usage.layerFullName !== undefined ? { layerFullName: usage.layerFullName } : {}),
      addonType: usage.addonType,
      message: `${usage.addonType} "${usage.id}" is referenced by "${usage.owner}" (${usage.file}, ${usage.jsonPath}) but has no matching entry in the manifest's usedAddons`,
    });
  }

  declared.forEach((addon, i) => {
    if (nonAttributable.has(addon.type)) return;
    if (derivedKeys.has(`${addon.type}:${addon.id}`)) return;
    issues.push({
      kind: "addon-unused",
      severity: "warning",
      name: addon.id,
      file: "project.c3proj",
      owner: "",
      jsonPath: `usedAddons[${i}]`,
      addonType: addon.type,
      message: `usedAddons[${i}] declares ${addon.type} "${addon.id}" but no object type, family, or layout draws on it`,
    });
  });

  return issues;
}

// ─── family-member-missing detector ────────────────────────────────────────

/**
 * Detect `Family.members` entries naming an object type absent from the manifest.
 *
 * `members[i]` names an object type by **name**; C3 fails to load a family with a
 * dangling member, so every miss is `severity: "error"`. Defensive about `members`
 * being absent or not an array (mirrors the `Array.isArray` guard style in
 * `src/manifest.ts`) — a malformed source file must not throw.
 *
 * Pure — no I/O, no mutation of `families`/`objectTypeNames`.
 */
export function detectFamilyMemberIssues(
  families: SourceDoc<Family>[],
  objectTypeNames: ReadonlySet<string>,
): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];

  for (const doc of families) {
    const members = doc.value.members;
    if (!Array.isArray(members)) continue;
    members.forEach((member, i) => {
      if (objectTypeNames.has(member)) return;
      issues.push({
        kind: "family-member-missing",
        severity: "error",
        name: member,
        file: doc.file,
        owner: doc.value.name,
        jsonPath: `members[${i}]`,
        message: `Family "${doc.value.name}" (${doc.file}, members[${i}]) names object type "${member}" which has no matching entry in the manifest`,
      });
    });
  }

  return issues;
}

// ─── instance-type-missing detector ────────────────────────────────────────

/**
 * Detect layout `Instance.type` values naming an object type absent from the manifest.
 *
 * `Instance.type` names an object type by **name** at two distinct sites per layout:
 *
 * - layer instances (`layer.instances[j].type`) — walked via {@link walkLayerEntries}
 *   rather than a second recursion (ADR 0005), reusing its `jsonPath`/`fullName`
 *   rather than re-deriving them (ADR 0007); the issue carries `layerFullName`.
 * - the layout's own root-level `"nonworld-instances"` array — no owning layer, so
 *   `layerFullName` is omitted.
 *
 * C3 fails to load a layout with a dangling instance type, so every miss is
 * `severity: "error"`. Defensive about `instances`/`"nonworld-instances"` being
 * absent or not arrays — a malformed source file must not throw.
 *
 * Pure — no I/O, no mutation of `layouts`/`objectTypeNames`.
 */
export function detectInstanceTypeIssues(
  layouts: SourceDoc<Layout>[],
  objectTypeNames: ReadonlySet<string>,
): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];

  for (const doc of layouts) {
    const layout = doc.value;
    const owner = layout.name;

    if (Array.isArray(layout.layers)) {
      for (const entry of walkLayerEntries(layout.layers, layout.name, [])) {
        const instances = entry.layer.instances;
        if (!Array.isArray(instances)) continue;
        instances.forEach((instance, j) => {
          if (objectTypeNames.has(instance.type)) return;
          const jsonPath = `${entry.jsonPath}.instances[${j}]`;
          issues.push({
            kind: "instance-type-missing",
            severity: "error",
            name: instance.type,
            file: doc.file,
            owner,
            jsonPath,
            layerFullName: entry.fullName,
            message: `Layout "${owner}" (${doc.file}, ${jsonPath}) has an instance of type "${instance.type}" which has no matching entry in the manifest`,
          });
        });
      }
    }

    const nonWorldInstances = layout["nonworld-instances"];
    if (Array.isArray(nonWorldInstances)) {
      nonWorldInstances.forEach((instance, k) => {
        if (objectTypeNames.has(instance.type)) return;
        const jsonPath = `nonworld-instances[${k}]`;
        issues.push({
          kind: "instance-type-missing",
          severity: "error",
          name: instance.type,
          file: doc.file,
          owner,
          jsonPath,
          message: `Layout "${owner}" (${doc.file}, ${jsonPath}) has a non-world instance of type "${instance.type}" which has no matching entry in the manifest`,
        });
      });
    }
  }

  return issues;
}
