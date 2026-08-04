# C3 Domain-Fact Audit

Corpus-scan results for the six exported C3 domain-fact tables (ADR 0008):
`EVENTVAR_REFERENCE_ACES`, `COMPARISON_OPERATORS`, `IMAGE_FILE_TYPE_EXTENSIONS`,
`EDITOR_FIELD_RULES`, `EDITOR_LOCAL_EXCLUSIONS` (via `isEditorLocalPath`), and
`C3_MINIFIED_SOURCE_SUFFIXES` (via `isMinifiedSourcePath`). Produced by
`scripts/scan-domain-facts.mjs` for issue #68.

**Why this doc exists, and not JSDoc.** The JSDoc on each table carries the
*label* (`AUDITED`, etc.) and its blast radius — that ships to consumers in
`dist/*.d.ts` and is not falsified by corpus growth. **This doc carries the
numbers** — corpus size, releases, occurrence counts, scan date — because a
count *is* falsified the day a 15th project appears. Keep the split: when a
future audit re-runs the scan, update the numbers here, not in JSDoc. Before
this doc existed, the corpus size was cited as three different numbers in
three files; one dated source of truth plus pointers is the fix.

Scan date: **2026-08-04**. Scanner: `scripts/scan-domain-facts.mjs`. Full raw
output is not committed (the corpus is machine-local — see
[Bounds](#bounds-what-this-cannot-prove)); the tables below are its roll-up.

- [Corpus inventory](#corpus-inventory)
- [Per-table findings](#per-table-findings)
- [Bounds: what this cannot prove](#bounds-what-this-cannot-prove)
- [What a corpus cannot audit at all](#what-a-corpus-cannot-audit-at-all)
- [A better validation channel: editor.construct.net](#a-better-validation-channel-editorconstructnet)
- [How to re-run](#how-to-re-run)

---

## Corpus inventory

14 projects, 0 skipped, 0 failed. Releases observed (`savedWithRelease`):
`37900, 38802, 39700, 40702, 44002, 44902, 47604, 49500`.

The corpus lives in machine-local working directories on one workstation
(some private) and is not reproducible from this repo — **labels and
releases only, no paths**:

| Label | Release | Sheets | ACEs | Images | Notes |
|---|---|---|---|---|---|
| burbank | 47604 | 177 | 25,261 | 8,448 | Overwhelming majority of the corpus's volume — see [Bounds](#bounds-what-this-cannot-prove) |
| c3addon-gcore-video-plugin (sample) | 47604 | 2 | 94 | 0 | |
| c3addon-genvid-datadog-browser-logs (sample) | 38802 | 1 | 8 | 0 | |
| c3addon-genvid-datadog-rum (sample) | 40702 | 1 | 11 | 0 | |
| c3addon-genvid-epic-online-services (sample) | 44902 | 3 | 189 | 1 | |
| c3addon-genvid-marketplace (sample) | 44002 | 1 | 3 | 0 | |
| c3addon-genvid-push-notification (sample) | 44002 | 1 | 13 | 0 | |
| c3addon-genvid-simpledropshadow (sample) | 40702 | 1 | 5 | 1 | |
| c3addon-youtube-video-plugin (sample) | 47604 | 2 | 69 | 0 | |
| c3-regtest (no-effect) | 49500 | 2 | 8 | 10 | |
| c3-tutorial | **37900** | 1 | 30 | 5 | Pre-r402: 5 image nodes with no `fileType` |
| construct3-poc | **39700** | 12 | 483 | 10 | Pre-r402: 10 image nodes with no `fileType` |
| construct3-sample (project/) | 49500 | 2 | 10 | 10 | **Also the canonical test fixture — not independent evidence** (see below) |
| ts-example | 39700 | 1 | 0 | 0 | |

Sheet/ACE columns sum to the roll-up totals below (207 sheets, 26,184 ACEs),
which is the cross-check that the per-project breakdown is complete.

**`construct3-sample/project` is not independent evidence.** It is the same
golden fixture c3source materializes into `test/fixtures/canonical/` and
validates against in its own test suite (ADR 0015, ADR 0019) — scanning it
here measures the fixture against itself, not an independent data point. It
is listed for completeness (it is a real, editor-round-tripped project on the
release axis) but should not be read as adding to the corpus's diversity.

**Pre-r402 projects.** `c3-tutorial` (release 37900) and `construct3-poc`
(release 39700) are the two projects saved before C3 introduced the image
`fileType` field; both carry image nodes with no `fileType` at all. See
[`IMAGE_FILE_TYPE_EXTENSIONS`](#image_file_type_extensions) below.

## Per-table findings

### `EVENTVAR_REFERENCE_ACES`

26,184 ACEs observed across 207 sheets / 8 releases. All 8 tabled ids were
observed and every one is keyed on the `variable` parameter (no tabled id
uses a different name-param key):

| id | occurrences | releases |
|---|---|---|
| `set-eventvar-value` | 859 | 39700, 44902, 47604 |
| `add-to-eventvar` | 99 | 37900, 47604, 49500 |
| `subtract-from-eventvar` | 25 | 47604 |
| `reset-eventvar` | 491 | 47604 |
| `set-boolean-eventvar` | 452 | 39700, 47604 |
| `toggle-boolean-eventvar` | 7 | 47604 |
| `compare-eventvar` | 675 | 39700, 47604, 49500 |
| `compare-boolean-eventvar` | 641 | 39700, 47604 |

**Two defects this audit found and fixed, both in the same table:**

1. **`reset-eventvar` was missing** — 491 occurrences in the corpus, entirely
   unaccounted for before this audit. A System ACE that resets an event
   variable to its initial value is exactly the kind of entry the table
   exists to hold; it had simply never been added.
2. **A fabricated entry, `is-boolean-eventvar-set`, was removed.** It did not
   correspond to a real C3 System ACE id — cross-checked against C3's own
   authoritative ACE table at `editor.construct.net` (see
   [below](#a-better-validation-channel-editorconstructnet)), not against the
   corpus, since a corpus scan can only confirm presence, never prove a
   non-existent id absent.

### `COMPARISON_OPERATORS`

2,451 `comparison` parameter occurrences across 8 releases. All values fall
in 0–5, none unmapped — **NO GAPS**.

| value | symbol | occurrences | releases |
|---|---|---|---|
| 0 | `=` | 1,606 | 39700, 44002, 44902, 47604, 49500 |
| 4 | `>` | 318 | 47604, 49500 |
| 1 | `≠` | 193 | 39700, 47604 |
| 2 | `<` | 134 | 47604 |
| 5 | `≥` | 113 | 47604 |
| 3 | `≤` | 87 | 37900, 47604 |

### `IMAGE_FILE_TYPE_EXTENSIONS`

8,485 image nodes across 8 releases:

| `fileType` | mapped? | occurrences | releases |
|---|---|---|---|
| `image/png` | yes | 8,458 | 40702, 44902, 47604, 49500 |
| `image/jpeg` | yes | 12 | 47604, 49500 |
| *(absent)* | — | 15 | 37900, 39700 |

Every **present** `fileType` maps to a known extension — the value-level scan
reports NO GAPS. But that framing would have missed the real defect: the
table's *shape* assumed every image node carries a `fileType` field, and 15
nodes in the corpus (all in releases 37900 and 39700, both pre-r402) carry
none at all. A value audit only asks "does the present value map?" — it
cannot surface a field that C3 doesn't emit yet. This was pinned to a precise
release boundary not by the corpus (which can only bracket the gap between
39700 and 40702) but by bisecting C3's own serializer source — see
[below](#a-better-validation-channel-editorconstructnet).

### `EDITOR_FIELD_RULES`

11,711 events observed across 8 releases; both rules pass on every instance:

| rule | pass | fail |
|---|---|---|
| `eventvar-comment-required` | 1,900 | 0 |
| `group-description-required` | 753 | 0 |

**NO FAILURES.** See [What a corpus cannot audit at all](#what-a-corpus-cannot-audit-at-all)
for why this result is expected and uninformative, and for the candidate
rules the same scan surfaced as untested hypotheses.

### `EDITOR_LOCAL_EXCLUSIONS` (via `isEditorLocalPath`)

11,971 files scanned across every corpus project. `.json` is the **only**
extension ever classified editor-local:

| extension | editor-local | source |
|---|---|---|
| `.png` | 0 | 8,692 |
| `.json` | 306 | 2,303 |
| `.ts` | 0 | 483 |
| `.webm` | 0 | 149 |
| `.jpg` | 0 | 12 |
| `.ttf` | 0 | 8 |
| `.html` | 0 | 5 |
| `.js` | 0 | 5 |
| `.css` | 0 | 2 |
| `.xml` | 0 | 2 |
| `.plist` | 0 | 1 |
| `.txt` | 0 | 1 |
| `.vtt` | 0 | 1 |
| *(none)* | 0 | 1 |

Consistent with the known exclusion rule
(`dirs={uistate,ts-defs} suffixes={.uistate.json} exactNames={tsconfig.json}`)
— no extension outside `.json` was ever flagged editor-local, and no
contradiction turned up.

### `C3_MINIFIED_SOURCE_SUFFIXES` (via `isMinifiedSourcePath`)

2,605 `.json` files scanned:

| | minified-suffix | not-minified-suffix |
|---|---|---|
| single-line | 2 | 300 |
| multi-line | 0 | 2,303 |

**NO CONTRADICTIONS.** The corpus holds exactly 2 `.brush.json` files
corpus-wide, and both are single-line — consistent with ADR 0018's minified,
project-source (not editor-local) framing.

## Bounds: what this cannot prove

This corpus is Genvid-authored and skews heavily toward
`c3addon-*/sample/` single-feature demo projects. One project, **burbank**,
holds 25,261 of 26,184 ACEs (~97%) and 8,448 of 8,485 image nodes (~99.5%) in
the entire corpus — the other 13 projects are, on every volume metric, a
rounding error next to it. 7 of the 14 projects have **zero** image nodes.

A scan like this **can find gaps; it can never prove completeness.** A table
can pass every check in this document and still be wrong about a C3 behavior
the corpus never exercises. And a corpus of *any* size cannot reveal
**configurability** on a dimension it is uniform on — that is exactly how the
literal string `"Functions"` slipped into a table as if it were a fixed C3
constant (issue #60; the real fact is the per-project `functionsName`
manifest setting, defaulting to `"Functions"`). Every scanned project used
the default, so breadth confirmed the *value* and concealed that it was a
*setting*. See ADR 0008's Consequences section for the fuller account of that
failure.

## What a corpus cannot audit at all

`EDITOR_FIELD_RULES` is a special case: every project in this corpus was
authored in the C3 editor and already loads successfully. A scan over such
projects sees which fields are **present**, never which the loader actually
**requires** — a field the editor always writes and never omits is
indistinguishable, by presence alone, from a field the loader doesn't care
about. Zero failures across 11,711 events is therefore the expected,
uninformative result; it is not evidence the two tabled rules are complete.

The scan's by-`eventType` "always-present" breakdown is a **candidate
superset**, not a verified rule set — record it as untested hypotheses:

| `eventType` | count | fields present on 100% of instances |
|---|---|---|
| `block` | 6,898 | `actions`, `conditions`, `eventType`, `sid` |
| `comment` | 691 | `eventType`, `text` |
| `custom-ace-block` | 179 | `aceName`, `aceType`, `actions`, `conditions`, `eventType`, `functionCategory`, `functionCopyPicked`, `functionDescription`, `functionIsAsync`, `functionParameters`, `functionReturnType`, `objectClass`, `sid` |
| `function-block` | 1,030 | `actions`, `conditions`, `eventType`, `functionCategory`, `functionCopyPicked`, `functionDescription`, `functionIsAsync`, `functionName`, `functionParameters`, `functionReturnType`, `sid` |
| `group` | 753 | `children`, `description`, `disabled`, `eventType`, `isActiveOnStart`, `sid`, `title` |
| `include` | 260 | `eventType`, `includeSheet` |
| `variable` | 1,900 | `comment`, `eventType`, `initialValue`, `isConstant`, `isStatic`, `name`, `sid`, `type` |

Two fields stood out as always-present but **not** in `EDITOR_FIELD_RULES`:
`function-block.functionDescription` and `custom-ace-block.aceName`. Both were
tested directly against the C3 editor in #70, and **they split**:

| Candidate | Corpus presence | C3 verdict |
|---|---|---|
| `variable.comment` *(positive control — already a rule)* | 1,900 / 1,900 | **rejected** — the editor *crashes* on open |
| `function-block.functionDescription` | 1,030 / 1,030 | **accepted** — optional, and not restored on save |
| `custom-ace-block.aceName` | 179 / 179 | **rejected** — *"Failed to open project"* |

`custom-ace-name-required` was added to `EDITOR_FIELD_RULES` as a result.

**The `functionDescription` result is the one to remember.** It is present on
*every* instance in the corpus and is nonetheless optional. So:

> **Corpus ubiquity is not evidence of a loader requirement.** The editor
> writes a field by default; that is not the loader demanding it.

This table is therefore a **hypothesis generator with a demonstrated
false-positive rate** — one of its two strongest candidates was wrong — not a
shortlist of probable rules. Read it as "worth testing", never as "probably
required", and treat a rule as real only once C3 itself has refused a file
without it. This is also the concrete justification for the table's
`NOT CORPUS-AUDITABLE` label: not a caveat, a measurement.

Note the diagnostics C3 gives are weak and inconsistent — a missing `comment`
crashes the editor outright, while a missing `aceName` produces a generic
dialog naming no field at all. Reporting the offending field and `jsonPath` is
most of what `validateForEditor` is for.

## A better validation channel: editor.construct.net

The single most reusable finding of this audit: **`https://editor.construct.net/r{NNN}/`
is a permanently-hosted, fetchable primary source for every C3 release**, and
for several of these tables it is strictly better evidence than corpus
scanning — it answers "what can C3 do" instead of "what did these 14
projects happen to do":

- `https://editor.construct.net/r{NNN}/plugins/allAces.json` and
  `https://editor.construct.net/r{NNN}/behaviors/allAces.json` are C3's own
  **authoritative ACE tables**. This is how `EVENTVAR_REFERENCE_ACES` was
  confirmed complete against the full System ACE set (not just the corpus's
  8 observed ids) and how the fabricated `is-boolean-eventvar-set` entry was
  proven not to exist, rather than merely unobserved.
- `https://editor.construct.net/r{NNN}/c3runtime/projectResources.js` holds
  the `.c3proj` serializer. **Bisecting it across releases pins exactly when
  a field appeared** — this is how the image `fileType` field's introduction
  was pinned to **r402**, a boundary the corpus could only bracket between
  39700 and 40702.
- The technique held up a second time in the same audit: `functionsName` was
  pinned to **r437** (r436 emits none; no `r436.x` sub-release exists), where
  the corpus could only say "somewhere after 40702 and by 44002". Two
  independent bracket-to-pin conversions is the argument for reaching here
  first.
- The same source confirmed `C3_DEFAULT_FUNCTIONS_NAME` and C3's own loader
  fallback (`fileType ?? "image/png"`) directly, rather than inferring them
  from what happened to be present in scanned projects. The r437 bundle
  carries `t.hasOwnProperty("functionsName") ? … : …("Functions")` verbatim —
  the default is C3's, not c3source's guess.

`construct.net`'s human-facing documentation is Cloudflare-gated against
automated fetch; `editor.construct.net` is not. For any future domain-fact
audit, check this source **before** reaching for a corpus scan — it proves
completeness where the corpus can only find gaps.

## Honesty note: a discrepancy in the image-node count

An earlier, exploratory probe run during this issue counted **8,473** image
nodes, 12 fewer than this scanner's **8,485** — a 12-node difference, all
`image/jpeg` on `TiledBackground` object types. The scanner (`scripts/scan-domain-facts.mjs`)
is the tool of record and **8,485 is the number to cite**; the earlier probe
used a slightly different extraction path and was not reconciled. Recording
this rather than silently picking one: if a future re-run lands on a third
number, this note is the signal that the discrepancy was already noticed and
not simply an accumulating drift.

## How to re-run

The scanner imports from `dist/`, not `src/`, and its corpus paths are
discovered at run time — no path is hardcoded here or in the script:

```sh
npm run build   # the scanner imports dist/, not src/
node scripts/scan-domain-facts.mjs $(ls /c/repos/*/project.c3proj /c/repos/*/*/project.c3proj | xargs -n1 dirname)
```

The scanner reports **partitions, not verdicts** — it is deliberately
dev-only tooling, not wired into CI (the corpus is machine-local, so it
*cannot* be). A `GAP` line in its output is a finding to read and reason
about, not a build failure; the maintainer produces the verdict, the same
governing rule `scripts/scan-references.mjs` follows for
`C3_PSEUDO_OBJECT_CLASSES`. On any future C3 version bump, re-run it against
whatever real, varied projects are available and update this doc's numbers —
never the JSDoc labels (see the top of this doc).

See issue #68 for the audit that produced this document.
