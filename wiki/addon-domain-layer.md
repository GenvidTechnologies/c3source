---
type: reference
title: Addon Domain Layer
description: c3source models and discovers .c3addon plugin/behavior/effect packages — attribution from an item's own declared fields, package reading with directory-vs-zip auto-detection via fflate, and a pure ACE-model parser — while validation, diffing, and rendering stay the consumer's job.
tags: [addons, c3addon, attribution, fflate, ace-model]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide-addons
    resource: ../raw/docs-api-guide-addons-2026-08-20.md
    title: "docs/api-guide-addons.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Addon Domain Layer

`src/addons.ts` (issue #44) is c3source's model of Construct's `.c3addon`
plugin/behavior/effect packages. It sits at the same DAG tier as
`eventSheets`/`manifest` — see [Module Architecture](/module-architecture.md)
— importing only `layouts`, for `ObjectType`/`Family`/`find_all_files_path`/
`isEditorLocalPath`[^claude-md].

## Domain/presentation split

The layer follows the same split as the rest of the library: c3source
**models and discovers** addon data; it does not reconcile or render.
Validation, diffing, and rendering — comparing two `AcesModel`s across an
addon version bump, scanning for every event-sheet reference to a given
addon's ACEs, or presenting attribution/drift results to a user — all stay
the consumer's job[^api-guide-addons].

## Attribution

`attributeObjectType(ot)`/`attributeFamily(f)` derive a uniform
`AddonAttribution` (`name`, `source: "objectType" | "family"`, `pluginId`,
`behaviorIds[]`, `effectIds[]`) purely from an item's **own declared
fields** — no manifest cross-reference, no I/O[^claude-md]. The source
fields are `plugin-id` plus the `behaviorId`/`effectId` of each entry in
`behaviorTypes: BehaviorTypeRef[] {behaviorId, name, sid?}` /
`effectTypes: EffectTypeRef[] {effectId, name}`, both added to `ObjectType`
and to the new `Family` type, and both pinned from real fixtures as C3
domain facts[^claude-md]. Absent `behaviorTypes`/`effectTypes` are treated
as `[]`[^api-guide-addons].

`collectAddonAttribution(objectTypes, families)` concatenates object-type
attributions (in the given order) followed by family attributions (in the
given order) — the primitive the `C3Project` handle's own
`collectAddonAttribution()` wraps, reading and parsing every path returned
by `findAllObjectTypes()`/`findAllFamilies()` on each call (not
cached)[^claude-md][^api-guide-addons].

**Shipped shape differs from the original issue proposal.** Issue #44 item 4
originally proposed a single `behaviors[] {behaviorId, name}` field. The
shipped, ground-truth-confirmed shape (against real `construct3-chef-sample`
fixtures) is **two separate fields**: `behaviorTypes` — not `behaviors` —
with each entry carrying an optional numeric `sid`, and a distinct
`effectTypes` field for attached effects, whose entries carry no
`sid`[^api-guide-addons].

**What `collectAddonAttribution` deliberately does not cover.** A layout's
own top-level `effectTypes` and a layer's/sublayer's `effectTypes` are a
separate surface, exposed instead by `collectLayoutEffectIds` in
`src/references.ts` — see [Reference Integrity](/reference-integrity.md).
This is a sibling function, not a widening of `collectAddonAttribution`: a
layer is neither an object type nor a family, so covering it here would
violate `attributeObjectType`/`attributeFamily`'s documented contract of
deriving strictly from an item's own declared fields, and it would add
`"layout" | "layer"` to the exported `AddonAttribution.source` union — an
exhaustive-`switch` break for any existing consumer, i.e. a breaking
change[^api-guide-addons].

## `usedAddons` (manifest support)

```ts
interface C3UsedAddon {
  type: string;
  id: string;
  name: string;
  author: string;
  bundled: boolean;
  version?: string; // observed absent even when bundleAddons is true
  [k: string]: unknown;
}
```

`C3ProjectManifest` gains two optional top-level fields, `bundleAddons?:
boolean` and `usedAddons?: C3UsedAddon[]`. `getUsedAddons(manifest)` returns
`manifest.usedAddons`, or `[]` when the section is absent — the same
optional-section convention as the rest of the manifest model (see [Project
Manifest](/project-manifest.md))[^api-guide-addons].

`version` is genuinely optional: real exported projects omit it on
`usedAddons` entries **even when `bundleAddons` is `true`**. Do not assume
its presence when reading a real project[^claude-md][^api-guide-addons].

## Discovery: `findAllAddons`

`C3ADDON_EXTENSION = ".c3addon"`; `findAllAddons(dir)` recursively finds
every `.c3addon` package file under `dir`, filtering editor-local paths via
`isEditorLocalPath` and built on `find_all_files_path` — the same pattern as
`find_all_objectTypes_path` and the other named collectors (see [Layout
Traversal](/layout-traversal.md))[^api-guide-addons].

Unlike every other named collector, `findAllAddons` takes a **bare
directory**, not a project-derived path: there is **no canonical C3
subfolder** for addon-source storage (unlike `layouts/`, `objectTypes/`,
etc.)[^claude-md][^api-guide-addons]. The `C3Project` handle mirrors this by
scoping `findAllAddons(sub?)` from `project.root` itself — not a dedicated
`*Dir` field — with `sub` (default `""`) naming the subdirectory to search,
e.g. `project.findAllAddons("addons")`, returning `[]` when the target
directory does not exist[^api-guide-addons].

## Package reader: `readAddonPackage`

A `.c3addon` package ships as either an unpacked directory (as an addon
author works with it) or a zip archive — the `.c3addon` file itself, as C3
loads it. `readAddonPackage(source): AddonPackage` opens either form behind
one interface (`entryNames`/`hasEntry`/`readBytes`/`readText`/`readJson`),
auto-detecting the on-disk form via `statSync` and throwing if `source` does
not exist[^api-guide-addons].

This is c3source's **first runtime dependency**: zip mode unzips eagerly at
construction using **fflate** (`unzipSync`) — see [ADR
0013](/decisions/0013-fflate-dependency-c3addon-reader.md) for why
fflate was added rather than reading the archive some other way. Directory
mode reads entries lazily, top-level only — `addon.json`/`aces.json` are
always top-level, so nested zip-internal paths are out of
scope[^api-guide-addons].

Two domain-fact filename constants name the package's two entries, mirroring
`C3ADDON_EXTENSION`: `ADDON_MANIFEST_FILE = "addon.json"` (an addon's
metadata entry) and `ADDON_ACES_FILE = "aces.json"` (an addon's
ACE-definitions entry)[^api-guide-addons]. `readJson` throws `Error("invalid
<name>: …")` on parse failure, mirroring `parseProjectManifest`'s
error-prefix idiom[^api-guide-addons].

### BOM handling

Some `.c3addon` package entries carry a leading UTF-8 byte-order-mark
(observed on `aces.json`, not on `addon.json`, in real SDK samples), and a
raw `JSON.parse` rejects that leading byte[^claude-md][^api-guide-addons].

**This is not a C3 behaviour.** Addons are hand-written by a third-party
developer, so a BOM reflects whichever text editor that author used — it is
unpredictable per file and per addon, not a rule C3 itself imposes on
addon-package encoding[^claude-md]. That is why `readText`/`readJson` strip
it **unconditionally** (`UTF8_BOM = "﻿"`; `stripBom(text): string`,
which drops a single leading BOM character and is idempotent — a BOM-less
string passes through unchanged) rather than allowlisting known-BOM'd
entries[^claude-md][^api-guide-addons]. An allowlist would encode a fact
about specific files observed so far; unconditional stripping encodes the
actual cause (an unpredictable third-party authoring artifact) and so
covers every file, known or not.

## ACE model: `parseAcesModel` / `parseAddonMetadata`

Both parsers are **pure**: they take an already-parsed JSON value
(`unknown`), never a path. The value is expected to come from
`readAddonPackage(...).readJson(name)` (or an equivalent `JSON.parse` in
tests) — the I/O + zip layer and the parser layer are deliberately kept
separate, ADR 0013's "pre-read-JSON boundary"[^api-guide-addons].

`aces.json`'s top level is one key per **category** (object-class name, e.g.
`"custom"`), aside from an ignored `$schema` key; each category holds
optional `conditions`/`actions`/`expressions` arrays (absent treated as
`[]`, and a per-ACE `params` array is itself optional — e.g. `do-alert` has
none). `parseAcesModel(json)` flattens all categories into one `AcesModel`,
stamping each ACE's originating `category` and `kind`, and throws
`Error("invalid aces.json: …")` on shape violation[^api-guide-addons].
`parseAddonMetadata(json)` requires `type`/`id`/`name`/`version`/`author` as
strings, leaves `is-c3-addon`/`sdk-version` optional/lenient, and throws
`Error("invalid addon.json: …")` on shape violation[^api-guide-addons].

**Two domain facts to keep straight:**

- **Expressions are keyed by `expressionName`, not `id`.** `id` is the
  dash-cased ACE identifier (e.g. `"current-value"`); `expressionName` is
  the distinct PascalCase name used in event-sheet expressions (e.g.
  `"CurrentValue"`) — they need not share a stem[^api-guide-addons].
- **An ACE's identity is the pair `(kind, id)`, not `id` alone.** An action
  and a condition (or expression) may legally share the same
  `id`[^api-guide-addons].

`aceIdentity(kind, id)` builds the canonical `` `${kind}:${id}` `` identity
string. `findAce(model, kind, id)` resolves by that `(kind, id)` pair — note
expressions ARE matched by `id` here too, distinct from the lookup below.
`findExpression(model, expressionName)` resolves by `expressionName`
instead — reach for it when the caller has a name pulled from event-sheet
expression text (see [Event-Sheet Extraction — Expression
references](/event-sheet-extraction.md)), not an ACE `id`[^api-guide-addons].

## Ownership boundary

c3source ships the **declared ↔ used-in-source** edge —
`detectAddonReferenceIssues`, joining `usedAddons` against
`collectAddonAttribution` + `collectLayoutEffectIds` — described in
[Reference Integrity](/reference-integrity.md). The **`.c3addon`-package ↔
`usedAddons`** direction — does every declared addon resolve to an actual
installed package, and vice versa — stays construct3-chef's
(`addonValidator.ts`, `addonInventory.ts`); c3source has no opinion on where
addon packages are installed or how they are resolved at build
time[^api-guide-addons].

Real, BOM'd `addon.json`/`aces.json` fixtures come from the [Construct
Addon SDK](https://github.com/Scirra/Construct-Addon-SDK), vendored as the
`SDK/` git submodule; SDK-gated tests self-skip when it is absent or checked
out non-recursively, so CI must check out submodules recursively for that
coverage to actually run[^claude-md].

## Related

- [Reference Integrity](/reference-integrity.md) — the addon-undeclared/addon-unused detection built on this layer's attribution and discovery primitives.
- [Layout Traversal](/layout-traversal.md) — `find_all_files_path`, the walk `findAllAddons` is built on.
- [C3Project Handle](/c3project-handle.md) — the root-bound wrapper for `collectAddonAttribution`/`findAllAddons`.
- [Module Architecture](/module-architecture.md) — `addons`' position in the module DAG.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide-addons]: docs/api-guide-addons.md (c3source API guide, 2026-08-20 capture)
