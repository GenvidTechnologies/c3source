import { BehaviorTypeRef, EffectTypeRef, Family, ObjectType } from "./layouts.js";

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
