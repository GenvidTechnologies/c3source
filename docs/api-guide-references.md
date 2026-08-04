# API Guide: Reference Integrity Detection

Reference for the cross-reference detection layer added in issue #60:
unresolved addon, family-member, instance-type, and event-`objectClass`
references across a C3 project's manifest and source. For the addon
attribution/discovery layer see [api-guide-addons.md](api-guide-addons.md);
for manifest membership drift see [api-guide-manifest.md](api-guide-manifest.md);
for the `C3Project` handle see [api-guide-project.md](api-guide-project.md).
For the architecture rationale (why a new module rather than extending
`detectManifestDrift`, why a new DAG tier, why `collectAddonAttribution` was
supplemented rather than widened) see
[ADR 0021](decisions/0021-reference-integrity-detection.md) — this guide
covers how to use the API, not why it is shaped this way.

- [The five issue kinds](#the-five-issue-kinds)
- [`ReferenceIssue` fields](#referenceissue-fields)
- [Domain-fact tables](#domain-fact-tables)
- [The four pure detectors](#the-four-pure-detectors)
- [The I/O orchestrator: `detectReferenceIntegrity`](#the-io-orchestrator-detectreferenceintegrity)
- [The `C3Project` handle method](#the-c3project-handle-method)
- [Error policy](#error-policy)
- [Out of scope / adjacent references](#out-of-scope--adjacent-references)
- [Ownership boundary vs. construct3-chef](#ownership-boundary-vs-construct3-chef)
- [Dev tool: `scripts/scan-references.mjs`](#dev-tool-scriptsscan-referencesmjs)

---

## The five issue kinds

```ts
type ReferenceIssueKind =
  | "addon-undeclared"
  | "addon-unused"
  | "family-member-missing"
  | "instance-type-missing"
  | "event-class-unresolved";

type ReferenceIssueSeverity = "error" | "warning";
```

| Kind | Severity | Meaning |
|---|---|---|
| `addon-undeclared` | `error` | An object type, family, layout, or layer draws on an addon (plugin/behavior/effect) with no matching `usedAddons` entry in the manifest. C3 fails to load the project. |
| `addon-unused` | `warning` | A manifest `usedAddons` entry matches nothing derived from source. Hygiene only — C3 still loads the project. |
| `family-member-missing` | `error` | A `Family.members` entry names an object type absent from the manifest. C3 fails to load the family. |
| `instance-type-missing` | `error` | A layout instance's `type` names an object type absent from the manifest. C3 fails to load the layout. |
| `event-class-unresolved` | `warning` | An event-sheet ACE's `objectClass` resolves to neither an object type nor a family nor a known pseudo-class nor the project's functions object. |

`error` means C3 fails to load the project outright; `warning` means either
pure hygiene (`addon-unused` — nothing breaks, something is just declared and
unused) or genuine **detector uncertainty** (`event-class-unresolved`).

**Why `event-class-unresolved`, not `event-class-missing`.** The detector
cannot tell a deleted object type (a real load breaker) from a pseudo-class
its table doesn't yet know about (harmless — see
[`C3_PSEUDO_OBJECT_CLASSES`](#domain-fact-tables) below). Naming the kind
*unresolved* is the honest label; a *missing* label would claim more
certainty than the check actually has. `warning` severity follows the same
reasoning.

## `ReferenceIssue` fields

```ts
interface ReferenceIssue {
  kind: ReferenceIssueKind;
  severity: ReferenceIssueSeverity;
  name: string;             // the unresolved reference text: an addon id, an object-type name, an objectClass
  file: string;              // file holding the reference ("project.c3proj" for addon-unused)
  owner: string;              // C3 `name` of the holding artifact; "" for the manifest root
  jsonPath: string;           // intra-file locator, same grammar as formatSidPath
  layerFullName?: string;     // LayerEntry.fullName of the holding layer — instance-type-missing only
  addonType?: string;         // usedAddons[].type — addon-* only
  message: string;
}
```

**`jsonPath` grammar and worked examples.** `jsonPath` follows the same
dotted/indexed grammar as `formatSidPath` (see
[api-guide.md — SID traversal](api-guide.md#sid-traversal)): array index →
`[i]`, object key → `.key` except a leading key has no dot.

| `jsonPath` | From |
|---|---|
| `plugin-id` | `ObjectType`/`Family`'s own `plugin-id` field (an `addon-undeclared` issue) |
| `behaviorTypes[0]` | First `behaviorTypes` entry |
| `effectTypes[1]` | Second `effectTypes` entry (object type/family, or a layout's own top-level effect) |
| `members[2]` | `Family.members[2]` |
| `layers[0].instances[3]` | An instance on a top-level layer |
| `layers[2].subLayers[0].subLayers[0].instances[0]` | An instance nested two `subLayers` deep |
| `nonworld-instances[0]` | The layout's own root-level `nonworld-instances` array |
| `events[1].children[2]` | `visitEvents`' own `jsonPath`, for `event-class-unresolved` |
| `usedAddons[0]` | An `addon-unused` entry, rooted at the manifest |

**The dashed-key caveat.** `plugin-id` and `nonworld-instances[0]` render
their dashed keys **bare** — not quoted, not bracket-indexed
(`["plugin-id"]`). A real JS accessor for a dashed key requires bracket
notation, but `jsonPath` does not attempt to produce evaluable JS: it is a
**locator, not an expression**, the same contract `collectSidsWithPaths`
already documents for its `path` strings. This is documented rather than
"fixed" — making it eval-able would mean forking the grammar (bracket-quote
dashed keys, dot bare keys), which would only serve a caller trying to
`eval`/`vm.compileFunction` these strings, a use case this module does not
support.

## Domain-fact tables

One exported table plus one exported constant, following the same convention
as `EVENTVAR_REFERENCE_ACES`/`IMAGE_FILE_TYPE_EXTENSIONS`/`EDITOR_FIELD_RULES`
(see [api-guide-extraction.md](api-guide-extraction.md)):

```ts
const C3_PSEUDO_OBJECT_CLASSES: string[] = ["System"];
const C3_DEFAULT_FUNCTIONS_NAME = "Functions";
const NON_ATTRIBUTABLE_ADDON_TYPES: string[] = ["theme"];
```

**`C3_PSEUDO_OBJECT_CLASSES`** — `objectClass` values that resolve to no
object type and no family **by design**, holding only the **statically**
known pseudo-classes: `"System"` (the built-in System object). **Known
incomplete even for the classes it does cover** — it was derived from a
corpus scan (14 projects as of 2026-08-04; see
[domain-fact-audit.md](domain-fact-audit.md)), not from C3's source, and the
canonical fixture alone yields only `{"System"}` (see
[ADR 0021](decisions/0021-reference-integrity-detection.md), point 4, for the
corpus evidence). `Mouse`/`Keyboard`/`Touch`/`Audio`/`Browser` are **not**
pseudo-classes — each is an ordinary object type with its own
`objectTypes/*.json` entry and manifest membership, so they must resolve
normally rather than being special-cased here.

C3's built-in event-sheet-functions object is deliberately **not** in this
table: its `objectClass` name is a **per-project setting**, not a fixed
string. This distinction was learned the hard way — see the
[ADR 0021 consequences correction](decisions/0021-reference-integrity-detection.md#consequences)
for how a corpus scan can confirm a string value while missing the mechanism
behind it.

**`C3_DEFAULT_FUNCTIONS_NAME`** (`"Functions"`) — the functions object's name
when `project.c3proj` omits `functionsName` (see
[`C3ProjectManifest.functionsName`](api-guide-manifest.md)). `detectEventClassIssues`
resolves an ACE's `objectClass` against this name **in addition to**
`classNames` and the pseudo-class set — via
[`ReferenceIntegrityOptions.functionsName`](#the-four-pure-detectors), which
is a single **additional** resolvable name, not a replacement for
`C3_PSEUDO_OBJECT_CLASSES`. `detectReferenceIntegrity` resolves it with
precedence **explicit `options.functionsName` → `manifest.functionsName` →
`C3_DEFAULT_FUNCTIONS_NAME`**, so most callers never need to set it
explicitly. If a project renames its functions object (e.g. to `"Fn"`), the
literal `"Functions"` **stops resolving** — C3 does not keep it as an alias,
so a caller that hardcodes `"Functions"` instead of reading `functionsName`
will misclassify every function-call ACE in a renamed project.

**`NON_ATTRIBUTABLE_ADDON_TYPES`** — `usedAddons[].type` values that can
never appear on the source-derived side, so `addon-unused` never reports
them. Currently just `"theme"` (`plugin`/`behavior`/`effect` are the only
attributable types).

**Extending/tuning them.** Matching the `EDITOR_FIELD_RULES` convention,
per-call via `ReferenceIntegrityOptions`:

```ts
interface ReferenceIntegrityOptions {
  pseudoObjectClasses?: readonly string[];       // REPLACES C3_PSEUDO_OBJECT_CLASSES
  nonAttributableAddonTypes?: readonly string[]; // REPLACES NON_ATTRIBUTABLE_ADDON_TYPES
  functionsName?: string;                        // ADDS ONE resolvable name, alongside the table
}
```

**This asymmetry is easy to misread — `pseudoObjectClasses` and
`nonAttributableAddonTypes` each *replace* their table wholesale for the
call; `functionsName` *adds* a single name on top of whatever pseudo-class
set is in effect.** To extend a table rather than override it, spread the
base table in yourself:

```ts
import { C3_PSEUDO_OBJECT_CLASSES, detectReferenceIntegrity } from "@genvidtech/c3source";

const result = detectReferenceIntegrity("./my-game", undefined, {
  pseudoObjectClasses: [...C3_PSEUDO_OBJECT_CLASSES, "MyPluginPseudoClass"],
});
```

Passing `pseudoObjectClasses: ["MyPluginPseudoClass"]` alone would drop
`"System"` entirely and start flagging every ordinary `System` ACE — always
spread the base table in first. `functionsName`, by contrast, never needs
that treatment — pass just the renamed value:

```ts
const result = detectReferenceIntegrity("./my-game", undefined, {
  functionsName: "Fn", // this project renamed its functions object away from the default
});
```

## The four pure detectors

All four take no I/O — they operate on already-parsed values wrapped in
`SourceDoc<T>`, the seam that makes both sides of every join testable in
memory without touching disk:

```ts
interface SourceDoc<T> {
  file: string;  // project-root-relative, forward-slash-normalized when produced by the orchestrator
  value: T;
}
```

**`detectAddonReferenceIssues`** — joins declared (`manifest.usedAddons`)
against derived (`attributeObjectType`/`attributeFamily` plus
`collectLayoutEffectIds` for layout/layer-level effects), keyed on the pair
`(type, id)` — never `name`, since C3 display names diverge systematically
from ids. Emits both `addon-undeclared` and `addon-unused`.

```ts
import { detectAddonReferenceIssues, readProjectManifest } from "@genvidtech/c3source";
import type { SourceDoc, ObjectType, Family, Layout } from "@genvidtech/c3source";

const manifest = readProjectManifest("./my-game/project.c3proj");
const objectTypes: SourceDoc<ObjectType>[] = [
  { file: "objectTypes/Sprite.json", value: /* parsed Sprite.json */ {} as ObjectType },
];
const families: SourceDoc<Family>[] = [];
const layouts: SourceDoc<Layout>[] = [];

const issues = detectAddonReferenceIssues(manifest, objectTypes, families, layouts);
```

**`detectFamilyMemberIssues`** — every `Family.members[i]` must name a
manifest-declared object type.

```ts
import { detectFamilyMemberIssues, manifestObjectTypeNames, readProjectManifest } from "@genvidtech/c3source";
import type { SourceDoc, Family } from "@genvidtech/c3source";

const manifest = readProjectManifest("./my-game/project.c3proj");
const families: SourceDoc<Family>[] = [
  { file: "families/TextFamily.json", value: /* parsed TextFamily.json */ {} as Family },
];

const issues = detectFamilyMemberIssues(families, manifestObjectTypeNames(manifest));
```

**`detectInstanceTypeIssues`** — every layer instance's and every
`nonworld-instances[]` entry's `type` must name a manifest-declared object
type. Layer instances are walked via `walkLayerEntries` (the one canonical
layer walk), so `jsonPath`/`layerFullName` reuse its output rather than
re-deriving it.

```ts
import { detectInstanceTypeIssues, manifestObjectTypeNames, readProjectManifest } from "@genvidtech/c3source";
import type { SourceDoc, Layout } from "@genvidtech/c3source";

const manifest = readProjectManifest("./my-game/project.c3proj");
const layouts: SourceDoc<Layout>[] = [
  { file: "layouts/Main.json", value: /* parsed Main.json */ {} as Layout },
];

const issues = detectInstanceTypeIssues(layouts, manifestObjectTypeNames(manifest));
```

**`detectEventClassIssues`** — every ACE's `objectClass` (condition, action,
or a `custom-ace-block` event's own) must resolve to a manifest object type,
a manifest family, a pseudo-class, or the project's functions object.
`classNames` is the caller-supplied union of both name sets, since an ACE may
legitimately target a family. Reporting is **one issue per event** (matching
`validateEventForEditor`'s existing event-granularity precedent), not one per
ACE.

A **direct** caller of this pure detector has no manifest handed to it (that
only happens inside `detectReferenceIntegrity`), so if the project being
checked renamed its functions object, pass that name explicitly via
`options.functionsName` — omitting it falls back to
`C3_DEFAULT_FUNCTIONS_NAME` (`"Functions"`), which is correct only for a
project using the default:

```ts
import {
  detectEventClassIssues,
  manifestFamilyNames,
  manifestObjectTypeNames,
  readProjectManifest,
} from "@genvidtech/c3source";
import type { SourceDoc, EventSheet } from "@genvidtech/c3source";

const manifest = readProjectManifest("./my-game/project.c3proj");
const sheets: SourceDoc<EventSheet>[] = [
  { file: "eventSheets/GamePlay.json", value: /* parsed GamePlay.json */ {} as EventSheet },
];
const classNames = new Set([...manifestObjectTypeNames(manifest), ...manifestFamilyNames(manifest)]);

const issues = detectEventClassIssues(sheets, classNames, {
  functionsName: manifest.functionsName, // undefined falls back to C3_DEFAULT_FUNCTIONS_NAME internally
});
```

## The I/O orchestrator: `detectReferenceIntegrity`

```ts
interface ReferenceIntegrityResult {
  issues: ReferenceIssue[];
  ok: boolean; // issues.length === 0, mirrors ManifestDrift.inSync
}

detectReferenceIntegrity(
  projectDir: string,
  manifest?: C3ProjectManifest,
  options?: ReferenceIntegrityOptions,
): ReferenceIntegrityResult
```

Reads the project from disk and runs all four detectors. When `manifest` is
omitted, it reads `<projectDir>/project.c3proj` via `readProjectManifest`
(strict — throws on a malformed manifest). The functions object's name for
`detectEventClassIssues` is resolved with precedence **`options.functionsName`
→ `manifest.functionsName` → `C3_DEFAULT_FUNCTIONS_NAME`** — an explicit
option wins over whatever the manifest declares, which wins over the default
— so a caller almost never needs to set `functionsName` explicitly; it exists
for the orchestrator itself and for a direct caller of the pure detector (see
[Domain-fact tables](#domain-fact-tables)). Source is read from the four
section directories named by `C3_SECTION_FOLDERS` (`objectTypes`, `families`,
`layouts`, `eventSheets`), each graceful-empty when its directory is absent —
a project with no `families/` folder is not itself a reference-integrity
failure.

```ts
import { detectReferenceIntegrity } from "@genvidtech/c3source";

const result = detectReferenceIntegrity("./my-game");

if (result.ok) {
  console.log("No unresolved references.");
} else {
  for (const issue of result.issues) {
    const marker = issue.severity === "error" ? "ERROR" : "WARN";
    console.log(`[${marker}] ${issue.kind} ${issue.file}:${issue.jsonPath} — ${issue.message}`);
  }
}
```

To inject a pre-parsed or in-memory-mutated manifest (e.g. after testing a
hypothetical edit), pass it explicitly — this is what makes the whole module
testable without a temp project on disk:

```ts
import { detectReferenceIntegrity, readProjectManifest } from "@genvidtech/c3source";

const m = readProjectManifest("./my-game/project.c3proj");
m.usedAddons = m.usedAddons?.filter((a) => a.id !== "MyPlugin");
const result = detectReferenceIntegrity("./my-game", m);
```

## The `C3Project` handle method

```ts
project.detectReferenceIntegrity(options?: ReferenceIntegrityOptions): ReferenceIntegrityResult
```

Delegates to `detectReferenceIntegrity` with the project root **and the
handle's cached manifest** (from `manifest()`) — same pattern as
`detectManifestDrift()`/`detectImageDrift()`, avoiding a second read of
`project.c3proj`.

```ts
import { openProject } from "@genvidtech/c3source";

const project = openProject("./my-game");
const result = project.detectReferenceIntegrity();
if (!result.ok) {
  const errors = result.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) throw new Error(`project has ${errors.length} unresolved reference(s)`);
}
```

## Error policy

**Findings are collected, but I/O and `JSON.parse` failures throw and are
not swallowed.** This is a deliberate divergence from `detectImageDrift`:
`detectManifestDrift` wraps its call to `detectImageDrift` in a try/catch
because image drift is a best-effort *addition* to a result the caller asked
for anyway — degrading to "images section omitted" is honest there.
Reference integrity has no such caller-didn't-ask-for-this framing: it **is**
the caller's request. Silently returning `{ok: true, issues: []}` for a
project containing an unparseable layout would be a false clean bill of
health, not a best-effort partial answer. A missing manifest (when none is
supplied), an unreadable source file, or malformed JSON all propagate as
thrown errors — catch them at the call site if you want to degrade
gracefully; `detectReferenceIntegrity` will not do it for you.

## Out of scope / adjacent references

Stated explicitly so a later reader doesn't assume these were overlooked:

- **`Layout.eventSheet` and `IncludeEvent.includeSheet`** — event-sheet name
  references are not checked.
- **A future `LAYOUT_REFERENCE_ACES` table** for System ACEs naming a layout
  is not implemented. `go-to-layout` carries a **bare**
  `parameters.layout`; `go-to-layout-by-name` carries a **quoted
  expression** instead — the two need distinct handling, which is why this
  wasn't folded into the current pass.
- **`Condition/Action.behaviorType`** is not checked — and **must not** be
  checked naively. The canonical fixture has an ACE with
  `{"objectClass":"Text","behaviorType":"Timer"}` where object type `Text`
  has **no behaviors of its own** — `Timer` is inherited through family
  `TextFamily`. An object-type-only lookup would false-positive on this
  legitimate case.

## Ownership boundary vs. construct3-chef

c3source ships the **declared ↔ used-in-source** edge
(`addon-undeclared`/`addon-unused`, joining `usedAddons` against
`collectAddonAttribution` + `collectLayoutEffectIds`). The **`.c3addon`
package ↔ `usedAddons`** direction — does every declared addon resolve to an
actual installed `.c3addon` package, and vice versa — belongs to
construct3-chef (`addonValidator.ts`, `addonInventory.ts`). Do not
re-implement that side here; c3source has no opinion on where addon packages
are installed or how they are resolved at build time.

## Dev tool: `scripts/scan-references.mjs`

```
node scripts/scan-references.mjs <projectDir> [<projectDir> ...]
```

Dev-only, not wired into CI or `package.json` (mirrors
`scripts/api-surface.mjs`). Runs the full detector suite against one or more
real C3 projects and prints unresolved-`objectClass` occurrence counts
(undeduped, unlike `detectEventClassIssues`' one-per-event reporting), addon
issue counts with and without layout/layer effects included, and
family-member/instance-type/event-class totals per project plus a corpus
roll-up. This is the tool to re-run `C3_PSEUDO_OBJECT_CLASSES` against real
projects — on a C3 version bump, or whenever new projects become available —
since the canonical fixture alone cannot validate that table (see
[ADR 0021](decisions/0021-reference-integrity-detection.md), point 4).
