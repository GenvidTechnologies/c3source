# API Guide: Addon Domain Layer

Reference for the `.c3addon` domain layer added in issue #44: manifest
`usedAddons` support, object-type/family addon attribution, `.c3addon`
package discovery and reading, and the `aces.json`/`addon.json` parser
model. For the project manifest model see
[api-guide-manifest.md](api-guide-manifest.md); for the `C3Project` handle
see [api-guide-project.md](api-guide-project.md).

- [`usedAddons` manifest support](#usedaddons-manifest-support)
- [Addon attribution](#addon-attribution)
- [Discovery: `findAllAddons`](#discovery-findalladdons)
- [Package reader: `readAddonPackage`](#package-reader-readaddonpackage)
- [ACE model: `parseAcesModel` / `parseAddonMetadata`](#ace-model-parseacesmodel--parseaddonmetadata)
- [End-to-end example](#end-to-end-example)
- [Out of scope](#out-of-scope)
- [Note: differs from the original issue proposal](#note-differs-from-the-original-issue-proposal)

---

## `usedAddons` manifest support

```ts
interface C3UsedAddon {
  type: string;
  id: string;
  name: string;
  author: string;
  bundled: boolean;
  version?: string; // OPTIONAL — absent in real fixtures even when bundleAddons is true
  [k: string]: unknown;
}
```

`C3ProjectManifest` gains two optional top-level fields:

```ts
interface C3ProjectManifest {
  // …
  bundleAddons?: boolean;
  usedAddons?: C3UsedAddon[];
}
```

```ts
getUsedAddons(manifest: C3ProjectManifest): C3UsedAddon[]
```

Returns `manifest.usedAddons`, or `[]` when the section is absent (an
optional section, same convention as the rest of the manifest model).

`version` is genuinely optional — real exported projects omit it on
`usedAddons` entries even when `bundleAddons` is `true`. Do not assume its
presence.

```ts
import { readProjectManifest, getUsedAddons } from "@genvidtech/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
for (const addon of getUsedAddons(m)) {
  console.log(`${addon.id} (${addon.type}) bundled=${addon.bundled}`);
}
```

## Addon attribution

Two on-disk shapes — `ObjectType` and `Family` (in `src/layouts.ts`) — carry
the addons an item draws on:

```ts
interface BehaviorTypeRef {
  behaviorId: string;
  name: string;
  sid?: number;
  [k: string]: unknown;
}

interface EffectTypeRef {
  effectId: string;
  name: string;
  [k: string]: unknown;
}

interface ObjectType {
  name: string;
  "plugin-id": string;
  behaviorTypes?: BehaviorTypeRef[];
  effectTypes?: EffectTypeRef[];
  // …
}

interface Family {
  name: string;
  "plugin-id": string;
  members: string[];
  behaviorTypes?: BehaviorTypeRef[];
  effectTypes?: EffectTypeRef[];
  // …
}
```

`src/addons.ts` derives a uniform attribution record from either shape:

```ts
interface AddonAttribution {
  name: string;
  source: "objectType" | "family";
  pluginId: string;
  behaviorIds: string[];
  effectIds: string[];
}

attributeObjectType(ot: ObjectType): AddonAttribution
attributeFamily(f: Family): AddonAttribution
collectAddonAttribution(objectTypes: ObjectType[], families: Family[]): AddonAttribution[]
```

`attributeObjectType`/`attributeFamily` are pure derivations from an item's
own declared fields — no manifest cross-reference, no I/O. Absent
`behaviorTypes`/`effectTypes` are treated as `[]`. `collectAddonAttribution`
concatenates object-type attributions (in the given order) followed by
family attributions (in the given order).

```ts
import { collectAddonAttribution, type ObjectType, type Family } from "@genvidtech/c3source";

const objectTypes: ObjectType[] = [/* … parsed objectTypes/*.json … */];
const families: Family[] = [/* … parsed families/*.json … */];

for (const a of collectAddonAttribution(objectTypes, families)) {
  console.log(`${a.name} (${a.source}) -> plugin=${a.pluginId} behaviors=${a.behaviorIds} effects=${a.effectIds}`);
}
```

The `C3Project` handle wraps the read + derive steps:

```ts
project.collectAddonAttribution(): AddonAttribution[]
```

It reads and parses every path returned by `findAllObjectTypes()` /
`findAllFamilies()` on each call (not cached), then delegates to the free
`collectAddonAttribution`. Graceful-empty when the `objectTypes`/`families`
directories are absent, since the underlying finders already return `[]`.

## Discovery: `findAllAddons`

```ts
const C3ADDON_EXTENSION = ".c3addon";

findAllAddons(dir: string): string[]
```

Recursively finds every `.c3addon` package file under `dir`, filtering
editor-local paths via `isEditorLocalPath`. Built on `find_all_files_path` —
same pattern as `find_all_objectTypes_path` and the other named collectors.

There is **no canonical C3 subfolder** for addon-source storage (unlike
`layouts/`, `objectTypes/`, etc.), so unlike the other `findAll*` functions
this one takes a bare directory rather than deriving a path from a project
root.

The `C3Project` handle mirrors this:

```ts
project.findAllAddons(sub?: string): string[]
```

Because there is no fixed addon folder, `findAllAddons` on the handle is
scoped from `project.root` itself (not a dedicated `*Dir` field), with `sub`
(default `""`) naming the subdirectory to search — e.g.
`project.findAllAddons("addons")`. Returns `[]` when the target directory
does not exist.

```ts
import { openProject } from "@genvidtech/c3source";

const project = openProject("./my-game");
const addonPaths = project.findAllAddons("addons");
```

## Package reader: `readAddonPackage`

A `.c3addon` package ships as either an unpacked directory (as an addon
author works with it) or a zip archive (the `.c3addon` file itself, as C3
loads it). `readAddonPackage` opens either form behind one interface:

```ts
interface AddonPackage {
  readonly source: string;
  readonly kind: "directory" | "zip";
  entryNames(): string[];
  hasEntry(name: string): boolean;
  readBytes(name: string): Uint8Array;
  readText(name: string): string;
  readJson(name: string): unknown;
}

readAddonPackage(source: string): AddonPackage
```

`readAddonPackage` auto-detects the on-disk form via `statSync`. Zip mode
unzips eagerly at construction (`fflate`'s `unzipSync` — see
[ADR 0013](decisions/0013-fflate-dependency-c3addon-reader.md) for why
`fflate` was added as a dependency); directory mode reads entries lazily,
top-level only (addon.json/aces.json are always top-level, so nested
zip-internal paths are out of scope). Throws if `source` does not exist.

**BOM handling.** Real C3 addon exports write a leading UTF-8
byte-order-mark on some package entries (observed on `aces.json`, not on
`addon.json`, in SDK samples) — a raw `JSON.parse` rejects that leading
byte. `readText`/`readJson` strip it automatically via:

```ts
const UTF8_BOM = "﻿";
stripBom(text: string): string
```

`stripBom` drops a single leading BOM character; idempotent (a BOM-less
string passes through unchanged).

Two more domain-fact filename constants, mirroring `C3ADDON_EXTENSION`:

```ts
const ADDON_MANIFEST_FILE = "addon.json"; // an addon's metadata entry
const ADDON_ACES_FILE = "aces.json";      // an addon's ACE-definitions entry
```

```ts
import { readAddonPackage, ADDON_MANIFEST_FILE, ADDON_ACES_FILE } from "@genvidtech/c3source";

const pkg = readAddonPackage("./my-addon.c3addon"); // or an unpacked directory
const metadataJson = pkg.readJson(ADDON_MANIFEST_FILE);
const acesJson = pkg.readJson(ADDON_ACES_FILE);
```

`readJson` throws `Error("invalid <name>: …")` on parse failure (mirrors
`parseProjectManifest`'s error-prefix idiom).

## ACE model: `parseAcesModel` / `parseAddonMetadata`

Both parsers are **pure**: they take an already-parsed JSON value
(`unknown`), never a path. The value is expected to come from
`readAddonPackage(...).readJson(name)` (or an equivalent `JSON.parse` in
tests) — the I/O + zip layer and the parser layer are deliberately kept
separate (see ADR 0013's "pre-read-JSON boundary").

```ts
type AceKind = "action" | "condition" | "expression";

interface AceParam {
  id: string;
  type: string;
  [k: string]: unknown;
}

interface AceAction {
  kind: "action";
  category: string; // the object-class name this ACE was declared under, e.g. "custom"
  id: string;
  scriptName: string;
  params: AceParam[];
  [k: string]: unknown;
}

interface AceCondition {
  kind: "condition";
  category: string;
  id: string;
  scriptName: string;
  params: AceParam[];
  [k: string]: unknown;
}

interface AceExpression {
  kind: "expression";
  category: string;
  id: string;
  expressionName: string;
  returnType: string;
  params: AceParam[];
  [k: string]: unknown;
}

type Ace = AceAction | AceCondition | AceExpression;

interface AcesModel {
  actions: AceAction[];
  conditions: AceCondition[];
  expressions: AceExpression[];
}

parseAcesModel(json: unknown): AcesModel
```

`aces.json`'s top level is one key per **category** (object-class name, e.g.
`"custom"`), aside from an ignored `$schema` key; each category holds
optional `conditions`/`actions`/`expressions` arrays (absent treated as
`[]`, and a per-ACE `params` array is itself optional — e.g. `do-alert` has
none). `parseAcesModel` flattens all categories into one `AcesModel`,
stamping each ACE's originating `category` and `kind`. Throws
`Error("invalid aces.json: …")` on shape violation.

```ts
interface AddonMetadata {
  "is-c3-addon"?: boolean;
  "sdk-version"?: number;
  type: "plugin" | "behavior" | "effect";
  name: string;
  id: string;
  version: string;
  author: string;
  [k: string]: unknown;
}

parseAddonMetadata(json: unknown): AddonMetadata
```

`type`/`id`/`name`/`version`/`author` are required strings;
`is-c3-addon`/`sdk-version` stay optional/lenient (observed on real SDK
samples but not required for parsing). Throws `Error("invalid addon.json:
…")` on shape violation.

**Two domain facts to keep straight:**

- **Expressions are keyed by `expressionName`, not `id`.** `id` is the
  dash-cased ACE identifier (e.g. `"current-value"`); `expressionName` is
  the distinct PascalCase name used in event-sheet expressions (e.g.
  `"CurrentValue"`). They need not share a stem.
- **An ACE's identity is the pair `(kind, id)`, not `id` alone.** An action
  and a condition (or expression) may legally share the same `id`.

```ts
aceIdentity(kind: AceKind, id: string): string
findAce(model: AcesModel, kind: AceKind, id: string): Ace | undefined
findExpression(model: AcesModel, expressionName: string): AceExpression | undefined
```

`aceIdentity` builds the canonical `` `${kind}:${id}` `` identity string.
`findAce` resolves by `(kind, id)` — note expressions ARE matched by `id`
here too. `findExpression` resolves by `expressionName` instead; use it
when you have a name from event-sheet expression text (see
[api-guide-extraction.md — Expression references](api-guide-extraction.md#expression-references-extractexpressionreferences)),
not an ACE `id`.

## End-to-end example

```ts
import {
  openProject,
  getUsedAddons,
  readAddonPackage,
  parseAcesModel,
  findExpression,
  ADDON_ACES_FILE,
} from "@genvidtech/c3source";

const project = openProject("./my-game");

// What addons does the project declare?
const declared = getUsedAddons(project.manifest());

// What addons does the project source actually reference?
const attributions = project.collectAddonAttribution();

// Where are the addon packages themselves?
for (const addonPath of project.findAllAddons("addons")) {
  const pkg = readAddonPackage(addonPath);
  const model = parseAcesModel(pkg.readJson(ADDON_ACES_FILE));

  const expr = findExpression(model, "CurrentValue");
  if (expr) console.log(`CurrentValue returns ${expr.returnType}`);
}
```

## Out of scope

This layer parses, models, and discovers — it does not reconcile or render.
Consumers own:

- **Validation/reconciliation** — cross-referencing `usedAddons` (declared)
  against `collectAddonAttribution` (referenced) or against the addon
  packages found by `findAllAddons` to flag missing/unused addons.
- **ACE diff** — comparing two `AcesModel`s (e.g. across an addon version
  bump) to detect added/removed/changed actions, conditions, or
  expressions.
- **Usage / blast-radius scans** — finding every event-sheet reference to a
  given addon's actions/conditions/expressions (build on
  [`extractExpressionReferences`](api-guide-extraction.md#expression-references-extractexpressionreferences)
  and `findAce`/`findExpression` for the resolution step).
- **Rendering** — presenting attribution, drift, or ACE-diff results to a
  user.

## Note: differs from the original issue proposal

Issue #44 item 4 originally proposed a single `behaviors[] { behaviorId,
name }` field. The shipped shape, confirmed against real
`construct3-chef-sample` fixtures, is **two separate fields**:

- `behaviorTypes[] { behaviorId, name, sid? }` — note the field is named
  `behaviorTypes`, not `behaviors`, and each entry carries an optional
  numeric `sid`.
- `effectTypes[] { effectId, name }` — a distinct field for attached
  effects; effect entries carry **no** `sid`.

This document reflects the shipped, ground-truth-confirmed shape.
