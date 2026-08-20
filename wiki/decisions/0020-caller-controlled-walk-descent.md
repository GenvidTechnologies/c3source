---
type: decision-context
title: "ADR 0020 — Editor-local classification does not imply walk unreachability"
description: EDITOR_LOCAL_EXCLUSIONS and isEditorLocalPath are left unchanged; find_all_files_path gains a caller-controlled, defaulted descend parameter so a consumer can enter an otherwise-pruned directory like ts-defs/ without widening what counts as C3 source.
tags: [adr, traversal, layout-traversal]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0020
    resource: ../../raw/adr-0020-caller-controlled-walk-descent-2026-08-20.md
    title: "ADR 0020 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0020 — Editor-local classification does not imply walk unreachability

**Status:** accepted
**Date:** 2026-08-03
**Issue:** #63

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0020]. Note per
this project's citation policy (`CLAUDE.md`, and see [Development
Workflow](/development-workflow.md)), the
`file:line` citations below are preserved exactly as originally written.

## Context

`find_all_files_path` used one predicate — `isEditorLocalPath(dirname)` — to
answer two different questions: *"is this directory C3 source?"*
(classification) and *"may this walk enter it?"* (reachability). Because
`EDITOR_LOCAL_EXCLUSIONS.dirs` contains `"ts-defs"`, `scripts/ts-defs/**` was
**unreachable by any predicate a caller could pass** — the caller's
`predicate` is consulted only for files, never for directories. Downstream
`construct3-chef` needs those `.d.ts` files to resolve TypeScript symbols and
was therefore forced to maintain exactly the parallel `readdirSync` recursion
that #16 exported `find_all_files_path` to eliminate.

Empirically measured during analysis:

- Descending costs ~0.8 ms / ~56 extra `statSync` calls over 200 warm
  iterations on the canonical fixture. Performance was never the reason.
- The canonical fixture holds **56** files under `ts-defs/`, **all `.d.ts`**.
- Naively removing the table entry changes exactly one thing: the generic
  walk `find_all_files_path(root, () => true)` goes 51 → 107 files. Every
  named collector, both drift detectors, `walkDiskFileTree`, and T7's corpus
  counts are byte-identical.
- Drift detection **never depended on the `.dirs` entry**: `scripts` is a
  *file folder*, walked by `walkDiskFileTree`, which recurses
  manifest-declared subfolders only (D3/R5). `ts-defs` is undeclared, so it
  was already invisible to drift by a second, independent mechanism.

## Decision

The table and `isEditorLocalPath` are left **unchanged**. Reachability
becomes a caller-controlled parameter on `find_all_files_path`, defaulting to
the editor-local rule so every existing call site is byte-identical.

**`EDITOR_LOCAL_EXCLUSIONS` answers provenance and nothing else** — not
serialization form ([ADR 0018](/decisions/0018-brush-json-minified-source-not-editor-local.md)),
and not walk reachability (this ADR).

It is a new ADR rather than an amendment to ADR 0006, for the same reason ADR
0018 gave when it made its own non-change (see 0018's Decision, "It is a new
ADR rather than an amendment to an existing one…"): ADR 0006's subject is *the
classifier this decision explicitly declines to change*, so recording a
non-change inside 0006's Decision would misread as a change to it. This is a
deliberate **non-narrowing**, structurally the mirror of 0018's deliberate
**non-widening**.

**The load-bearing constraint that shaped the design:** the directory prune
could not simply be removed, because it is how the library implements
**inherited** classification. The file `predicate` receives a bare basename,
so `uistate/Main Layout.instancesBar.json` is not flagged by
`isEditorLocalPath` on its own name
(`test/minifiedSourcePath.test.ts:44-51` locks this in as a documented quirk;
`test/manifestSerialize.test.ts:44-65` encodes the model as
`ancestorEditorLocal || isEditorLocalPath(name)`). Hence: keep the gate, make
its *policy* overridable.

The corollary a caller must know: **overriding `descend` disables inherited
editor-local classification for the entered subtree** — the caller's
`predicate` becomes the only filter.

## Compromise

**Fork A — mutate `EDITOR_LOCAL_EXCLUSIONS`** (drop `"ts-defs"` from `.dirs`,
optionally add a `.d.ts` suffix rule). Its genuine strengths, stated fairly:
the smallest possible downstream call (a plain 2-arg call, no opt-in needed),
and **ADR 0006 (see its Decision section) and `docs/design-patterns.md:107-108`
both name that table as *the* extension mechanism** — so this fork is what the
documented convention points at.

Rejected because: the published `listSourceEntries` idiom
(`docs/api-guide.md:135-149`) would begin reporting `ts-defs` as **source** —
a classification regression, not merely a reachability change. A file-suffix
rule cannot repair it, because `isEditorLocalPath("ts-defs")` is a
*directory-name* question a suffix entry cannot answer. This is #59's Fork A
argument in mirror image: ADR 0018 rejected widening the classifier because a
`listSourceEntries` consumer would silently *lose* data; this would make one
silently *gain* non-source data. Additionally, four independent disk walks in
`src/manifest.ts` re-implement their own prune against the same table and
would change semantics if C3 ever wrote a `ts-defs` elsewhere; and
`scripts/api-surface.mjs` dumps declaration *text*, so a `readonly string[]`'s
**contents** changing is invisible to it (the same blind spot ADR 0018
records) — the change would ship with a byte-identical API dump.

**Fork B — split the table** (`OPAQUE_WALK_DIRS ⊂ dirs`, consumed only by the
walk). Its genuine strength: it does preserve classification, so it clears
the ADR 0006 constraint.

Rejected because: it hardcodes a policy the consumer still cannot override —
the next consumer wanting `uistate/` deliberately hits the identical wall one
directory over, so it solves one instance of the conflation rather than the
conflation. It also leaks: `find_all_layouts_path` and
`find_all_objectTypes_path` pass `!isEditorLocalPath(f)` with **no extension
filter**, so if C3 ever wrote a `ts-defs/` under a name section, every `.d.ts`
in it would surface as a "layout". And it replaces one canonical table with
two whose `⊂` relationship is an unenforced invariant.

**Sub-variants also rejected:** an options bag `{descend?}` (no options-bag
precedent anywhere in `src/`; the established shape is a third optional
positional — cf. `walkManifestNameTree(folder, base, unnamedSubfolderName?)`,
`detectManifestDrift(dir, manifest?)`); and reusing the caller's `predicate`
for directories (changes existing behaviour — `() => true` would start
descending into `uistate/` — and overloads one callback with two meanings).

ADR 0018's `.dirs` ≠ `.fileSuffixes` passage (around lines 145-149) applies
here in the opposite direction: there the suffix variant was the **narrower**
footprint; here a `.d.ts` suffix rule would be **wider** in one direction (a
hand-authored `scripts/foo.d.ts` outside `ts-defs/` would wrongly become
editor-local, though it is neither derivable nor editor-overwritten) **and**
unable to answer the directory-name question at all.

## Consequences

- Semver: additive, **minor** (1.8.0 → 1.9.0). The bump itself is a separate
  release commit, per this repo's convention.
- Unlike a table-contents change, this **is** visible to
  `scripts/api-surface.mjs` — the declaration text of `find_all_files_path`
  changes, plus the new `C3_TS_DEFS_FOLDER` export. **Signature** delta:
  exactly those two lines. The *raw* dump for the PR that introduced this
  shows a third entry, `C3Project`, because the dump's
  canonicalized-declaration-text includes **JSDoc** and the same PR corrected
  `findAllScripts`'s doc comment; its method signature is byte-identical.
  Strip JSDoc blocks from both dumps before diffing to isolate real signature
  changes from prose (see `CLAUDE.md`) — otherwise a doc-carrying PR reads as
  a scope leak.
- **Residual risk to watch:** a future change that threads a `descend`
  override into `find_all_layouts_path`/`find_all_objectTypes_path` would hit
  Fork B's leak — those collectors have no extension filter. They are
  untouched here; flag it for future collector changes.
- **Plain-JS hazard:** TypeScript call sites are arity-checked, but a
  plain-JS consumer passing a stray third argument would silently bind it to
  `descend`.
- **Unvalidated assumption:** `.d.ts`-completeness of `ts-defs/` is **n=1** —
  56/56 in one fixture, one C3 release lineage. Nothing proves C3 cannot
  place another file type there. **R-D5 is the safety net**: it walks the
  fixture's `ts-defs` and names any non-`.d.ts` file it finds.
- Tests R-D1–R-D7 and OP-73 lock the behaviour; zero existing tests required
  editing (a deliberate, checkable property of this design).

## Related

- [ADR 0006 — Single canonical editor-local classifier](/decisions/0006-editor-local-classifier.md) — the classifier this ADR deliberately declines to change; provenance axis of the three-axis frame.
- [ADR 0018 — *.brush.json is minified project source, not editor-local](/decisions/0018-brush-json-minified-source-not-editor-local.md) — the mirror-image non-widening decision for the same table, on the serialization-form axis.
- [ADR 0025 — Section item-hood and stray files](/decisions/0025-section-item-hood-and-stray-files.md) — names the explicit three-axis frame (provenance / reachability / item-hood) this ADR's reachability axis belongs to; its own text records that it discharges this ADR's "residual risk to watch" above.
- [Layout Traversal](/layout-traversal.md) — the current state of the reachability (`descend`) parameter this ADR establishes.

[^adr-0020]: ADR 0020 (docs/decisions capture, 2026-08-20)
