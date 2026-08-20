---
type: reference
title: Reference Integrity
description: detectReferenceIntegrity finds unresolved name-keyed cross-references a project's own manifest and source data imply — addon, family-member, instance-type, and event-objectClass edges — via four pure detectors plus one I/O orchestrator, distinct from editor-observed rejections.
tags: [reference-integrity, addons, event-class, functions-object, detectors]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide-references
    resource: ../raw/docs-api-guide-references-2026-08-20.md
    title: "docs/api-guide-references.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Reference Integrity

`src/references.ts` (issue #60) detects **unresolved** name-keyed
cross-references that a C3 project's own manifest/source data implies —
not editor-observed rejections[^claude-md]. It sits one tier above the
`layouts`/`eventSheets`/`addons`/`manifest` sibling group in the module DAG,
importing all four — see [Module Architecture](/module-architecture.md).

## The five issue kinds

One `ReferenceIssue` type covers five kinds:

| Kind | Severity | Meaning |
|---|---|---|
| `addon-undeclared` | `error` | An object type, family, layout, or layer draws on an addon (plugin/behavior/effect) with no matching `usedAddons` entry in the manifest — C3 fails to load the project. |
| `addon-unused` | `warning` | A manifest `usedAddons` entry matches nothing derived from source — hygiene only, C3 still loads the project. |
| `family-member-missing` | `error` | A `Family.members` entry names an object type absent from the manifest — C3 fails to load the family. |
| `instance-type-missing` | `error` | A layout instance's `type` names an object type absent from the manifest — C3 fails to load the layout. |
| `event-class-unresolved` | `warning` | An event-sheet ACE's `objectClass` resolves to neither an object type, a family, a known pseudo-class, nor the project's functions object. |

`addon-undeclared`/`family-member-missing`/`instance-type-missing` are
`error` because C3 fails to load the project outright; `addon-unused` is
`warning` because it is pure hygiene — nothing breaks, something is just
declared and unused[^claude-md].

**Why `event-class-unresolved`, not `event-class-missing`.** The detector
cannot distinguish a deleted object type (a real load breaker) from a
pseudo-class its table doesn't yet know about (harmless). Naming the kind
*unresolved* is the honest label — a *missing* label would claim more
certainty than the check actually has, and `warning` severity follows the
same reasoning[^api-guide-references]. This is a case where the detector's
own epistemic limits — not the underlying C3 semantics — determine the
issue's naming and severity.

## Shape: four pure detectors, one I/O orchestrator, one handle method

All four detectors take **no I/O** — they operate on already-parsed values
wrapped in `SourceDoc<T> {file, value}`, the seam that makes both sides of
every join testable in memory without touching disk[^claude-md]:

- **`detectAddonReferenceIssues`** — joins declared (`manifest.usedAddons`)
  against derived (`attributeObjectType`/`attributeFamily` plus
  `collectLayoutEffectIds` for layout/layer-level effects — see [Addon
  Domain Layer](/addon-domain-layer.md)), keyed on the pair `(type, id)` —
  never `name`, since C3 display names diverge systematically from
  ids[^api-guide-references]. Emits both `addon-undeclared` and
  `addon-unused`.
- **`detectFamilyMemberIssues`** — every `Family.members[i]` must name a
  manifest-declared object type.
- **`detectInstanceTypeIssues`** — every layer instance's and every
  `nonworld-instances[]` entry's `type` must name a manifest-declared object
  type; layer instances are walked via `walkLayerEntries` (see [Layout
  Traversal](/layout-traversal.md)), so `jsonPath`/`layerFullName` reuse its
  output rather than re-deriving it[^api-guide-references].
- **`detectEventClassIssues`** — every ACE's `objectClass` (condition,
  action, or a `custom-ace-block` event's own) must resolve to a manifest
  object type, a manifest family, a pseudo-class, or the project's functions
  object. Reporting is **one issue per event**, matching
  `validateEventForEditor`'s existing event-granularity precedent, not one
  per ACE[^api-guide-references].

The **one I/O orchestrator**, `detectReferenceIntegrity(projectDir,
manifest?, options?)`, reads the project from disk and runs all four
detectors, returning `{issues: ReferenceIssue[], ok: boolean}` (`ok` mirrors
`ManifestDrift.inSync`)[^api-guide-references]. When `manifest` is omitted
it reads strictly via `readProjectManifest`; source is read from the four
section directories named by `C3_SECTION_FOLDERS`
(`objectTypes`/`families`/`layouts`/`eventSheets`), each graceful-empty when
its directory is absent[^api-guide-references]. The `C3Project` handle's
`detectReferenceIntegrity(options?)` delegates the same way, passing the
project root and the handle's **cached** manifest — see [C3Project
Handle](/c3project-handle.md)[^claude-md].

## `C3_PSEUDO_OBJECT_CLASSES` — known incomplete

```ts
const C3_PSEUDO_OBJECT_CLASSES: string[] = ["System"];
```

`objectClass` values that resolve to no object type and no family **by
design**, holding only the **statically** known pseudo-classes — currently
just `"System"`[^claude-md]. It is **known incomplete even for the classes
it does cover**: derived from a corpus scan (14 projects as of 2026-08-04),
not from C3's source, and the canonical fixture alone yields only
`{"System"}`[^api-guide-references]. `scripts/scan-references.mjs`
(dev-only, mirroring `scripts/api-surface.mjs`) is the tool to re-validate
this table against real projects on a C3 version bump — it reports
unresolved-`objectClass` occurrence counts and other totals per project plus
a corpus roll-up, not a verdict; see [C3 Domain
Facts](/c3-domain-facts.md)[^api-guide-references]. `Mouse`/`Keyboard`/
`Touch`/`Audio`/`Browser` are **not** pseudo-classes — each is an ordinary
object type with its own `objectTypes/*.json` entry and manifest
membership, so they must resolve normally rather than being special-cased
here[^api-guide-references].

`ReferenceIntegrityOptions.pseudoObjectClasses` **replaces** the table
wholesale for the call — passing a single custom name alone would drop
`"System"` entirely and start flagging every ordinary `System` ACE, so
extending rather than overriding means spreading the base table in
yourself: `[...C3_PSEUDO_OBJECT_CLASSES, "MyPluginPseudoClass"]`[^api-guide-references].

## The functions-object story

C3's built-in event-sheet-functions object is deliberately **not** in
`C3_PSEUDO_OBJECT_CLASSES`: its `objectClass` name is a **per-project
setting**, not a fixed string[^claude-md]. `C3_DEFAULT_FUNCTIONS_NAME =
"Functions"` names the default used when `project.c3proj` omits its
optional `functionsName` field[^claude-md]. `detectEventClassIssues`
resolves the functions object separately, as one **additional** resolvable
name atop the pseudo-class set — via `ReferenceIntegrityOptions.functionsName`
— never as a replacement for `C3_PSEUDO_OBJECT_CLASSES`[^api-guide-references].
`detectReferenceIntegrity` resolves it with precedence **explicit
`options.functionsName` → `manifest.functionsName` →
`C3_DEFAULT_FUNCTIONS_NAME`**, so most callers never need to set it
explicitly[^claude-md]. If a project renames its functions object (e.g. to
`"Fn"`), the literal `"Functions"` **stops resolving** — C3 does not keep it
as an alias, so a caller that hardcodes `"Functions"` instead of reading
`functionsName` will misclassify every function-call ACE in a renamed
project[^api-guide-references].

**This asymmetry is the opposite of `pseudoObjectClasses`/
`nonAttributableAddonTypes`**, which each *replace* their table wholesale
for the call; `functionsName` *adds* a single name on top of whatever
pseudo-class set is in effect, so it never needs the spread-the-base-table
treatment[^api-guide-references].

### The real defect this fixed

This was a real defect (issue #60, fixed in commit `353f571`): the pseudo-class
table originally hardcoded `"Functions"` too, and the 14-project corpus scan
never caught it — because **every scanned project used the default
name**[^claude-md]. Every scanned project sharing the same value is exactly
how a corpus of any size fails to reveal configurability on a dimension it
is uniform on: breadth confirmed the *value* and concealed that it was a
*setting*[^claude-md]. This is the running example [C3 Domain
Facts](/c3-domain-facts.md) cites for why a corpus answers "what values
occur" and not "what the mechanism is."

## `jsonPath` grammar

`jsonPath` follows the same dotted/indexed grammar as `formatSidPath` (see
[Event-Sheet Extraction](/event-sheet-extraction.md)): array index → `[i]`,
object key → `.key`, except a leading key has no dot. Dashed keys
(`plugin-id`, `nonworld-instances[0]`) render **bare** — not quoted, not
bracket-indexed — because `jsonPath` is a **locator, not an expression**;
making it eval-able would fork the grammar for a use case (`eval`/
`vm.compileFunction`) this module does not support[^api-guide-references].

## `collectLayoutEffectIds` supplements, never widens, attribution

A layout's own top-level `effectTypes` and a layer's/sublayer's
`effectTypes` are exposed by `collectLayoutEffectIds`, a **sibling**
function to `collectAddonAttribution`, not a widening of it — see [Addon
Domain Layer — Attribution](/addon-domain-layer.md#attribution) for why
folding layout/layer effects into `collectAddonAttribution` itself would
break an exhaustive `switch` on `AddonAttribution.source`.

## Error policy: deliberately diverges from `detectImageDrift`

**Findings are collected, but I/O and `JSON.parse` failures throw and are
not swallowed.** This is a deliberate divergence from `detectImageDrift`
(see [Project Manifest](/project-manifest.md)): `detectManifestDrift` wraps
its call to `detectImageDrift` in a try/catch because image drift is a
best-effort *addition* to a result the caller asked for anyway — degrading
to "images section omitted" is honest there. Reference integrity has no such
caller-didn't-ask-for-this framing: it **is** the caller's
request[^api-guide-references]. Silently returning `{ok: true, issues: []}`
for a project containing an unparseable layout would be a false clean bill
of health, not a best-effort partial answer — a missing manifest, an
unreadable source file, or malformed JSON all propagate as thrown errors;
catch them at the call site if graceful degradation is
wanted[^api-guide-references].

## Ownership boundary vs. construct3-chef

c3source ships the **declared ↔ used-in-source** edge
(`addon-undeclared`/`addon-unused`, joining `usedAddons` against
`collectAddonAttribution` + `collectLayoutEffectIds`). The **`.c3addon`
package ↔ `usedAddons`** direction — does every declared addon resolve to an
actual installed `.c3addon` package, and vice versa — belongs to
construct3-chef (`addonValidator.ts`, `addonInventory.ts`); c3source has no
opinion on where addon packages are installed or how they are resolved at
build time[^api-guide-references].

See [ADR 0021](/decisions/0021-reference-integrity-detection.md) for
the architecture rationale — why a new module rather than extending
`detectManifestDrift`, why a new DAG tier, and why `collectAddonAttribution`
was supplemented rather than widened.

## Related

- [Addon Domain Layer](/addon-domain-layer.md) — attribution and discovery this module's addon detector joins against.
- [Project Manifest](/project-manifest.md) — `detectManifestDrift`/`detectImageDrift`, whose error-policy contrast motivates this module's own "collect but don't swallow" rule.
- [C3 Domain Facts](/c3-domain-facts.md) — `C3_PSEUDO_OBJECT_CLASSES`'s KNOWN INCOMPLETE label and re-validation tooling.
- [C3Project Handle](/c3project-handle.md) — the root-bound wrapper for `detectReferenceIntegrity`.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide-references]: docs/api-guide-references.md (c3source API guide, 2026-08-20 capture)
