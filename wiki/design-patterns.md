---
type: reference
title: Design Patterns
description: Reusable engineering patterns c3source has settled on — single-source counters, thin traversal wrappers, traversal-vs-rendering splits, path-bearing drift diffing, collect-then-throw-first validation, evidence-bearing audit tooling, and a real-export-ground-truth testing strategy — each kept with its motivating problem and trade-off.
tags: [design-patterns, traversal, validation, testing, drift]
status: stable
stale_after: 2027-08-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: docs-design-patterns
    resource: ../raw/docs-design-patterns-2026-08-20.md
    title: "docs/design-patterns.md (c3source design patterns, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Design Patterns

Conventions and reusable patterns specific to `c3source`, synthesized from
`docs/design-patterns.md`[^docs-design-patterns]. For the high-level
architecture and functional-area breakdown, see [Module
Architecture](/module-architecture.md), [Layout
Traversal](/layout-traversal.md), and [Event-Sheet
Extraction](/event-sheet-extraction.md).

## Single-source event numbering

**Problem.** C3 assigns each "counting" event (group / block /
function-block / custom-ace-block — **not** variable / comment / include) a
1-based, depth-first, pre-order number. That number is what the C3 editor
shows and what `generateFunctionName` bakes into generated script names, so
anything that reports event coordinates **must** agree with it. A second,
independently-implemented counter would drift the moment the numbering rule
changed in one place and not the other.

**Shape.** Exactly one walk owns this counter: `visitEvents`, which exposes
each event's number via `EventVisitContext.eventNumber` (`null` for
non-counting events). Consumers that also need the number —
`extractScriptsFromSheet` — run `visitEvents` once to build a
`Map<EventSheetEvent, number>` keyed by object reference, then read each
event's number from the map during their own traversal. Map-by-reference is
safe because every parsed event is a distinct object.

**Trade-off.** The payoff is that `eventNumber`, `eventIndex`, and
`generateFunctionName` cannot drift, because the numbering rule
(`isCountingEvent` + pre-order descent) lives in one place — at the cost of
a second pass over the tree (build the map, then traverse again) rather
than computing the number inline during a single walk. This is pinned by
two test sets any counter refactor must keep green: the `visitEvents` ↔
`extractScriptsFromSheet` agreement test (`test/eventCounter.test.ts`,
asserting `eventNumber` equals `eventIndex` for every counting event on a
multi-group/nested fixture, plus absolute values like `Outer=1, Inner=2`),
and the original extraction tests fixing exact event/scope coordinates.

## One traversal, everything else is a thin consumer

**Problem.** A recursive tree walk (layers, files) is easy to reimplement
slightly differently at each call site — different early-exit behaviour,
different mutation accounting, different depth limits — and each variant is
a place the walk's own invariants (skip rules, ordering, depth) can drift.

**Shape.** The layer walk has a single recursive implementation, the
internal `walkLayerEntries` generator, yielding a `LayerEntry` per layer
(bare `name`, dotted/global-resetting `fullName`, root-first `ancestors`
chain, `parent` sibling array, `index`). Every public walker/finder is a
thin consumer: `visitLayers`/`visitLayout`/`visitInstances` iterate it and
**sum the `LayerVisitor` mutation count** with no early exit;
`findLayerEntry`/`findLayer`/`findLayerByName`/`findLayerEntryInLayout`
iterate it and **stop on the first predicate hit** (the generator halts
when the consumer `return`s). The file-based `visit_*_in_layouts` wrap the
visitors — read → parse → call the in-memory visitor → **write only when
the summed mutation count is > 0**.

**Trade-off.** The "write-if-changed" rule stays in the file wrapper, never
in the in-memory visitor — keeping the in-memory/file-I/O boundary crisp
means every new traversal behaviour is added to `walkLayerEntries` (or a
thin consumer of it), never re-implemented, at the cost of every consumer
paying for the full recursive descent even when it only needs an early
exit (mitigated by the finder family's `return`-based short-circuit). The
walk is **fully recursive** through `subLayers` — an earlier version
descended only one level, a real gap this pattern's single-source-of-truth
property closed once and for all.

## One file-walker, one item-hood collector, seven finders

**Problem.** Before this was unified, two of seven name-section finders
(`find_all_layouts_path`, `find_all_objectTypes_path`) returned every
non-editor-local file regardless of extension — a split inherited from
three independently hand-written functions rather than any design
decision, and undetected until an audit surfaced it (see [ADR
0025](/decisions/0025-section-item-hood-and-stray-files.md)).

**Shape.** `find_all_files_path(dir, predicate, descend?)` is the single
recursive walk every on-disk collector is built on — it owns the recursion,
the `uistate/` skip (C3 r487+ writes editor UI state there, and its
non-source `.json` would crash the parsers), and per-level
`readdirSync().sort()` ordering. `find_all_section_items_path(dir)` is the
single owner of the name-section item policy
(`isSectionItemName(file) && !isEditorLocalPath(file)`) built on that walk;
all seven name-section finders are thin consumers — three are one-line
wrapper functions, four pass `find_all_section_items_path` directly as
their underlying finder with no separate per-section free function at all.

**Trade-off.** Centralizing the policy means the `.json` extension check
cannot drift between sections again, at the cost of one more layer of
indirection to read through when tracing a specific finder's behaviour.
Duplicating the recursion, the `uistate/`/`.uistate.json` skip, or the
`.json` check is exactly how a self-recursion bug once slipped in
(`find_all_objectTypes_path` recursing via the layouts collector) and how
the item-hood divergence above went unnoticed for as long as it did — the
pattern exists specifically because ad hoc reimplementation had already
failed once.

## One canonical editor-local filter

**Problem.** Before extraction (issue #19), the editor-local skip logic was
inlined at four sites — the `uistate/` directory guard in
`find_all_files_path` and the `.uistate.json` suffix checks in the three
named collectors. A downstream tool re-deriving the skip rule from the
collector source could easily miss the directory form, silently including
`uistate/` children in its walk.

**Shape.** `isEditorLocalPath(name): boolean` is the single definition of
"editor-local artifact vs C3 source," checking the directory form
(`EDITOR_LOCAL_EXCLUSIONS.dirs`), the file-suffix form (`.fileSuffixes`),
and the exact-name form (`.exactNames`, for a generated file the editor
overwrites on every save rather than a whole directory or suffix pattern).
All four original sites now call it; any future addition to C3's
editor-local convention is a one-line change to the table.

**Two orthogonal axes deliberately kept separate.** This classifier answers
**provenance** only — is a file C3 source or editor-local scratch state? —
not **serialization form**: `isMinifiedSourcePath` (see [Serialization
Form](/serialization-form.md)) is the sibling pattern for that axis, a
domain-fact table of project-source files that happen to be minified. Nor
does it answer **reachability**: `find_all_files_path`'s optional third
`descend` parameter defaults to the same classification rule but lets a
caller opt a specific subtree (e.g. `scripts/ts-defs/`) back into
reachability without touching `EDITOR_LOCAL_EXCLUSIONS` — the *default*
descent still derives from the table, and an override composes with
`isEditorLocalPath` rather than replacing it (see [ADR
0020](/decisions/0020-caller-controlled-walk-descent.md)).

**Trade-off.** Splitting provenance, form, and reachability into three
tables/parameters rather than one wider classifier costs a caller three
concepts to learn instead of one — but conflating them was the actual
failure mode ADR 0020 exists to correct: narrowing the single table would
have made `ts-defs/` permanently unreachable for a legitimate consumer need.

## Traversal-vs-rendering split (SIDs, and again for event sheets)

**Problem.** Coupling a tree walk to a specific output format forces every
new consumer through that one baked-in shape, even when they need a
structurally identical traversal with a different result.

**Shape.** `walkSids(node, visit)` is the exported primitive for SID
discovery; `formatSidPath(segments)` is its paired renderer — the traversal
is separated from what the caller does with each result.
`collectSids`/`collectSidsWithPaths` are thin consumers that call
`walkSids` once and accumulate; a caller needing a different output shape
(e.g. a semantic root label instead of the empty-string root) drives
`walkSids` directly rather than post-processing the thin consumers' output.

The same split recurs in `src/eventSheets.ts`: `visitEvents` is the
canonical walk (it owns the C3 event-numbering counter);
`extractScriptsFromSheet`, `walkScriptActions`, `extractFunctions`, and
`extractIncludes` are thin consumers returning structured records, not
text; `formatAction`/`formatCondition` are the paired renderers, turning
one already-held node into a line of DSL text without walking anything.

**Trade-off.** The split is what makes the extractors reusable across
differently-shaped consumers — construct3-chef calls
`extractScriptsFromSheet` for extracted TypeScript and separately calls
`formatAction`/`formatCondition` to write its own `.dsl.txt` output, while
c3source itself writes no `.dsl.txt` at all. The cost is a filtering
predicate's two sides can diverge in consequence: `isScriptAction` narrows
extraction (a rejected node is silently **dropped**), while
`formatAction` still **renders** every shape it's given, falling back to
`[unknown action: …]` — same predicate, opposite behaviour on each side,
worth checking both whenever a dual-use predicate changes.

## Path-bearing drift via name→path map diffing

**Problem.** Detecting manifest-vs-disk drift for name-folder sections
(layouts, objectTypes, eventSheets, families) needs to distinguish a
genuine add/remove from a same-item relocation — and doing that correctly
depends on an invariant that must hold, not be assumed: **leaf names are
unique within each section** (a C3 guarantee — no two layouts share a name,
and so on within each category).

**Shape.** `walkManifestNameTree(folder)` and `walkDiskNameTree(dir)` each
return `Array<{name, path}>`, where `path` is the chain of ancestor
subfolder names. `diffNameMaps(manifestItems, diskItems)` converts each
list into a `Map<name, path>` and computes three outcomes: manifest-only →
`missing`, disk-only → `untracked`, same name/different path → `moved`. The
`moved` case exploits name uniqueness directly — a sync tool can apply it
as a relocation rather than delete+add, because there is no ambiguity about
which manifest entry matches which disk file. Folder-level drift is diffed
separately (`folder-missing`/`folder-untracked`) and merged in, sorted
deterministically by kind then name. `formatManifestPath(segments)` renders
a path array for display, kept separate from the raw segments for the same
reason `walkSids`/`formatSidPath` are — the traversal should not dictate
the rendering.

**Trade-off.** This only works because of the name-uniqueness invariant; a
C3 domain that ever permitted duplicate leaf names within a section would
break the `moved` inference silently (a two-item swap could misreport as
one `moved` and mask a real delete+add). The pattern is sound specifically
because it leans on a guarantee c3source did not have to invent.

## Declared-subfolder recursion for file-folder walks

**Problem.** C3 writes generated subtrees under file-folder sections (e.g.
`scripts/ts-defs/`) that the manifest never declares. A naive recursive
disk walk would see them and report them as drift; excluding them one at a
time as they're discovered is a losing, ever-growing exclusion list.

**Shape.** `detectManifestDrift` uses two different walk strategies for its
two manifest section types, unified by one invariant: **walk depth must
match what the manifest can declare.** Name-folder sections recurse fully
(`walkDiskNameTree`) — C3 writes `<Name>.json` at arbitrary subfolder depth
there, so both sides must descend fully to avoid missing an item.
File-folder sections recurse **only into subdirectories whose name matches
a declared subfolder** in the manifest (`walkDiskFileTree(dir,
folder.subfolders)`) — undeclared subdirectories are never entered.

**Trade-off.** The practical effect is that adding a new C3-generated
subtree under `scripts/` (or `icons/`, etc.) never breaks drift detection —
the walk simply does not descend there, with no exclusion entry needed per
subtree. The cost is symmetry discipline: `walkManifestFileTree` and
`walkDiskFileTree` must recurse into the *same* declared subfolders on each
side, or the invariant silently breaks; if C3 ever introduces file-folder
nesting in a new release, updating `C3FileFolder.subfolders` in the
manifest model is sufficient because both walk functions already handle
the recursive case — but forgetting to keep them symmetric would reintroduce
exactly the drift-noise problem this pattern exists to prevent.

## Collect-then-throw-first

**Problem.** A validator that throws on the first violation it finds is
useless for a caller that wants a full report — but rewriting every
`assert`-style check twice (once collecting, once throwing) risks the two
copies drifting on which violation counts as "first."

**Shape.** Two independent validators share the same shape: a private
recursive rule walk collects every violation into a flat list and never
throws or short-circuits, so a detection-only caller gets *every* issue.
`EDITOR_FIELD_RULES`/`validateForEditor` (see [ADR
0009](/decisions/0009-editor-strict-validation.md)) is
detection-only today with no throwing sibling. `collectManifestIssues`/
`validateProjectManifest` (see [ADR
0017](/decisions/0017-tolerant-manifest-read.md)) goes further: the
same collector backs **both** a strict, throwing entry point
(`parseProjectManifest`, which throws `issues[0]`) and a tolerant one
(`parseProjectManifestTolerant`, which returns all of `issues`) — neither
can drift from the other because there is only one collector deciding what
counts as a violation.

**Trade-off — the emission-order invariant.** Because the strict path
throws `issues[0]`, the collector's walk order is **load-bearing, not
incidental**: `issues[0]` must always be the *same* violation a
pre-refactor sequential `assert*`-style check would have thrown first, for
every input, not just the pinned test cases. Concretely: top-level shape →
top-level fields in declaration order → each section in table order → each
node's own fields in a fixed order, with a folder/entry's own `name`
checked **last** (after its `items`/`subfolders`), matching the old assert
order. This is easy to "tidy" — e.g. checking `name` first because it reads
naturally at the top of the node — which would silently change which
message a doubly-malformed input reports, without failing any test that
only checks `issues.length` or a single-violation fixture. Adding a new
rule means inserting it in the position that preserves the existing
first-violation-for-every-input behaviour, proven by a message-regex test
suite passing unedited and an exactly-empty `scripts/api-surface.mjs` diff
if the change is meant to be a pure internal refactor (see [Module
Architecture](/module-architecture.md) for the API-surface verification
tool and its JSDoc caveat).

## Evidence-bearing verdicts in audit tooling

**Problem.** Any tool that reports "clean" must make it **impossible to
confuse *checked and clean* with *never checked***. A verdict printed with
no observation count reads identically whether it examined a thousand
files or zero.

**Shape.** `scripts/scan-domain-facts.mjs` (issue #68) enforces this two
ways: every verdict line carries its own observation count (`-> NO
CONTRADICTIONS (2 file(s) … observed, all single-line)`, never a bare `NO
CONTRADICTIONS`), and zero observations prints `NOT EXERCISED`, never a
pass — the probe still emits its line (silence would read as "not run"),
but a verdict is structurally unavailable when nothing was seen.

**This is not hypothetical.** The `minified` probe once shipped printing
`NO CONTRADICTIONS` having scanned **zero** `.brush.json` files, because
brush files live under a top-level `tilemapBrushes/` folder in none of the
section tables the walk derives from — the conclusion was true and
worthless. A blind spot in the *input* had become a confident claim in the
*output*, exactly the failure this pattern exists to prevent. See [C3
Domain Facts](/c3-domain-facts.md) for the fuller convention this pattern
belongs to, including the companion rule that no probe concludes a table is
correct — only a human, reading odd-looking evidence, produces the verdict.

**Trade-off.** The same shape recurs one layer out in the testing
strategy below: there, a silently-skipped suite reports "0 failing"; here,
an unexercised probe reports "no gaps." Both are absence of evidence
rendered as evidence of absence, and both cost extra plumbing (an
observation counter here, a fixture-gate skip/throw split there) purely to
keep that confusion structurally impossible rather than merely unlikely.

## Testing: real-export ground truth + inline legibility

**Problem.** Schema-fidelity facts ("which fields does C3 actually write?")
can't be verified against invented test data — only a real,
editor-round-tripped export proves what C3 itself produces. But a fixture
that is *itself* real C3 output brings real C3 output's baggage: generated
code, gitignored editor-local content, and a shape that moves as the golden
project is enriched.

**Shape.** Since issue #54 the golden is the tag-pinned `construct3-sample`
submodule (see [Canonical Reference Fixture](/canonical-fixture.md) for the
materialization, overlay, and version-history detail), reached through
`test/fixtureHelpers.ts`'s single `PROJECT_FIXTURE` constant. Guard schema
drift with a **key-parity test** — asserting a generated structure's key
set equals a real export's (`makeDefaultLayer.test.ts`) — which catches C3
adding/removing fields without pinning brittle values.

**Hazards that come with an enriched, real fixture:**

- **Generated code in the fixture breaks the gate.** A real export includes
  C3-generated TypeScript (`scripts/*.ts`, `tsconfig.json`, a
  `ts-defs/**/*.d.ts` tree using `var`/`Function`) that would fail ESLint/`tsc`
  if scanned — `test/fixtures/` is therefore excluded from both. Fixtures
  are test *data*, never linted or typechecked.
- **The self-skip pattern has an inverse hazard.** A mis-pathed gate, a
  renamed golden file, or an absent materialized fixture silently *skips*
  gated tests instead of failing — visible only in the **pending count**.
  Gate completeness matters too: `this.skip()` in a `before` hook skips
  every `it()` in that `describe`, so a `describe` reading the fixture
  inline in its `it()`s with no `before()` gate is a real gap (issue #54
  had to add gates to four such describes).
- **Fixture images must be real, not faked.** Image-drift tests key only on
  *filenames*, so a placeholder whose bytes don't match its declared
  extension/`fileType` (a PNG renamed to `.jpg`) passes the suite yet is no
  longer a loadable C3 export. Exercising a non-PNG format requires a
  genuinely-exported object with real bytes and matching `width`/`height`,
  even at the cost of manifest-membership churn — fidelity beats minimizing
  churn, a lesson learned from a #29 regression where a renamed-PNG fixture
  passed every test but corrupted the export.

**A second trade-off, for externally-sourced fixtures absent in some
checkouts** (a git submodule, any gitignored/optional slice): split
coverage into an **always-on tier** against a small hand-authored fixture
committed in-repo, exercising core behaviour unconditionally, plus a
**supplementary tier** gated on the external fixture for real-world
fidelity. Without the always-on tier, a CI checkout that omits the source
turns the *only* tests for a feature into a silent no-op — "0 failing"
while nothing ran. The presence gate must check a **specific file inside**
the source, not just the directory — a non-recursive submodule checkout
leaves the directory present-but-empty, so a bare `existsSync` false-positives
and the gated tests then *fail* instead of skipping.

Assertions whose expected values must stay legible — above all the
event-counter agreement test — use **small inline fixtures** where the
expected numbers are obvious (`Outer=1, Inner=2, …`), not a large real
sheet where "why is this event #47?" is opaque. This is the inverse
trade-off from the real-export fixture above: ground-truth fidelity for
schema facts, legibility for numeric/ordering invariants — the same test
suite deliberately uses both, for different kinds of claim.

## Related

- [Layout Traversal](/layout-traversal.md) — `find_all_files_path`, `isEditorLocalPath`, and `walkLayerEntries`, the primitives several patterns above are built on.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — `visitEvents`, the single-source event-numbering walk, and the SID/extractor traversal-vs-rendering splits.
- [Project Manifest](/project-manifest.md) — `detectManifestDrift`, `collectManifestIssues`, and the strict/tolerant manifest read pair.
- [Canonical Reference Fixture](/canonical-fixture.md) — the real-export ground-truth fixture and its gating story in full.
- [C3 Domain Facts](/c3-domain-facts.md) — the evidence-bearing-verdict convention for audit tooling.

[^docs-design-patterns]: docs/design-patterns.md (c3source design patterns, 2026-08-20 capture)
