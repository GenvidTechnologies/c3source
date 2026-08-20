---
type: decision-context
title: "ADR 0018 — *.brush.json is minified project source, not editor-local"
description: tilemapBrushes/**/*.brush.json is C3 project source in a second, minified serialization form, not an editor-local artifact; EDITOR_LOCAL_EXCLUSIONS is left unchanged and the knowledge is owned as a new domain fact, C3_MINIFIED_SOURCE_SUFFIXES / isMinifiedSourcePath, in src/serialize.ts.
tags: [adr, serialization, classification]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0018
    resource: ../../raw/adr-0018-brush-json-minified-source-not-editor-local-2026-08-20.md
    title: "ADR 0018 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0018 — *.brush.json is minified project source, not editor-local

**Status:** accepted
**Date:** 2026-07-29
**Issue:** #59

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0018]. Note per
this project's citation policy (`CLAUDE.md`, and see [Development
Workflow](/development-workflow.md)), the
`file:line` citations below are preserved exactly as originally written —
they state the situation at the ADR's date and are not refreshed on
migration.

## Context

`tilemapBrushes/**/*.brush.json` (the on-disk form of Construct 3's tilemap
brush data — four named brushes, `auto16`/`auto47`/`patch` types, hand-painted
tile-index matrices, weighted `{index, probability}` patches, no `sid`) is the
one file in the canonical `construct3-sample` corpus that fails
`serializeC3Json(JSON.parse(text)) === text` (ADR
[0016](/decisions/0016-c3-source-json-serialization-form.md), corrected corpus: 29 total,
3 editor-local, 26 source, 25 of those round-trip). #59 asked whether the fix is
to widen `EDITOR_LOCAL_EXCLUSIONS` (the ADR [0006](/decisions/0006-editor-local-classifier.md)
classifier) to also exclude it, or to record it as a second, minified
*project-source* form instead.

**A class of evidence considered during design was withdrawn and must not be
reintroduced.** The `construct3-sample` golden's git view is a **dead oracle in
both directions**: it has 56 tracked `ts-defs` files that c3source nonetheless
classifies editor-local (tracked ⇏ source), and its
`project/.gitignore`'s `ts-defs` entry is itself an upstream bug —
`construct3-chef` depends on those files being present despite it (declared ⇏
not-source). The golden's `README.md` coverage/exclusion lists carry the same
defect (they list `ts-defs/` too) and so are equally unusable as a source/not-source
signal. None of the golden's tracked/untracked/gitignore state is cited below as
evidence either way; the argument rests entirely on c3source's own code and on
directly-measured file contents/bytes.

## Decision

`tilemapBrushes/**/*.brush.json` is **C3 project source in a second serialization
form**, not editor-local. `EDITOR_LOCAL_EXCLUSIONS` is left **unchanged** — this
decision is a deliberate non-widening. The knowledge is owned as a new domain
fact in `src/serialize.ts`, the sole DAG leaf: `C3_MINIFIED_SOURCE_SUFFIXES`
(currently `[".brush.json"]`) and `isMinifiedSourcePath(name)` (detection only —
no minified writer, no `Brush` type/parser). It is a new ADR rather than an
amendment to an existing one because neither existing record is the right
owner: ADR 0016's subject is the *write form*; ADR 0006's is the *classifier
this decision explicitly declines to widen* — recording a non-expansion inside
0006's Decision would misread as a change to it.

**The classifier is a provenance predicate, not a form predicate.**
`src/layouts.ts:101` declares `EDITOR_LOCAL_EXCLUSIONS` as "the canonical set of
C3-editor-local artifacts that are NOT project source"; ADR 0006:19-20 calls
`isEditorLocalPath` the one canonical definition of "editor-local vs C3
source". Serialization form was never part of that criterion, so a minified
*byte form* is not, by itself, grounds to reclassify a file's provenance.

**The table's existing members are the *derivable* artifacts, not merely the
*unneeded* ones — and that distinction is the load-bearing one.** `uistate/`,
`*.uistate.json` (the editor rebuilds these on open), `ts-defs/`
(`src/layouts.ts:107` — "C3-generated TS typings"; `src/project.ts:212-215`
confirms `findAllScripts` excludes it precisely because every file there is a
generated `.d.ts`), and `tsconfig.json` (`src/layouts.ts:109` — "overwritten by
the editor") are all *derivable*: the editor (or its TypeScript codegen)
regenerates them from other state, so treating them as non-source costs
nothing even though a downstream tool (e.g. construct3-chef, which needs
`ts-defs` present to resolve symbols) may still care about their presence.
`*.brush.json` is not in that category. It would be the table's first
**irreducibly authored** member: nothing regenerates a hand-painted brush's
tile-index matrix from anything else in the project. "Derivable" is the
accurate criterion the existing table encodes — not "safely droppable" — and
brush files fail it.

**Provenance and serialization form are provably orthogonal, in both
directions.** Measured directly against C3 output (labelled samples of real
editor exports, not the golden's git metadata):

| | editor-local | project source |
|---|---|---|
| **minified** | `*.uistate.json` | `*.brush.json` |
| **tab-indented** | `uistate/*.instancesBar.json` | ordinary project `.json` |

All four cells are populated on real C3 output. Folding "is minified" into the
provenance predicate would therefore be wrong even in the one case (brush
files) where it happens to point at the right membership answer.

**Under the rejected alternative, a consumer following c3source's own
documented pattern loses the data outright — not merely miscategorizes it.**
`docs/api-guide.md`'s `listSourceEntries` idiom (`readdirSync(dir).filter((name)
=> !isEditorLocalPath(name))`, ~134-140) is the documented way to get source
entries. C3 also writes a byte-identical duplicate of each brush file's payload
into `objecttypes.uistate.json` under a `brushes` key — but that file is
*itself* classified editor-local by this same table (`.uistate.json` suffix,
`src/layouts.ts:108`). Verified directly: `isEditorLocalPath("objecttypes.uistate.json")`
→ `true`; `isEditorLocalPath("Tilemap.brush.json")` → `false`. Widening the
classifier to also exclude `*.brush.json` would make **both** copies
editor-local, leaving a `listSourceEntries`-style consumer with **no** copy of
non-derivable, hand-authored brush data.

**"Not declared in `project.c3proj`" is already not a source discriminator in
this codebase.** `images/` is equally manifest-invisible — absent from both
`C3_SECTION_FOLDERS` (`src/manifest.ts:373-381`) and `C3_ROOT_FILE_FOLDERS`
(`src/manifest.ts:402-410`) — yet it has its own domain fact (`IMAGES_FOLDER`,
`src/manifest.ts:417`) and its own manifest-ignoring detector,
`detectImageDrift`, which walks `objectTypes/` and `images/` directly
(`src/manifest.ts:966-981`). `tilemapBrushes/` is the same shape, down to
mirroring the object-type path (`objectTypes/tiles/Tilemap.json` ↔
`tilemapBrushes/objectTypes/tiles/Tilemap.brush.json`). This neutralizes the
strongest structural argument for the rejected fork (see Compromise).

**A prior deliberate decision exists, with written rationale, and no new
evidence has appeared to reverse it.** #59 itself records that T7
(`test/manifestSerialize.test.ts`, added in #57) "excludes the file by exact
path match, deliberately not by broadening the classifier, and asserts the
corpus counts so the exception cannot silently grow." The live test carries the
same continuity marker today ("#57 design, resolved #59").

## Compromise

**Fork A — widen `EDITOR_LOCAL_EXCLUSIONS`** (add `".brush.json"` to
`fileSuffixes`, or `"tilemapBrushes"` to `dirs`), as #59 originally proposed.
Its genuine strengths:

- The cheapest possible fix: one line in one table.
- `docs/design-patterns.md` and ADR 0006:31 both name that table as *the*
  extension mechanism ("add any new editor-local pattern to
  `EDITOR_LOCAL_EXCLUSIONS` so every site inherits it").
- Measured blast radius was small and localized: one count on one generic walk
  (a root `find_all_files_path` collecting 49 files instead of 48 on the
  canonical fixture); zero named collectors affected, zero drift-detection
  change, because `tilemapBrushes` is a key in neither `C3_SECTION_FOLDERS` nor
  `C3_ROOT_FILE_FOLDERS`.
- Its best argument: C3's own editor duplicates the brush payload into
  `objecttypes.uistate.json` as a verbatim embedded string — i.e. the editor
  itself keeps a copy of brush data alongside other editor-local state; brushes
  are arguably a tilemap-*bar* authoring aid; and unlike every other
  project-source `.json` file, no brush file is referenced anywhere in
  `project.c3proj`.

**Why it was rejected.** The duplication argument runs the wrong way to
support Fork A's conclusion: the `objecttypes.uistate.json` copy is an *opaque
embedded string* (the shape of a cache, not a model) and it is itself
editor-local per the same table, so widening the classifier would strand a
`listSourceEntries`-style consumer with neither copy of the data. The two axes
— provenance and serialization form — are provably orthogonal (see Decision),
so a form observation cannot be folded into a provenance table without also
misclassifying the other three quadrants it happens to get right by
coincidence. And manifest-invisibility is already not a discriminator in this
codebase, per the `images/` precedent.

Also note: the `.dirs` variant (`"tilemapBrushes"`) is **not** equivalent to
the `.fileSuffixes` variant (`".brush.json"`), though #59 offered them as
interchangeable alternatives. `.dirs` hides the *entire* `tilemapBrushes/` tree
— including any future non-`.brush.json` entry C3 might add there — a strictly
larger footprint than excluding by suffix.

## Consequences

- Pure addition → **minor** version bump (1.8.0 → 1.9.0 per `package.json`);
  the release itself is a separate, out-of-scope workflow.
- `serialize` remains the sole DAG leaf: `isMinifiedSourcePath` consumes only
  its own module-local table, with no import in either direction between
  `serialize.ts` and `layouts.ts`. `src/c3source.ts`'s `export * from
  "./serialize.js"` needed no change.
- Amends ADR 0016's Decision (the "explicit non-goal" is scoped to the
  editor-local minified form specifically, not `*.brush.json`) and Consequences
  (the brush exception is now resolved here, not an open follow-up), and adds
  one Consequences bullet to ADR 0006 (the classifier is provenance-only) —
  neither ADR's Decision/Compromise changes.
- **Version pin divergence, noted honestly.** The `.brush.json` minified form
  was observed on C3 **r495** (`savedWithRelease: 49500`); r487, the release
  ADR 0006/0008's facts are pinned to, is unverified for this specific form.
- **Corpus tripwire.** T7 (`test/manifestSerialize.test.ts`) now proves the
  fact bidirectionally: every kept file `isMinifiedSourcePath` claims must be
  byte-exact minified JSON, and every discovered non-round-tripping file must
  satisfy `isMinifiedSourcePath`. A future fixture-pin bump that introduces a
  second minified file fails this test with that file's path named in the
  failure message, rather than silently passing or silently growing the
  exception list.
- **Residual risks, recorded rather than hidden:**
  - The positive class is **n=1** — exactly one `.brush.json` file exists in
    the corpus today. Whether other brush shapes, other entries under
    `tilemapBrushes/`, or multi-tilemap projects yield additional minified
    files is unverified; T7's discovery-based (not pre-declared) assertion is
    the safety net if one appears.
  - Nobody has run the editor experiment of deleting `tilemapBrushes/` and
    reopening the project to see whether C3 reconstructs the brush from the
    `objecttypes.uistate.json` copy. This decision deliberately does not
    depend on the answer — regenerating from another *editor-local* file is
    not the same as regenerating from *source* — but the falsifier is worth
    stating: if C3 were ever shown to reconstruct brush data from a
    manifest-declared source file (not from editor-local state), argument
    two above would need revisiting.
  - `test/fixtures/canonical-overlay/`'s `*.uistate.json` and
    `*.instancesBar.json` files are **c3source-authored stubs, not real C3
    bytes** (the overlay's `instancesBar` file is 66 bytes with a trailing
    newline, versus C3's real 224-byte tab-indented output) — a future editor
    must not measure a serialization-form claim against the overlay.

**A class of evidence was withdrawn during design and must not be
reintroduced:** the golden's git view is unreliable in both directions — 56
tracked `ts-defs` files that c3source classifies editor-local, and
`.gitignore:3`'s `ts-defs` entry is an upstream bug that construct3-chef
depends on the files despite. Neither direction is evidence for or against
`*.brush.json`'s classification.

**2026-08-03 (#63): withdrawn citation.** The Decision section's parenthetical
— "`src/project.ts:212-215` confirms `findAllScripts` excludes it precisely
because every file there is a generated `.d.ts`" — is **retracted**. That
comment does not say that and never did: `dc416bc` (#21, 2026-06-02) added
`"ts-defs"` to `EDITOR_LOCAL_EXCLUSIONS.dirs`, and `6f3fec0` (#36, 2026-06-17,
15 days later, with `dc416bc` as its ancestor) then wrote the current
`findAllScripts` doc comment — which says the tree is excluded by the
*directory prune*, not by identifying every entry as a generated `.d.ts`. The
citation was false when written. **The conclusion it was cited for is
unaffected:** `ts-defs/*.d.ts` files remain genuinely derivable, resting on
`src/layouts.ts:107` ("C3-generated TS typings") and on C3's own TypeScript
codegen behavior — not on anything `src/project.ts` says. Treat the Decision
section's `src/project.ts:212-215` citation as withdrawn in favor of
`src/layouts.ts:107` alone; the Decision section's text is left unedited here
per this ADR's own correction convention (cf. ADR 0016's dated inline note).

**2026-08-03 (#63): the upstream `ts-defs` gitignore bug is historical, not
current.** The Context and the preceding paragraph above describe the golden's
`project/.gitignore` `ts-defs` entry as a live upstream bug. That was accurate
when this ADR was written (2026-07-29) but was fixed the same day, upstream,
in `construct3-sample` commit `c68c2e3` ("fix: stop gitignoring the ts-defs
tree in project/ (#3)") — the commit currently pinned as the `construct3-sample`
submodule HEAD. The `.gitignore` now carries an explicit "do not re-add it"
note, and all 56 `ts-defs` files are tracked and reach `test/fixtures/canonical/`
via the plain byte copy. **This does not reopen the withdrawn-evidence
instruction above or in the Context:** the golden's tracked/gitignored state
was, is, and remains inadmissible as evidence for a source/not-source
classification call in this codebase — only the factual status of that one
specific upstream bug (now fixed) has changed.

## Related

- [ADR 0006 — Single canonical editor-local classifier](/decisions/0006-editor-local-classifier.md) — the classifier this decision deliberately declines to widen; provenance axis of the three-axis frame ([ADR 0025](/decisions/0025-section-item-hood-and-stray-files.md)).
- [ADR 0016 — c3source owns the C3 source-JSON write form](/decisions/0016-c3-source-json-serialization-form.md) — this ADR resolves 0016's one documented round-trip exception and amends its Consequences.
- [ADR 0020 — Editor-local classification does not imply walk unreachability](/decisions/0020-caller-controlled-walk-descent.md) — a sibling non-change ADR for the same table, on the reachability axis.
- [ADR 0025 — Section item-hood and stray files](/decisions/0025-section-item-hood-and-stray-files.md) — names the explicit three-axis frame (provenance / reachability / item-hood) this ADR's provenance axis belongs to.
- [Layout Traversal](/layout-traversal.md) — the current state of the provenance/reachability/item-hood classification surface.
- [Serialization Form](/serialization-form.md) — the current state of the minified-source exception this ADR establishes.

[^adr-0018]: ADR 0018 (docs/decisions capture, 2026-08-20)
