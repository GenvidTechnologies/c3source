import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { attributeFamily, attributeObjectType } from "./addons.js";
import { EventSheet, ScriptAction, hasActions, hasConditions, visitEvents } from "./eventSheets.js";
import {
  Family,
  Layer,
  Layout,
  ObjectType,
  find_all_files_path,
  isEditorLocalPath,
  walkLayerEntries,
} from "./layouts.js";
import {
  C3ProjectManifest,
  C3_SECTION_FOLDERS,
  PROJECT_MANIFEST_FILE,
  collectManifestItemNames,
  getUsedAddons,
  readProjectManifest,
} from "./manifest.js";

// ─── Reference-integrity types ─────────────────────────────────────────────
//
// Cross-reference detection: a C3 project can declare a reference (an addon id,
// an object-type name, an event-sheet `objectClass`) that does not resolve to
// anything on the other side. Detection-only, like `detectManifestDrift` and
// `validateForEditor` — nothing here ever mutates its inputs. The four pure
// detectors (`detectAddonReferenceIssues`, `detectFamilyMemberIssues`,
// `detectInstanceTypeIssues`, `detectEventClassIssues`) are implemented above;
// the I/O orchestrator that reads a project and runs them all is
// `detectReferenceIntegrity`, at the bottom of this file.

/**
 * The five kinds of unresolved cross-reference this module detects:
 * - `addon-undeclared` — an addon derived from source (object-type/family/layout/layer
 *   attribution) has no matching entry in the manifest's `usedAddons`.
 * - `addon-unused` — a manifest `usedAddons` entry is derived from nothing in source.
 * - `family-member-missing` — a family's `members` names an object type absent from the manifest.
 * - `instance-type-missing` — a layout instance's `type` names an object type absent from the manifest.
 * - `event-class-unresolved` — an event-sheet ACE's `objectClass` resolves to neither an
 *   object type nor a family nor a known pseudo-class (see {@link C3_PSEUDO_OBJECT_CLASSES})
 *   nor the project's functions object (see {@link C3_DEFAULT_FUNCTIONS_NAME}).
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
  /**
   * Name of C3's built-in functions object for this call's `objectClass` resolution.
   * Unlike `pseudoObjectClasses` (which REPLACES the whole table), this is a single
   * ADDITIONAL resolvable name — `detectEventClassIssues` treats an `objectClass`
   * equal to this value as resolved, alongside `classNames` and the pseudo-class set.
   * Defaults to {@link C3_DEFAULT_FUNCTIONS_NAME} (`"Functions"`) when omitted, which
   * keeps today's behavior for a project using the default name. A direct caller of
   * `detectEventClassIssues` — who has no manifest to read `functionsName` from —
   * supplies it here; `detectReferenceIntegrity` instead resolves it from
   * `manifest.functionsName` (falling back to this option, then the default) so most
   * callers never need to set it explicitly.
   */
  functionsName?: string;
}

// ─── Domain-fact tables (ADR 0008 convention — cf. EVENTVAR_REFERENCE_ACES,
//      IMAGE_FILE_TYPE_EXTENSIONS, EDITOR_FIELD_RULES) ──────────────────────

/**
 * `objectClass` values in an event-sheet ACE that resolve to no object type and
 * no family **by design** — C3 r487-pinned. This table holds only the
 * **statically** known pseudo-classes:
 *
 * - `"System"` — the built-in System object.
 *
 * C3's built-in event-sheet-functions object is deliberately **NOT** in this
 * table: its `objectClass` name is **per-project configurable**, not a fixed
 * string. `project.c3proj` carries an optional `functionsName` attribute
 * (`C3ProjectManifest.functionsName`, `src/manifest.ts`) that defaults to
 * {@link C3_DEFAULT_FUNCTIONS_NAME} (`"Functions"`) when absent; a project that
 * renames it (e.g. to `"Fn"`) emits that name as the `objectClass` on every
 * function ACE (observed ACE ids: `set-function-return-value`, `map-function`,
 * `map-function-default`, `call-mapped-function`). Resolving it therefore
 * requires the manifest, not a static table — see
 * {@link ReferenceIntegrityOptions.functionsName} and
 * `detectReferenceIntegrity`'s use of `manifest.functionsName`.
 *
 * This table is **KNOWN INCOMPLETE** even for the classes it does cover: extend
 * it either by array mutation (the `EDITOR_FIELD_RULES` convention) or, without
 * mutating shared state, by passing
 * {@link ReferenceIntegrityOptions.pseudoObjectClasses} (which REPLACES this
 * table for that call — spread it in to extend rather than replace).
 *
 * `Mouse`/`Keyboard`/`Touch`/`Audio`/`Browser` are **NOT** pseudo-classes: each
 * is an ordinary object type with its own entry under `objectTypes/` and in the
 * manifest, so an `event-class-unresolved` check must resolve them normally, not
 * special-case them here.
 */
export const C3_PSEUDO_OBJECT_CLASSES: string[] = ["System"];

/**
 * Default name of C3's built-in functions object when `project.c3proj` omits
 * `functionsName`. See {@link C3_PSEUDO_OBJECT_CLASSES}'s doc comment for why the
 * functions object is not in that static table.
 */
export const C3_DEFAULT_FUNCTIONS_NAME = "Functions";

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

// ─── event-class-unresolved detector ───────────────────────────────────────

/**
 * Extract a loosely-typed action's `objectClass`, or `null` when the action
 * carries none. Mirrors the defensive `"key" in action` + `typeof` narrowing
 * already used by `formatActionInner`/`isEventVarReference` in `src/eventSheets.ts`
 * rather than casting blindly: `action` is `ScriptAction | Record<string, unknown>`,
 * and only the standard-action and custom-ACE action shapes carry an `objectClass`
 * (a script/comment/function-call action does not).
 */
function actionObjectClass(action: ScriptAction | Record<string, unknown>): string | null {
  if (!("objectClass" in action)) return null;
  const objectClass = (action as Record<string, unknown>).objectClass;
  return typeof objectClass === "string" ? objectClass : null;
}

/**
 * Detect event-sheet ACEs whose `objectClass` resolves to neither a manifest
 * object type nor a manifest family nor a known pseudo-class nor the project's
 * functions object.
 *
 * `classNames` is the caller-supplied union of manifest object-type names and
 * family names — an ACE may legitimately target a family (e.g. `objectClass:
 * "TextFamily"`), so object types alone would false-positive. The pseudo-class
 * set is {@link ReferenceIntegrityOptions.pseudoObjectClasses} if supplied,
 * else {@link C3_PSEUDO_OBJECT_CLASSES} — REPLACED wholesale, not merged, same
 * contract as the other detectors' options. Separately, {@link
 * ReferenceIntegrityOptions.functionsName} (or, when omitted, {@link
 * C3_DEFAULT_FUNCTIONS_NAME}) names the project's functions object and is
 * ADDED to the resolvable set alongside `classNames` and the pseudo-class set —
 * it is a single value, not a table, so it is never merged into
 * `C3_PSEUDO_OBJECT_CLASSES` itself (see that constant's doc comment for why).
 *
 * Walks each sheet with `visitEvents` (ADR 0005: the one canonical event walk,
 * which also owns C3's event numbering) rather than a second recursion, and
 * checks three distinct `objectClass` sites per visited event:
 *
 * - `conditions[].objectClass` — typed on `Condition`, read directly.
 * - each action's `objectClass` — actions are loosely typed
 *   (`ScriptAction | Record<string, unknown>`), so extracted defensively via
 *   {@link actionObjectClass} rather than cast blindly.
 * - a `custom-ace-block` event's own top-level `objectClass` — `CustomAceBlockEvent`
 *   is the only event kind that carries one. `isFunctionDefinition` narrows to
 *   both `function-block` and `custom-ace-block`, so it is NOT the right guard
 *   here; this checks `eventType === "custom-ace-block"` specifically. A plain
 *   `function-block` (no `objectClass` of its own) is unaffected.
 *
 * Reporting is **one issue per event, not per ACE** — matching
 * `validateEventForEditor`'s existing event-granularity precedent: several ACEs
 * in one event referencing the same unresolved class report once; two ACEs in
 * one event referencing two *different* unresolved classes report once each.
 *
 * `severity: "warning"` is deliberate (hence `event-class-unresolved`, not
 * `event-class-missing`): the detector cannot distinguish a deleted object type
 * (a load breaker) from a pseudo-class this table doesn't yet know about
 * (harmless) — see {@link C3_PSEUDO_OBJECT_CLASSES}'s "KNOWN INCOMPLETE" note.
 *
 * `jsonPath` is `ctx.jsonPath` from `visitEvents`, passed through verbatim —
 * never rebuilt, prefixed, or appended to, so it cannot drift from the
 * canonical walk (same discipline as `EditorValidationIssue.path`).
 *
 * Pure — no I/O, no mutation of `sheets`.
 */
export function detectEventClassIssues(
  sheets: SourceDoc<EventSheet>[],
  classNames: ReadonlySet<string>,
  options?: ReferenceIntegrityOptions,
): ReferenceIssue[] {
  const pseudoClasses = new Set(options?.pseudoObjectClasses ?? C3_PSEUDO_OBJECT_CLASSES);
  const functionsName = options?.functionsName ?? C3_DEFAULT_FUNCTIONS_NAME;
  const resolves = (name: string): boolean => classNames.has(name) || pseudoClasses.has(name) || name === functionsName;

  const issues: ReferenceIssue[] = [];

  for (const doc of sheets) {
    const owner = doc.value.name;

    visitEvents(doc.value.events, (event, ctx) => {
      const unresolved = new Set<string>();

      if (hasConditions(event)) {
        for (const condition of event.conditions) {
          if (!resolves(condition.objectClass)) unresolved.add(condition.objectClass);
        }
      }

      if (hasActions(event)) {
        for (const action of event.actions) {
          const objectClass = actionObjectClass(action);
          if (objectClass !== null && !resolves(objectClass)) unresolved.add(objectClass);
        }
      }

      if (event.eventType === "custom-ace-block" && !resolves(event.objectClass)) {
        unresolved.add(event.objectClass);
      }

      for (const name of unresolved) {
        issues.push({
          kind: "event-class-unresolved",
          severity: "warning",
          name,
          file: doc.file,
          owner,
          jsonPath: ctx.jsonPath,
          message: `Event sheet "${owner}" (${doc.file}, ${ctx.jsonPath}) references objectClass "${name}" which resolves to no object type, family, or known pseudo-class`,
        });
      }
    });
  }

  return issues;
}

// ─── I/O orchestrator ──────────────────────────────────────────────────────

/**
 * Read every `.json` file under `dir`, skipping editor-local artifacts, and parse each
 * into a {@link SourceDoc} whose `file` is project-root-relative and forward-slash-normalized
 * (`path.relative(projectDir, absPath).replace(/\\/g, "/")`) regardless of host OS path
 * separator — required so `file` matches the documented worked-example paths
 * (`families/TextFamily.json`, `objectTypes/tiles/Tilemap.json`) on Windows, where
 * `path.relative` otherwise yields backslashes.
 *
 * Mirrors `detectImageDrift`'s walk (`src/manifest.ts`): `find_all_files_path(dir, (f) =>
 * f.endsWith(".json") && !isEditorLocalPath(f))`, NOT `find_all_layouts_path` /
 * `find_all_objectTypes_path` — those filter on `!isEditorLocalPath(file)` alone with no
 * `.json` check, so a stray non-JSON file under a section directory would reach
 * `JSON.parse` and crash.
 *
 * Graceful-empty: returns `[]` without touching the filesystem further when `dir` does not
 * exist (mirrors `findInSection` in `src/project.ts` and `detectImageDrift`'s own
 * `existsSync` guards) — a project missing a whole source section (e.g. no `families/`) is
 * not itself a reference-integrity failure.
 */
function readSourceDocs<T>(projectDir: string, folderName: string): SourceDoc<T>[] {
  const dir = path.join(projectDir, folderName);
  if (!existsSync(dir)) return [];
  const jsonPaths = find_all_files_path(dir, (f) => f.endsWith(".json") && !isEditorLocalPath(f));
  return jsonPaths.map((absPath) => ({
    file: path.relative(projectDir, absPath).replace(/\\/g, "/"),
    value: JSON.parse(readFileSync(absPath, "utf-8")) as T,
  }));
}

/**
 * Read a C3 project from disk and run all four reference-integrity detectors against it.
 *
 * When `manifest` is omitted, reads `<projectDir>/<PROJECT_MANIFEST_FILE>` via
 * {@link readProjectManifest} (strict — throws on a malformed manifest). Passing an
 * explicit `manifest` (e.g. a mutated in-memory clone) skips that read entirely and is
 * honoured verbatim, which is what makes the whole module testable without touching disk.
 *
 * Source is read from the four section directories named by {@link C3_SECTION_FOLDERS}
 * (`objectTypes`, `families`, `layouts`, `eventSheets`) via {@link readSourceDocs}, each
 * graceful-empty when its directory is absent. `classNames` for {@link detectEventClassIssues}
 * is the union of {@link manifestObjectTypeNames} and {@link manifestFamilyNames} — an ACE may
 * legitimately target either. The project's functions-object name is resolved as
 * `options?.functionsName ?? m.functionsName ?? C3_DEFAULT_FUNCTIONS_NAME` (see
 * {@link C3_DEFAULT_FUNCTIONS_NAME}) — an explicit `options.functionsName` (a direct
 * override, same precedence an explicit `manifest` parameter takes over the on-disk
 * read) wins over the manifest's own `functionsName`, which wins over the default —
 * and passed to {@link detectEventClassIssues} so a project that renames its functions
 * object away from `"Functions"` still resolves it correctly.
 *
 * **Error policy — a deliberate divergence from `detectManifestDrift`/`detectImageDrift`:**
 * findings (the returned `issues`) are collected, but I/O and `JSON.parse` failures
 * (a missing manifest when none is supplied, an unreadable file, malformed JSON) THROW and
 * are NOT caught here. `detectManifestDrift` wraps its call to `detectImageDrift` in a
 * try/catch because image drift is a best-effort *addition* to a result the caller asked
 * for anyway — degrading to "images section omitted" is honest there. Reference integrity
 * has no such caller-didn't-ask-for-this framing: it **is** the caller's request, so silently
 * returning `{ok: true, issues: []}` for a project containing an unparseable layout would be
 * a false clean bill of health. Do not add a try/catch here to "harden" this function; that
 * would reintroduce exactly the failure mode this policy exists to avoid.
 */
export function detectReferenceIntegrity(
  projectDir: string,
  manifest?: C3ProjectManifest,
  options?: ReferenceIntegrityOptions,
): ReferenceIntegrityResult {
  const m = manifest ?? readProjectManifest(path.join(projectDir, PROJECT_MANIFEST_FILE));

  const objectTypeDocs = readSourceDocs<ObjectType>(projectDir, C3_SECTION_FOLDERS.objectTypes);
  const familyDocs = readSourceDocs<Family>(projectDir, C3_SECTION_FOLDERS.families);
  const layoutDocs = readSourceDocs<Layout>(projectDir, C3_SECTION_FOLDERS.layouts);
  const eventSheetDocs = readSourceDocs<EventSheet>(projectDir, C3_SECTION_FOLDERS.eventSheets);

  const objectTypeNames = manifestObjectTypeNames(m);
  const classNames = new Set([...objectTypeNames, ...manifestFamilyNames(m)]);
  const functionsName = options?.functionsName ?? m.functionsName ?? C3_DEFAULT_FUNCTIONS_NAME;
  const eventClassOptions: ReferenceIntegrityOptions = { ...options, functionsName };

  const issues: ReferenceIssue[] = [
    ...detectAddonReferenceIssues(m, objectTypeDocs, familyDocs, layoutDocs, options),
    ...detectFamilyMemberIssues(familyDocs, objectTypeNames),
    ...detectInstanceTypeIssues(layoutDocs, objectTypeNames),
    ...detectEventClassIssues(eventSheetDocs, classNames, eventClassOptions),
  ];

  return { issues, ok: issues.length === 0 };
}
