---
type: reference
title: C3 Domain Facts
description: c3source owns exported tables naming undocumented C3 platform facts, each carrying a confidence label paired with its blast radius, validated via two evidence channels — a corpus scan of real projects and C3's own editor bundle — that answer different questions and must never be conflated when a table's findings mix both provenances.
tags: [domain-facts, c3-domain-facts, corpus-scan, editor-bundle, audit]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-10-28T12:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: domain-fact-audit
    resource: ../raw/docs-domain-fact-audit-2026-08-20.md
    title: "docs/domain-fact-audit.md (c3source C3 domain-fact audit, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: issue-86-evidence
    resource: ../raw/issue-86-file-entry-type-evidence-2026-10-01.md
    title: "Issue #86 file-entry type evidence (capture, 2026-10-01)"
    last_modified: 2026-10-01
  - id: issue-95-evidence
    resource: ../raw/issue-95-empty-stem-evidence-2026-10-27.md
    title: "Issue #95 empty-stem editor-bundle evidence (capture, 2026-10-27)"
    last_modified: 2026-10-27
  - id: issue-97-101-evidence
    resource: ../raw/issue-97-101-drift-evidence-2026-10-28.md
    title: "Issues #97 and #101 manifest drift evidence (capture, 2026-10-28)"
    last_modified: 2026-10-28
  - id: issue-100-evidence
    resource: ../raw/issue-100-empty-name-live-editor-2026-10-28.md
    title: "Issue #100 live editor run on a declared empty item name (capture, 2026-10-28)"
    last_modified: 2026-10-28
---

# C3 Domain Facts

C3 is an **undocumented, moving target**. c3source owns exported tables
naming C3 platform facts (ACE ids, MIME-to-extension maps, editor-loader
strictness rules, and the like) as a deliberate convention, so downstream
consumers need not each re-hardcode them[^claude-md]. [ADR
0008](/decisions/0008-c3-domain-fact-tables.md) owns *that* these
facts live here as exported tables; [ADR
0022](/decisions/0022-domain-fact-audit-convention.md) owns *how one
is validated*.

## Three validation rules

1. **Every table's JSDoc carries a confidence label** — `AUDITED` / `KNOWN
   INCOMPLETE` / `UNVALIDATED` / `NOT CORPUS-AUDITABLE` (the last must name
   the evidence source that *would* validate it) — **paired with the blast
   radius of being wrong**, which differs sharply per table:
   `EDITOR_LOCAL_EXCLUSIONS` contaminates every drift section,
   `IMAGE_FILE_TYPE_EXTENSIONS` throws, the rest are silent false negatives
   or cosmetic[^claude-md].
2. **Numbers never go in JSDoc.** JSDoc ships to consumers in `dist/*.d.ts`,
   where "audited against 14 projects" is false the day a 15th appears.
   Counts, releases, and the scan date live in this doc; JSDoc holds only
   the label and a pointer. A **release pin** (`r402`, `r437`) is the one
   exception — a fixed historical fact, not a rotting count[^claude-md].
   A label scoped by releases *and* sections ("AUDITED at r379, r402 and r495
   for layouts, event sheets, …") claims every release-and-section pair, so
   check each pair against that release's own bundle. A section can be
   younger than the oldest release named: models3d is absent from the r379
   and r402 bundles, and a label that listed it at all three releases shipped
   in JSDoc until a per-release grep caught it[^issue-95-evidence].
3. **`scripts/scan-domain-facts.mjs` reports partitions; the maintainer
   produces the verdict.** It never concludes a table is correct —
   `scripts/*.mjs` is unlinted, untypechecked, untested, and not in CI, so a
   probe bug must yield odd-looking evidence a human notices, not a wrong
   conclusion baked into a table[^claude-md]. Every verdict line carries its
   own observation count, and zero observations prints `NOT EXERCISED`,
   never a pass — a probe once printed "NO CONTRADICTIONS" having scanned
   nothing[^claude-md]. This happened for real: the `minified` probe once
   shipped printing `NO CONTRADICTIONS` having scanned **zero**
   `.brush.json` files, because brush files live under a top-level
   `tilemapBrushes/` folder outside every section table the walk derives
   from — the conclusion was true and worthless[^domain-fact-audit].

## Two evidence channels

**Reach for C3's own bundle before a corpus scan.**
`https://editor.construct.net/r{NNN}/` is permanently hosted and fetchable
per release (`construct.net`'s human-facing docs are Cloudflare-gated; this
is not)[^claude-md]:

- `plugins/allAces.json` (and `behaviors/allAces.json`) is C3's
  **authoritative ACE table** — the full System ACE set, not just what a
  corpus happens to have exercised.
- Bisecting `projectResources.js` at the **release root** (`https://editor.construct.net/r{NNN}/projectResources.js`
  — **not** `c3runtime/`, which 404s at every release tested; an earlier
  version of this note cited the wrong path, corrected and re-verified
  2026-08-10) pins **exactly when a field appeared**[^claude-md].

**A corpus answers what values occur; the bundle answers what the mechanism
is** — a distinction ADR 0008's addendum says a corpus structurally cannot
make[^claude-md]. In issue #68 the bundle proved `EVENTVAR_REFERENCE_ACES`
complete, proved `is-boolean-eventvar-set` **fabricated** (not merely
unobserved — a corpus can only confirm presence, never prove a
non-existent id absent), and converted two corpus brackets into exact pins
(`fileType`→r402, `functionsName`→r437)[^claude-md][^domain-fact-audit].
Three independent bracket-to-pin conversions accumulate across this doc's
history: `fileType`→r402, `functionsName`→r437, and `.ts` script
support→r433 — the cumulative argument for reaching the bundle
first[^domain-fact-audit].

## The two-provenance warning

**A table's findings section carries *two* provenances, and only one half
is scanner-refreshable.** A section typically mixes corpus-derived
**numbers** (occurrence counts, release lists, on-disk breakdowns) with
bundle-derived **facts** (an exact release pin, a "there are exactly two
branches" proof, a false-positive trap)[^claude-md]. Re-running the scanner
refreshes the first and **cannot reproduce, confirm, or refute** the
second — so the doc's own "re-run it and update this doc's numbers"
instruction, followed literally, **deletes the stronger evidence**. Refresh
the numbers; re-verify the bundle facts against
`editor.construct.net/r{NNN}/` instead; never overwrite them with anything
the scanner prints[^claude-md].

This was not hypothetical: issue #77 shipped with an acceptance criterion
asking for exactly that wholesale refresh, which would have destroyed
`SCRIPT_SOURCE_EXTENSIONS`'s `.ts`→r433 pin, its one-ternary proof, and its
`.tsx`/Tiled trap — the criterion was corrected rather than executed, and
this doc's own "How to re-run" section now carries the warning at the
point of use[^claude-md].

## Per-table inventory and confidence labels

Ten exported tables have been corpus-scanned as of this capture, and one
further domain-fact constant, `TIMELINE_TRANSITIONS_FOLDER`, was corpus-validated
on 2026-10-28 for issue #97. The first
six were scanned 2026-08-04 for issue #68; `SCRIPT_SOURCE_EXTENSIONS`/
`SCRIPT_FILE_TYPE_EXTENSIONS` were added 2026-08-10 for issue #73/#74;
`C3_SECTION_ITEM_EXTENSION` was added 2026-08-11 for issue #76;
`EXTENSION_FILE_TYPES` was added 2026-10-01 for issue #86 — the four
groups were not scanned together and should not be read as equally
fresh[^domain-fact-audit][^issue-86-evidence].

| Table | Predicate/accessor | Corpus verdict | Blast radius if wrong |
|---|---|---|---|
| `EVENTVAR_REFERENCE_ACES` | — | NO GAPS at value level; two defects found and fixed (below) | Silent misclassification of event-var references |
| `COMPARISON_OPERATORS` | `comparisonSymbol` | NO GAPS — all 2,451 observed values fall in 0–5 | Cosmetic — annotation only, numeric value stays round-trippable |
| `IMAGE_FILE_TYPE_EXTENSIONS` | — | NO GAPS on present values, but 15 pre-r402 nodes carry no `fileType` at all (see ADR 0023) | **Throws** on an unmapped, present MIME |
| `EDITOR_FIELD_RULES` | `validateForEditor` | NO FAILURES, but structurally uninformative (see below) | Silent editor-import crash if a real rule is missing |
| `EDITOR_LOCAL_EXCLUSIONS` | `isEditorLocalPath` | NO CONTRADICTIONS across 11,971 files | Contaminates every drift section |
| `C3_MINIFIED_SOURCE_SUFFIXES` | `isMinifiedSourcePath` | NO CONTRADICTIONS across 2,605 `.json` files | Cosmetic — write-form only |
| `SCRIPT_SOURCE_EXTENSIONS` | `isScriptSourceName` | NO GAPS at value level; `.ts`→r433 bundle-pinned | Silent over/under-collection in script discovery, never a throw |
| `SCRIPT_FILE_TYPE_EXTENSIONS` | — | NO GAPS; same corpus as above | Silent miss in manifest interpretation, never a throw — the explicit inverse of `IMAGE_FILE_TYPE_EXTENSIONS` |
| `C3_SECTION_ITEM_EXTENSION` | `isSectionItemName` | NO STRAYS in 6 of 7 sections; `models3d` NOT EXERCISED (no corpus project has one). Empty-stem exclusion: AUDITED against the editor bundle (layouts, event sheets, timelines, flowcharts, models3d); objectTypes and families setters NOT TRACED in the bundle; 0 `.json` dotfiles and 0 declared `""` in the 14-project corpus (below). Declared `""`: LIVE-EDITOR r506.3, a separate channel from the bundle — refused for layouts/eventSheets/timelines/families, renamed for objectTypes, loaded for flowcharts; models3d not tested[^issue-100-evidence] | Silent mis-partition between "section item" and "stray"; a real nameless item would become a stray plus `missing` drift, never a throw |
| `TIMELINE_TRANSITIONS_FOLDER` | — | CORPUS-VALIDATED by the 2026-10-28 raw capture: out of 24 unique manifests, 14 have an empty transitions container and no `timelines/transitions/` dir, 8 have a non-empty container with the dir (below) | A false `folder-missing` on every healthy timeline project, or a sync tool that deletes the container |
| `EXTENSION_FILE_TYPES` | `fileTypeForName` | NO MISMATCHES across 567 file entries; **writer direction**, `KNOWN INCOMPLETE`, two tiers (below) | A silently wrong `type` is written into `project.c3proj`; unmapped keys are `undefined` directly, the default via the accessor |

The corpus is 14 Genvid-authored projects spanning 8 releases (`37900,
38802, 39700, 40702, 44002, 44902, 47604, 49500`), skewed heavily toward
`c3addon-*/sample/` single-feature demos — one project, **burbank**, holds
~97% of all ACEs and ~99.5% of all image nodes in the entire corpus, so
every other project is, on volume, a rounding error next to it. Scan **can
find gaps; it can never prove completeness**[^domain-fact-audit].

## Item-hood at the empty-stem boundary

`isSectionItemName` accepts `*.json` and, since issue #95, only with a
non-empty stem on the last path segment: `.json` is a stray, not an item
([ADR 0031](/decisions/0031-empty-stem-is-not-a-section-item.md)). The
question this section answers is whether C3 ever writes or loads a nameless
item, so that a real one is never lost. The two evidence channels answer
different halves of it and are reported separately, as the
[two-provenance warning](#the-two-provenance-warning) requires.

**Bundle evidence.** The editor's name validator begins `if(!d)return!1`, so
it rejects the empty string before any other rule, at r379, r402 and r495. The
name setters of layouts, event sheets, timelines and flowcharts call it and
throw at all three releases, and models3d does at r495 (the section does not
exist in the r379 and r402 bundles). The section loaders open
`folder + <manifest item name> + ".json"` and never list the folder, so a
`.json` no manifest item names is never opened. **Not traced:** the objectTypes
and families name setters (their loaders were read, their setters were not
found), and what the editor does with a manifest that declares `""`, which the
bundle capture left as a live-editor question. The matched snippets are verbatim
in the raw capture[^issue-95-evidence]. This evidence is not scanner-refreshable;
re-verify it against `editor.construct.net/r{NNN}/`.

**Live-editor evidence.** Issue #100 answers that last gap by running the
editor, a different channel from the bundle, so the two are not merged. Copies
of the `construct3-sample` project, each declaring one root-level item named
`""` in one section, were opened in Construct 3 r506.3 (eventSheets also at
r495.2). "Crashed" means a crash dialog and an editor restart; "failed" means an
error dialog and a console error, with the editor left as it was
before[^issue-100-evidence]:

- layouts and eventSheets **crashed** (`invalid layout name ''`, `invalid event
  sheet name ''`; eventSheets at both releases).
- timelines and families **failed** to open (`invalid timeline name ''`,
  `invalid name`).
- objectTypes **opened** with no visible new object type. The disk state after
  a save suggests the item was renamed to `Text3`; that rename is an inference,
  as no editor code was read. The save then rewrote the manifest with `Text3`
  but deleted `objectTypes/.json` and wrote no `Text3.json`, so the project no
  longer opened.
- flowcharts **opened** and, after a save, wrote the project back with the
  nameless flowchart still declared and `flowcharts/.json` unchanged; it
  re-opened. So `""` is loadable there even though the bundle's name setter
  rejects it.
- models3d was not tested (empty in the sample).

The editor therefore refuses a declared `""` in most sections, but not in
flowcharts, and in objectTypes it silently corrupts the project. A rule
rejecting a declared `""` in every name section is proposed in #106 and is not
yet shipped; it would be deliberately stricter than the editor for flowcharts.

**Corpus evidence.** Re-run 2026-10-27 on the 14 projects of the inventoried
corpus (deduplicated by hand, see below): 2,282 declared items across the
seven name sections, 0 of them declared as `""`, and 0 files whose basename is
`.json` under any section root. `scripts/scan-domain-facts.mjs` agrees: 2,282
section items and 0 strays across 8 releases, with `models3d` NOT EXERCISED.
burbank holds 2,007 of the 2,282 items, so the other 13 projects add little
volume. A zero here is an absence in these 14 projects only; a scan can
find a case, never rule one out. The earlier figure of 12,672 declared
items over about 14 projects, inherited from the issue's analysis, could not
be reproduced by this count and is not quoted. Method: the depth-4 `find` for `project.c3proj` under the maintainer
checkout directory returned 18 manifests; four were dropped as copies
(`bb-backup/previews/burbank`, `bb-backup/previews/construct3-poc`,
`google/burbank`, and the `construct3-sample` submodule inside c3source), which
leaves the 14. A deeper `find` returns 38 manifests, mostly backups and
test-fixture copies; they were not added. Dedupe by project identity, not by
`uniqueId`: the cloned addon samples share one.

## The timelines transitions container

C3 serializes the `transitions/` directory of timelines (shown as "Eases" in
the editor) as a **nameless** direct child of `timelines` in
`project.c3proj`; `TIMELINE_TRANSITIONS_FOLDER` (`"transitions"`) names it.
The question is when its directory exists. **Corpus evidence**, scanned
2026-10-28 over 24 unique manifests (31 found, deduplicated by sha256 of the
manifest bytes): 22 of the 24 have a nameless direct child of `timelines`, the
other 2 are chef addon-validate fixtures with no container; the pre-fix
survey (releases r379–r476) found exactly one per editor-saved manifest. Of
the 22, **14** have an empty container and no
`timelines/transitions/` directory, and **8** have a non-empty container with
the directory present. No manifest has two nameless containers or a named
`"transitions"` subfolder[^issue-97-101-evidence]. So an empty container with no
directory is the normal healthy state, which is why `detectManifestDrift`
never reports it `folder-missing` ([ADR
0032](/decisions/0032-transitions-container-never-folder-missing.md)). **Not
established:** no manifest in the corpus has a container with items but no
directory, so that shape is unobserved. This is a corpus scan, not an editor-bundle trace; nothing here was
fetched from `editor.construct.net`. See also [Project Manifest — the timeline
`transitions/` exception](/project-manifest.md#the-timeline-transitions-exception).

## Item-name uniqueness scope

Drift detection must decide how far a name's uniqueness reaches, because
`moved` is only sound for a name that is unique on both sides ([ADR
0033](/decisions/0033-drift-keys-on-name-and-path.md)). **What the editor
enforces:** the name setters of layouts, event sheets, timelines and flowcharts
throw `<kind> name '…' already used` when the new name is already taken in that
section, at r379, r402 and r495; models3d does so at r495. The setters traced
are those listed in the [empty-stem
capture](#item-hood-at-the-empty-stem-boundary)[^issue-95-evidence]. The
objectTypes and families setters were **not traced**. Nothing was traced for
`rootFileFolders` or `images`.

**What the drift code assumes**, per scope:

- **Name sections** (the seven): a name should occur once in the whole section,
  on each side, whatever folder it sits in. A repeat is reported in
  `ManifestDrift.duplicates`.
- **`rootFileFolders.<cat>` and `images`**: a name should occur once **per
  folder**; the same file name in different folders is legitimate and is not
  reported.
- **Case**: names compare case-sensitively. A case-insensitive editor rule would
  make `A` and `a` collide without being reported.

**Status: UNVALIDATED.** The scope per section and the case sensitivity were
inferred from the setters' behaviour and from real file layouts, not confirmed
against the editor or the corpus; the post-fix scan found no duplicate
name in the scanned manifests, which is an absence in those projects only. Hand-written trees and bad merges can
still produce a repeat, since the setters guard only editor-side edits[^issue-97-101-evidence].

## EXTENSION_FILE_TYPES: the writer-direction fact

Every other MIME table maps MIME to extension, for reading. This one maps an
extension to the `type` the editor records on a `rootFileFolders` file entry,
for a tool that writes entries; [ADR
0027](/decisions/0027-file-entry-type-writer-fact.md) owns the decision. The
mechanism is hidden: the editor bundle reads `type` from an opaque getter, so
the values are **observed editor outputs, not a specification**[^issue-86-evidence].

**Corpus evidence.** Probe 10 (`fileEntryType`) of the scanner covers the 14
inventoried projects: 567 file entries across 8 releases (`37900` to `49500`),
with 0 mismatches and 0 unmapped. The heavy rows are `.ts` in `script` (132
entries, 3 projects), `.png` in `icon` (128 entries, 14 projects), and `.webm`
in `sound` and `music` (107 and 42 entries, one project each)[^issue-86-evidence].

**Editor saves outside that scan.** `construct3-sample` was saved at C3 r49502
for upstream #5 and for the maintainer's 2026-10-01 experiment: one save each of
general `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`, `.mp4`, `.mp3`, `.m4a` and
`.plist`, and the same audio `.webm` and `.ttf` saved in `sound`/`music`/`font`
and under `files/`. Both placements recorded identical strings
(`audio/webm; codecs=opus`, `application/font-sfnt`), so the table is **flat**
across sections. A browser `File.type` would not yield `; codecs=opus`, so the
value is probably probed by the editor — an inference, not a bundle
finding[^issue-86-evidence].

**Tiers.** Counted in independent editor-saved projects, the sample included:

- **AUDITED** (2 or more): `.png` (14 projects), `.json` (4), `.html` (4), `.ts`
  (3), `.css` (2), `.js` (2); then `.ttf`, `.webm` and `.plist` at 2 each —
  burbank plus the sample's r49502 saves.
- **UNVALIDATED** (one project or one save): `.txt` and `.xml` (burbank only),
  `.vtt` (`c3addon-gcore-video-plugin` only), and `.jpeg`, `.gif`, `.svg`,
  `.webp`, `.mp4`, `.mp3`, `.m4a` (one sample save each). `.jpg` is
  UNVALIDATED too: burbank's 26 `.jpg` entries were **hand-edited**, not
  editor-written, so the only editor-written `.jpg` is the sample's.

The 14-project scan prints `.ttf`, `.webm` and `.plist` at **1 project** each
only because it does not include the sample's r49502 saves; the tier above
counts them. Across all 38 manifests on the maintainer machine, duplicates
included, no extension was ever observed with two different types in any
section, and the `video` section is empty[^issue-86-evidence].

**Residuals, untested:** a `.webm` carrying video, and other operating
systems.

## Two defects the audit found and fixed

1. **`reset-eventvar` was missing from `EVENTVAR_REFERENCE_ACES`** — 491
   occurrences in the corpus, entirely unaccounted for before the audit. A
   System ACE that resets an event variable to its initial value is exactly
   the kind of entry the table exists to hold; it had simply never been
   added[^domain-fact-audit].
2. **A fabricated entry, `is-boolean-eventvar-set`, was removed.** It did
   not correspond to a real C3 System ACE id — cross-checked against C3's
   own authoritative `allAces.json`, not against the corpus, since a corpus
   scan can only confirm presence, never prove a non-existent id
   absent[^domain-fact-audit].

A third, structurally different finding concerns the functions object: see
[Reference Integrity — The functions-object
story](/reference-integrity.md#the-functions-object-story) for the full
account of how a corpus scan validated the *value* `"Functions"` while
missing the *mechanism* (a per-project `functionsName` setting) behind it —
because every scanned project happened to use the default.

## What a corpus cannot audit at all

`EDITOR_FIELD_RULES` is a special case: every project in the corpus was
authored in the C3 editor and already loads successfully, so a scan sees
which fields are **present**, never which the loader actually **requires** —
a field the editor always writes and never omits is indistinguishable, by
presence alone, from a field the loader doesn't care
about[^domain-fact-audit]. Zero failures across 11,711 events is therefore
the expected, uninformative result, not evidence the tabled rules are
complete[^domain-fact-audit].

The scan's by-`eventType` "always-present" breakdown is a **candidate
superset**, not a verified rule set. Two fields that stood out as
always-present but not in the table were tested directly against the C3
editor in issue #70, and they **split**: `function-block.functionDescription`
(present on 1,030/1,030 instances) was **accepted** as optional by the
editor and not restored on save; `custom-ace-block.aceName` (present on
179/179) was **rejected** — a missing one produces "Failed to open project"
naming no field[^domain-fact-audit]. `custom-ace-name-required` was added to
`EDITOR_FIELD_RULES` as a result.

> **Corpus ubiquity is not evidence of a loader requirement.** The editor
> writes a field by default; that is not the loader demanding
> it[^domain-fact-audit].

This is the concrete justification for the table's `NOT CORPUS-AUDITABLE`
label: not a caveat, a measurement. C3's own diagnostics are weak and
inconsistent too — a missing `comment` **crashes** the editor outright,
while a missing `aceName` produces a generic dialog naming no field at
all[^domain-fact-audit].

## A third evidence channel: live editor execution

For at least one C3 semantic — local-variable scope visibility vs.
re-initialization — neither the corpus nor the bundle could settle the
question, because both show what is *saved*, never what happens when a
project actually *runs*. A live C3-editor execution was the third channel
used to confirm `extractScriptsFromSheet`'s `scopeVars` claim; see [C3
local-variable scoping](/event-sheet-extraction.md) for the traced result.
Unlike the corpus/bundle-derived tables, this evidence is **not
scanner-refreshable at all** — re-verifying it means repeating the manual
experiment[^domain-fact-audit]. Issue #100's run of a declared empty item
name in each section is the second use of the channel (see [Item-hood at the
empty-stem boundary](#item-hood-at-the-empty-stem-boundary))[^issue-100-evidence].

## How to re-run

```sh
npm run build   # the scanner imports dist/, not src/
node scripts/scan-domain-facts.mjs <project-dirs...>
```

The scanner reports **partitions, not verdicts** — dev-only tooling,
deliberately not wired into CI, since the corpus is machine-local and
cannot be. A `GAP` line is a finding to read and reason about, not a build
failure[^domain-fact-audit]. Scan the inventoried corpus, not every
`project.c3proj` reachable from a broad `find` — a naive walk can
double-count a project reached through both a top-level checkout and a
backup/submodule copy, inflating counts and adding phantom
releases[^domain-fact-audit].

**The recorded re-run glob is no longer safe.** The command in the audit
capture (`ls /c/repos/*/project.c3proj /c/repos/*/*/project.c3proj`) now
returns **15** projects on the maintainer machine, not 14, because
`/c/repos/google/burbank` duplicates burbank at depth 2. Deduplicate against
the inventory before scanning; burbank holds ~97% of all ACEs, so a second
copy skews every count[^issue-86-evidence].

On any future C3 version bump, re-run it and
update this doc's **numbers** — never the JSDoc labels.

## Related

- [ADR 0027 — File-entry type as a writer-direction domain fact](/decisions/0027-file-entry-type-writer-fact.md) — why `EXTENSION_FILE_TYPES` is an open table with an accessor and two tiers.
- [ADR 0031 — An empty stem is not a section item](/decisions/0031-empty-stem-is-not-a-section-item.md) — the decision behind the empty-stem boundary above.
- [ADR 0032 — The transitions container is never folder-missing](/decisions/0032-transitions-container-never-folder-missing.md) — the decision behind the container fact above.
- [ADR 0033 — Drift keys on name and path](/decisions/0033-drift-keys-on-name-and-path.md) — the decision behind the uniqueness scope above.
- [Project Manifest](/project-manifest.md) — where `EXTENSION_FILE_TYPES` sits beside its reading-direction siblings.
- [Reference Integrity](/reference-integrity.md) — `C3_PSEUDO_OBJECT_CLASSES` and the functions-object defect this convention's rules were built to catch.
- [Layout Traversal](/layout-traversal.md) — `EDITOR_LOCAL_EXCLUSIONS`/`isEditorLocalPath`, one of the tables audited here.
- [Serialization Form](/serialization-form.md) — `C3_MINIFIED_SOURCE_SUFFIXES`/`isMinifiedSourcePath`, another audited table.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — `EVENTVAR_REFERENCE_ACES`, `COMPARISON_OPERATORS`, and `EDITOR_FIELD_RULES`, all audited here.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^domain-fact-audit]: docs/domain-fact-audit.md (c3source C3 domain-fact audit, 2026-08-20 capture)
[^issue-86-evidence]: Issue #86 file-entry type evidence (capture, 2026-10-01)
[^issue-95-evidence]: Issue #95 empty-stem editor-bundle evidence (capture, 2026-10-27)
[^issue-97-101-evidence]: Issues #97 and #101 manifest drift evidence (capture, 2026-10-28)
[^issue-100-evidence]: Issue #100 live editor run on a declared empty item name (capture, 2026-10-28)
