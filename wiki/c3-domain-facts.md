---
type: reference
title: C3 Domain Facts
description: c3source owns exported tables naming undocumented C3 platform facts, each carrying a confidence label paired with its blast radius, validated via two evidence channels — a corpus scan of real projects and C3's own editor bundle — that answer different questions and must never be conflated when a table's findings mix both provenances.
tags: [domain-facts, c3-domain-facts, corpus-scan, editor-bundle, audit]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: domain-fact-audit
    resource: ../raw/docs-domain-fact-audit-2026-08-20.md
    title: "docs/domain-fact-audit.md (c3source C3 domain-fact audit, 2026-08-20 capture)"
    last_modified: 2026-08-20
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

Nine exported tables have been corpus-scanned as of this capture. The first
six were scanned 2026-08-04 for issue #68; `SCRIPT_SOURCE_EXTENSIONS`/
`SCRIPT_FILE_TYPE_EXTENSIONS` were added 2026-08-10 for issue #73/#74;
`C3_SECTION_ITEM_EXTENSION` was added 2026-08-11 for issue #76 — the three
groups were not scanned together and should not be read as equally
fresh[^domain-fact-audit].

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
| `C3_SECTION_ITEM_EXTENSION` | `isSectionItemName` | NO STRAYS in 6 of 7 sections; `models3d` NOT EXERCISED (no corpus project has one) | Silent mis-partition between "section item" and "stray" |

The corpus is 14 Genvid-authored projects spanning 8 releases (`37900,
38802, 39700, 40702, 44002, 44902, 47604, 49500`), skewed heavily toward
`c3addon-*/sample/` single-feature demos — one project, **burbank**, holds
~97% of all ACEs and ~99.5% of all image nodes in the entire corpus, so
every other project is, on volume, a rounding error next to it. Scan **can
find gaps; it can never prove completeness**[^domain-fact-audit].

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
experiment[^domain-fact-audit].

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
releases[^domain-fact-audit]. On any future C3 version bump, re-run it and
update this doc's **numbers** — never the JSDoc labels.

## Related

- [Reference Integrity](/reference-integrity.md) — `C3_PSEUDO_OBJECT_CLASSES` and the functions-object defect this convention's rules were built to catch.
- [Layout Traversal](/layout-traversal.md) — `EDITOR_LOCAL_EXCLUSIONS`/`isEditorLocalPath`, one of the tables audited here.
- [Serialization Form](/serialization-form.md) — `C3_MINIFIED_SOURCE_SUFFIXES`/`isMinifiedSourcePath`, another audited table.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — `EVENTVAR_REFERENCE_ACES`, `COMPARISON_OPERATORS`, and `EDITOR_FIELD_RULES`, all audited here.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^domain-fact-audit]: docs/domain-fact-audit.md (c3source C3 domain-fact audit, 2026-08-20 capture)
