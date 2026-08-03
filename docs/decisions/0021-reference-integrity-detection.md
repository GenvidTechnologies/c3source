# 0021. Reference integrity as a separate module, not an extension of drift detection

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #60

## Context

`project.c3proj` and the project's source files form a web of **name-keyed**
cross-references — every cross-file reference in C3 source is by name, not
`sid`. c3source validated manifest *shape* (`validateProjectManifest`) and
*membership* against disk filenames (`detectManifestDrift`), but with one
narrow exception — `detectContainerDrift`'s `dangling-ref` for container
members — it never checked whether a reference **resolves**. Since #57
c3source owns the manifest write path, so it can now *introduce* these
breakages, not merely observe them. That raises the stakes on detection.

The issue was **reframed** before this work: it was originally filed as a
field-presence rule table (a `project.c3proj` analogue of
`validateForEditor`/`EDITOR_FIELD_RULES`, #33) and declared itself blocked on
observing C3 editor loader rejections. That framing was wrong — c3source owns
the write path and `validateProjectManifest` already gates shape, so such a
table would mostly restate it. The failure modes that matter are referential,
and those are **internal-consistency** checks derivable from the project's own
data, needing no editor observation. Recording this saves a future reader
re-deriving it from the issue history.

## Decision

A new `src/references.ts` module, forming a new DAG tier:
`serialize` ← `layouts` ← `{eventSheets, addons, manifest}` ← **`references`** ← `project`.

Five issue kinds (`addon-undeclared`, `addon-unused`, `family-member-missing`,
`instance-type-missing`, `event-class-unresolved`) reported through its own
`ReferenceIssue` type, not `DriftEntry`. Four **pure** detectors
(`detectAddonReferenceIssues`, `detectFamilyMemberIssues`,
`detectInstanceTypeIssues`, `detectEventClassIssues` — no I/O) plus one I/O
orchestrator (`detectReferenceIntegrity`) plus a `C3Project` handle method
(`detectReferenceIntegrity`, delegating with the cached manifest).
`detectManifestDrift` is **untouched**.

## Compromise

**1. Why not extend the drift engine.** Three independent reasons, all
decisive:

- `DriftEntry`'s `manifestPath`/`diskPath` are *manifest-subfolder /
  disk-subfolder* segment arrays. R6 (`instance-type-missing`) needs an
  **intra-file** locator (`layers[2].subLayers[0].subLayers[0].instances[0]`)
  and R7 (`event-class-unresolved`) needs `visitEvents`' `jsonPath`.
  `detectContainerDrift`'s synthetic `[`#${i}`]` container-index segment is
  already a stretch of that field; four more kinds would entrench a type lie
  no consumer could distinguish from real subfolder segments.
- Adding members to the exported `DriftKind` union **breaks any consumer with
  an exhaustive `switch`** — a major bump for a purely additive feature. This
  design stays **minor**.
- **Measured cost:** on a real 2,004-file project, parsing all source JSON
  takes **278 ms**, where `detectManifestDrift` already takes **707 ms**.
  Folding it in would have made every existing drift call ~40% slower,
  silently.

**2. Why a new DAG tier rather than `manifest` importing `addons`.** The addon
check needs `collectAddonAttribution` (in `addons`) and `getUsedAddons` (in
`manifest`); `manifest` does not import `addons`. Importing it would invert
the documented sibling tiering ([ADR 0012](0012-per-area-module-split.md))
**and** make `addons` — which carries the `fflate` runtime dependency ([ADR
0013](0013-fflate-dependency-c3addon-reader.md)) — reachable from the
manifest dependency path. A `project.ts`-only placement (no new module) was
also rejected: it breaks the free-function-vs-handle convention (every
existing handle method wraps an exported free function) and, decisively,
**destroys parameterized testability** — without exported free functions
taking `SourceDoc` arrays, every negative case would need a temp project on
disk instead of an in-memory clone.

**3. Why `collectAddonAttribution` was supplemented, not widened.**
`collectLayoutEffectIds` (in `references.ts`) is a sibling function, not an
addition to `collectAddonAttribution`. Widening `collectAddonAttribution`
would add `"layout" | "layer"` to its exported `AddonAttribution.source`
union — the same exhaustive-`switch` break — and violates its documented
contract of deriving from an item's **own declared fields** (a layer is
neither an object type nor a family). With the number: on a real project,
covering the layer/layout effect surface took false positives from **2 → 0**.
Note it cuts both ways — an undeclared layer effect is a real load failure
that is now detected, not merely a false-positive fix.

**4. The corpus evidence for `C3_PSEUDO_OBJECT_CLASSES`.** The canonical
fixture yields only `{"System"}`. Scanning 16 real projects found
`"Functions"` occurring **212 times in a single project** (ACE ids
`set-function-return-value`, `map-function`, `map-function-default`,
`call-mapped-function`), with zero other unresolved values across ~30k ACEs.
**Shipping the fixture-derived table would have produced 212 false positives
on that project alone.** This is the standing argument for keeping
`scripts/scan-references.mjs` and re-running it on every C3 version bump —
stated explicitly here because the fixture *demonstrably cannot* validate
this table.

**5. Severity semantics.** `event-class-unresolved` and `addon-unused` are
`warning`; the other three kinds are `error`. The event-class kind is named
*unresolved* rather than *missing* because the detector genuinely cannot
distinguish "deleted object type" (a load breaker) from "a pseudo-class this
table doesn't yet know about" (harmless, given point 4) — naming that
honestly beats a confident wrong label.

**6. The error-policy divergence from `detectImageDrift`.**
`detectManifestDrift` wraps its call to `detectImageDrift` in try/catch so a
throw degrades to an omitted section — image drift is a best-effort
*addition* to a result the caller wanted anyway. `detectReferenceIntegrity`
deliberately does **not** catch: reference integrity **is** the request, so
silently returning `{ok: true, issues: []}` for a project with an unparseable
layout would be a false clean bill of health.

## Consequences

- Semver **minor** (1.8.0 → 1.9.0); the bump is a separate release commit.
- **Unvalidated assumption, recorded honestly:** `NON_ATTRIBUTABLE_ADDON_TYPES
  = ["theme"]` is derived from `C3UsedAddon`'s JSDoc and was **never
  observed** across the 16-project scan (only `plugin`/`behavior`/`effect`
  were seen). The failure mode is benign either way — it only *suppresses* an
  `addon-unused` warning, so being wrong costs a missed warning, not a false
  alarm.
- **`C3_PSEUDO_OBJECT_CLASSES` is empirically grounded but not provably
  complete.** Three mitigations, in order: the table itself (a one-line
  c3source change to extend), `ReferenceIntegrityOptions.pseudoObjectClasses`
  (a downstream consumer unblocks itself without waiting for a release), and
  the `warning` severity (point 5).
- **Residual risk / adjacent scope deliberately excluded**, so a later author
  doesn't assume it was missed:
  - `Layout.eventSheet` and `IncludeEvent.includeSheet` (event-sheet name
    references) are not checked.
  - A future `LAYOUT_REFERENCE_ACES` table for System ACEs naming a layout is
    not implemented — `go-to-layout` carries a **bare** `parameters.layout`,
    `go-to-layout-by-name` a quoted expression, so the two need different
    handling.
  - `Condition/Action.behaviorType` is not checked — and **must not** be
    checked naively: the canonical fixture has `{"objectClass":"Text",
    "behaviorType":"Timer"}` where object type `Text` has **no** behaviors of
    its own, because `Timer` is inherited through family `TextFamily`. A
    naive object-type-only lookup would false-positive.
  - The `.c3addon`-package ↔ `usedAddons` direction stays
    **construct3-chef's** (`addonValidator.ts`, `addonInventory.ts`'s
    four-state model). c3source ships the missing third edge — declared ↔
    used-in-source. This ownership boundary is stated explicitly so it isn't
    mistaken for a gap.
- Zero existing tests required modification; `detectManifestDrift` and
  `collectAddonAttribution` keep their exact shapes.
