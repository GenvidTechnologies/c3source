---
type: decision-context
title: "ADR 0031 — An empty stem is not a section item: isSectionItemName rejects `.json`, so such a file is a stray"
description: isSectionItemName(".json") and any path whose last segment is `.json` now return false (a breaking 3.0.0 change that refines ADR 0025's item-hood axis), so the file is reported by detectStrayFiles instead of find_all_section_items_path, walkDiskNameTree never yields an empty name, and a declared "" reads as missing drift; manifest validation is unchanged. C3's editor rejects an empty name at the setter at r379, r402 and r495 for the traced sections; the objectTypes and families setters are not traced.
tags: [adr, traversal, manifest, breaking-change, domain-facts]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-27T19:00:00Z }
sources:
  - id: issue-95-evidence
    resource: ../../raw/issue-95-empty-stem-evidence-2026-10-27.md
    title: "Issue #95 empty-stem editor-bundle evidence (capture, 2026-10-27)"
    last_modified: 2026-10-27
  - id: issue-95-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/95
    title: "c3source#95 — should isSectionItemName(\".json\") be true?"
---

# ADR 0031 — An empty stem is not a section item: isSectionItemName rejects `.json`, so such a file is a stray

**Status:** accepted
**Date:** 2026-10-27
**Issue:** [#95](https://github.com/GenvidTechnologies/c3source/issues/95)

Refines [ADR 0025](/decisions/0025-section-item-hood-and-stray-files.md), which introduced `isSectionItemName` as the item-hood axis and decided "a non-item file under a name section is a diagnostic, never drift". ADR 0025 stands; this record narrows what the predicate accepts and leaves the partition and the stray mechanism as they were.

## Context

`isSectionItemName` was `name.endsWith(".json")`. That makes the bare basename `.json` an item: its stem is the empty string. Three consequences followed from one line[^issue-95-upstream]:

- `find_all_section_items_path`, and through it every name-section finder, returned a file literally named `.json` as if it were a layout (or object type, or event sheet).
- `walkDiskNameTree` derived the item name with the extension stripped, so it yielded `name: ""`, and `detectManifestDrift` reported `untracked ""`: a drift entry a repair worklist could try to fix by declaring an item named `""`.
- `detectStrayFiles`, the exact complement of the predicate, returned nothing for it, so the file was visible only as a nameless item.

The predicate is called with full paths as well as basenames: `construct3-chef`'s `scaffoldPlan.ts` and `sourceIo.ts` pass `outPath` and `abs`. `endsWith` happens to give the same answer for both, and a narrowing has to keep that property. `isSectionItemName("C:/x/layouts/.json")` and its backslash form were `true`.

**Does C3 ever write or load a nameless `.json` item? No, on the evidence read.** This is the question issue #95 asked (its third acceptance criterion). The evidence is the editor bundle at three releases and is captured verbatim in the raw record[^issue-95-evidence]:

- **The name validator rejects the empty string first.** The shared name-validity function begins `if(!d)return!1` (the minified parameter name differs by release) at r379, r402 and r495. Every section's name setter calls it and throws on failure.
- **The setters throw.** Layouts, event sheets, timelines and flowcharts call the validator and throw at r379, r402 and r495 (`invalid name` at r379 and r402, `invalid <section> name '<name>'` at r495). Models3d does the same at r495 (`invalid model 3d name`). The models3d section does not exist in the r379 or r402 bundles, so it is traced at r495 only.
- **The loader never enumerates the disk.** Each section loader shown opens `folder + <name from the manifest> + ".json"`. A `.json` file that no manifest item names is not opened. The only route to opening `layouts/.json` is a manifest item named `""`, and no setter lets the editor produce one.

Two gaps stay open and are stated here rather than closed by assumption. **The objectTypes and families name setters were not traced**: their loaders were read (they check the file's own `name` against the manifest item name), but the setters that decide whether `""` is a valid object type or family name were not found, so those two sections are neither confirmed nor refuted. And **nobody has run the editor on a manifest that declares `""`**: whether it aborts the project open is a live-editor question, filed as a follow-up.

## Decision

The issue offered two options: keep `true` and document it, or narrow the predicate. The design labelled the narrowing **Option A** (chosen), the keep-and-document option **Option B**, and a deferral of A to a later major **Option C**; the Compromise section uses those labels.

**`isSectionItemName` returns `false` for an empty stem, on a basename and on a path.** The body keeps the case-sensitive `.json` test and adds a stem check on the last path segment:

```ts
if (!name.endsWith(C3_SECTION_ITEM_EXTENSION)) return false;
const stem = name.slice(0, -C3_SECTION_ITEM_EXTENSION.length);
return stem !== "" && !stem.endsWith("/") && !stem.endsWith("\\");
```

So `.json`, `layouts/.json`, `layouts\.json` and `C:/x/layouts/.json` are not items; `a.json`, ` .json`, `..json` and `C:/x/layouts/a.json` still are. The separator test is spelled out instead of using `path.basename`, because `path.posix.basename` does not split on a backslash, and the answer must be the same on every platform.

**The rest follows from the partition, with no other source change.** `detectStrayFiles` is `!isSectionItemName(f) && !isEditorLocalPath(f)`, so the file now appears in `detectStrayFiles` and `ManifestDrift.strays`, and in no finder. `walkDiskNameTree` uses the predicate directly, so it never yields `name: ""` and drift stops reporting `untracked ""`. A manifest that declares an item `""` therefore reads as `missing ""` drift, a stray `.json`, and `inSync: false`. ADR 0025's claim that a stray has no manifest position still holds: `""` is not a valid C3 name, so a declared `""` is not a valid position either.

**Manifest validation is unchanged.** `validateProjectManifest` and `collectManifestIssues` add no rule against `""`. `collectManifestIssues` backs strict `parseProjectManifest`, so a new rule would make `openProject` throw on behaviour no one has observed in the editor. The throw would rest on a live-editor result that has not been obtained. The behaviour of a declared `""` is pinned by a test (SF15), so a later rule is a deliberate change.

**What is pinned.** Tests SI10 to SI12 (`test/sectionItemPolicy.test.ts`) pin the predicate on basenames and paths, and SF13 to SF15 (`test/strayFiles.test.ts`) pin the partition, the walk, and the declared-`""` drift. Each condition of the predicate is pinned by a mutation: a mutation run (reverting to the old body, and removing the empty-stem test and each separator test in turn) failed exactly the tests meant to catch it, and the issue's length-only formula failed the path test alone.

**Confidence.** The empty-stem exclusion is `AUDITED` against the editor bundle for layouts, event sheets, timelines and flowcharts at r379, r402 and r495 and for models3d at r495 (the section is absent earlier); the objectTypes and families setters are not traced. The `isSectionItemName` JSDoc carries the label and the blast radius; corpus counts live in [C3 Domain Facts](/c3-domain-facts.md#item-hood-at-the-empty-stem-boundary), never in JSDoc.

## Compromise

**Semver price: a major, 3.0.0.** The JSDoc said "by extension alone", so `.json` returning `true` was the documented contract. Narrowing a documented public predicate changes results for `^2` consumers with no type change, the same classification ADR 0025 gave its own narrowing. `detectManifestDrift` also changes for a declared `""` with `.json` on disk, from `inSync: true` to `false`. The cost to a consumer is a range bump and no code change: the local corpus holds no `.json` dotfile and no declared `""` (see the wiki page for the figure and its method). `package.json` is not bumped here; releasing is a separate step.

The alternatives, with the reason each was not chosen:

- **Option B — keep `true` and document it.** Rejected: it keeps a known mis-partition. A tool-written `layouts/.json` keeps being parsed as a layout named `""` and reported as `untracked ""` drift, and every guard-style consumer has to re-implement the stem check.
- **Option C — Option B now, Option A queued for the next major.** Rejected: B's correctness cost until then. The maintainer accepted a 3.0.0 for this alone.
- **Adopt C3's full name validity inside the predicate (narrowing further than the empty stem).** Rejected because it is a different fact with a different shape and would break ADR 0025's one-fact, one-predicate axes. The validator has many rules, some operating-system flavoured, and runs on the name after normalisation, so the validated name is not the on-disk basename. If full name validity is ever wanted, it belongs in its own table and predicate.
- **The issue's length-only formula, `name.length > ext.length && name.endsWith(ext)`.** Rejected because `construct3-chef` passes full paths (`scaffoldPlan.ts` `isSectionItemName(outPath)`, `sourceIo.ts` `isSectionItemName(abs)`; checked by grep), and `C:/x/layouts/.json` would stay `true` under it.

**Accepted costs.** A real nameless item, if C3 ever wrote one, would become a stray plus `missing` drift: a false negative in discovery, never a throw. The editor evidence says it does not, for the sections traced. The narrowing stops at the empty stem on purpose, so some names C3's validator rejects stay items: `..json` (stem `.`, a leading `.` the validator refuses at every traced release) is pinned as an item by SI12, as the cost of not adopting full name validity. `diffNameMaps` keying by name, which collapses same-named items in different folders, is a pre-existing and separate defect and is not addressed here. Consumers get downstream heads-ups: `c3-domain-manager`'s `listInertOverrides` reason text for an override key `.json` is now cosmetically wrong; `construct3-chef`'s `scaffoldPlan` basename guard becomes redundant but harmless; and `construct3-chef`'s `sourceIo` object-type walk, which filters on `isSectionItemName(abs)`, now skips an `objectTypes/.json` it used to process.

## Consequences

- Semver: **3.0.0**, behaviour-only, no type, arity or name change. `scripts/api-surface.mjs` sees only the JSDoc move; strip JSDoc before diffing, and settle the behaviour by the tests, as ADR 0025 recorded.
- `scripts/scan-domain-facts.mjs`'s stray probe uses the predicate, so the next corpus scan reports any `.json` as a stray with no script change.
- The wiki states the behaviour after the change: [C3 Domain Facts](/c3-domain-facts.md#item-hood-at-the-empty-stem-boundary) (evidence), [Layout Traversal](/layout-traversal.md) (the item-hood axis), and [Project Manifest](/project-manifest.md#stray-files) (strays and a declared `""`).
- Follow-ups, not part of this record: a c3source issue for a live editor run on a manifest declaring `""` (does the project open abort?), and, if that run shows the editor rejects it, a case for a manifest-validation rule; tracing the objectTypes and families name setters.

## Related

- [ADR 0025 — Section item-hood as a named axis, and stray files as diagnostic, not drift](/decisions/0025-section-item-hood-and-stray-files.md) — the axis and the partition this record refines.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md) — the confidence label and blast-radius pairing used above.
- [ADR 0008 — C3 domain facts are exported tables](/decisions/0008-c3-domain-fact-tables.md) — why the extension fact lives in the library.
- [C3 Domain Facts](/c3-domain-facts.md) — the evidence, bundle and corpus, kept separate.

[^issue-95-upstream]: c3source#95 — should isSectionItemName(".json") be true?
[^issue-95-evidence]: Issue #95 empty-stem editor-bundle evidence (capture, 2026-10-27)
