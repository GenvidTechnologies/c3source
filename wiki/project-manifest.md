---
type: reference
title: Project Manifest
description: c3source models project.c3proj with strict and tolerant parse paths that share one shape-rule collector, a byte-faithful serializer/writer, and structured drift detection covering missing/untracked/moved items, timeline transitions, image derivation, and stray files.
tags: [manifest, project.c3proj, drift-detection, c3-domain-facts]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide-manifest
    resource: ../raw/docs-api-guide-manifest-2026-08-20.md
    title: "docs/api-guide-manifest.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Project Manifest

`project.c3proj` is the JSON manifest at the root of every C3 folder-project.
It lists every layout, event sheet, script file, and asset the project
declares; c3source parses it into typed structures and detects when the
on-disk source tree has diverged from what the manifest declares — folder
projects only, not the single-file `.c3p` archive export[^api-guide-manifest].
`C3ProjectManifest` models the whole document: `objectTypes`, `layouts`,
`eventSheets`, `timelines`, `flowcharts`, `families`, and `models3d` are each
a `C3NameFolder` (`items`, `subfolders`, optional `name`); `rootFileFolders`
holds the seven `C3FileFolder` categories (`script`, `sound`, `music`,
`video`, `font`, `icon`, `general`), each entry a `C3FileEntry` (`name`,
`type`, `sid`, plus forward-compatible unknown keys); `containers` is a flat
array of `C3Container` (`members: string[]`) declared inline with no on-disk
folder[^api-guide-manifest].

## Strict vs. tolerant parsing

`project.c3proj` is parsed strictly by `parseProjectManifest(json)`/
`readProjectManifest(path)`. The tolerant counterpart,
`parseProjectManifestTolerant(json)`/`readProjectManifestTolerant(path)`,
returns a `ManifestReadResult: {manifest, issues}` instead of throwing on
shape violations[^claude-md]. `manifest` is the **same object by identity**
as the tolerant parse produced — never cloned or projected — so mutating it
in place and passing it to `writeProjectManifest` preserves round-trip
byte-fidelity; `issues` is every violation
`validateProjectManifest(json): ManifestValidationIssue[]` (the standalone,
never-throwing detector) found[^api-guide-manifest].

Both the strict and tolerant paths are thin callers of **one private shape-rule
collector**, so a shape rule is added once and neither path can drift from
the other[^claude-md]. `parseProjectManifest` throws using the collector's
**first** violation; `parseProjectManifestTolerant` returns every violation.
Each `ManifestValidationIssue` carries a `path` (e.g.
`"usedAddons[0].author"`, `""` for the root), a `rule: ManifestShapeRuleId`
(a string-literal union, one id per shape check, e.g.
`"saved-with-release-number"`, `"used-addon-author"`, `"file-entry-sid"`),
and the exact `message` text `parseProjectManifest` throws — filtering
`issues` by `rule` turns "tolerant" into "tolerant except these specific
rules"[^api-guide-manifest].

**Two documented throw exceptions in tolerant mode** — tolerance is scoped to
field-level shape, not "is this a manifest at all," and not I/O: a
non-object top level still throws (there is no document to hand back), and
`readProjectManifestTolerant` propagates `ENOENT`/`SyntaxError` unchanged,
exactly like `readProjectManifest`[^api-guide-manifest]. See [ADR
0017](/decisions/0017-tolerant-manifest-read.md) for the full
rationale.

## Serialization and writing

`serializeProjectManifest(m)`/`writeProjectManifest(path, m)`, built on the
`src/serialize.ts` leaf, complete the round trip — see [Serialization
Form](/serialization-form.md) for the tab-indented, no-trailing-newline write
form this shares with every other C3 source file[^claude-md]. Neither
function validates: a validating writer would reject exactly the repair
workflow tolerant reads exist for — writing back a manifest that was read
tolerantly, partially fixed, and still doesn't fully conform — so calling
`validateProjectManifest` first is the caller's own choice, not an implicit
gate[^api-guide-manifest]. **Byte-fidelity depends on mutating the same
object in place**, not rebuilding via nested spreads, which reorders keys and
drops unmodeled fields[^api-guide-manifest]. Close the project in the C3
editor before writing `project.c3proj` externally — if the project is open,
the editor's own next save clobbers the write, and c3source cannot detect or
prevent this[^api-guide-manifest].

## Mapping tables

`C3_SECTION_FOLDERS` maps each name-folder manifest key to its on-disk
folder name (`layouts`, `eventSheets`, `objectTypes`, `timelines`,
`flowcharts`, `families`, `models3d` — every section uses flat
`<Name>.json` files in named organizational subfolders, confirmed by real
export including `objectTypes`, which has no per-type directory).
`C3_ROOT_FILE_FOLDERS` maps each `rootFileFolders` category to its on-disk
source folder, with a deliberate singular-to-plural naming shift (`script`→
`scripts`, `icon`→`icons`, both fixture-confirmed; `sound`, `music`,
`video`, `font`, `general` follow the same pattern but are inferred, not
fixture-validated against a project with those assets populated)[^api-guide-manifest].

`SCRIPT_FILE_TYPE_EXTENSIONS` maps a script `C3FileEntry.type` MIME
(`application/javascript`→`.js`, `application/typescript`→`.ts`) to its
on-disk, dotted extension — the script-source counterpart of
`IMAGE_FILE_TYPE_EXTENSIONS` (below), with one deliberate behavioral
difference: **an unmapped MIME here is a silent miss, never a throw**, unlike
`IMAGE_FILE_TYPE_EXTENSIONS`, which throws on an unmapped MIME[^claude-md].
C3 derives both the extension and the MIME from a single ternary, so exactly
two script languages exist; `.ts` is only recognized from C3 release r433
onward[^api-guide-manifest].

## Canonical walks and their thin collectors

`collectManifestItemNames`/`collectManifestFileNames` are thin consumers of
the canonical walks `walkManifestNameTree`/`walkManifestFileTree` — no
parallel recursion[^claude-md]. Both recurse into `subfolders` in
depth-first order; `collectManifestItemNames` returns item strings (layout
names, event sheet names), `collectManifestFileNames` returns file `name`
fields (filenames like `"main.ts"`)[^api-guide-manifest].

## Drift detection

`detectManifestDrift(projectDir, manifest?)` compares declared membership
against on-disk source (editor-local files filtered via `isEditorLocalPath`)
and returns `ManifestDrift: {sections, inSync, degraded?, strays?}`. Each
`SectionDrift` carries `entries: DriftEntry[]` — a structured list where
every entry has a `kind` (`missing` | `untracked` | `moved` |
`folder-missing` | `folder-untracked` | `dangling-ref`) and path-segment
arrays (`manifestPath`, `diskPath`) locating the item within the subfolder
nesting without re-walking[^claude-md].

| Kind | `manifestPath` | `diskPath` | Meaning |
|---|---|---|---|
| `missing` | path in manifest | — | Declared in manifest; no file on disk |
| `untracked` | — | path on disk | File on disk; not declared in manifest |
| `moved` | path in manifest | path on disk | Same name, different subfolder on each side |
| `folder-missing` | path in manifest | — | Subfolder declared; not on disk |
| `folder-untracked` | — | path on disk | Subfolder on disk; not declared |
| `dangling-ref` | `["#<i>"]` (container index) | — | Container member names a non-existent object type |

Name-section disk walks use `walkDiskNameTree` (recursive,
`readdirSync`-based, section-root-relative paths). File-folder disk walks
use `walkDiskFileTree`, which recurses **manifest-declared subfolders
only** — so an undeclared generated subtree like `scripts/ts-defs/` is
never visited, without needing an explicit exclusion for it[^claude-md][^api-guide-manifest].

`diffNameMaps` is the diff engine underneath `detectManifestDrift`: it
builds `name → path` maps per side and emits `missing`/`untracked`/`moved`
entries — a **same-name/different-path leaf is a move, not a delete-plus-add**,
exploiting per-category name uniqueness, a real C3 invariant[^claude-md].

### Containers drift

`containers` are declared inline with no on-disk folder. `detectManifestDrift`
performs a referential-integrity check: any container member naming an
object type absent from the manifest is a `dangling-ref` entry, with
`manifestPath` carrying `["#<i>"]` so the caller can locate which container
holds the stale reference. This is drift's **only** reference check — drift
stays membership-only otherwise; reference integrity beyond containers lives
in a separate module (see the future reference-integrity page in this
wiki)[^api-guide-manifest].

## The timeline `transitions/` exception

C3 serializes a timeline's `transitions/` directory (shown as **"Eases"** in
the editor) as an **unnamed** subfolder under `timelines` in `project.c3proj`
— a `{items, subfolders}` node with no `name` key. This is the **one place**
a nameless manifest subfolder is meaningful, not degenerate[^claude-md].
`TIMELINE_TRANSITIONS_FOLDER` (`"transitions"`) is the exported C3 domain
fact naming it; the manifest walks `walkManifestNameTree`/
`collectManifestFolderPaths` take an optional `unnamedSubfolderName` that
names a nameless **top-level** subfolder (not propagated into recursion — a
direct child of the section root only, matching C3, where transitions is
always a direct child). `detectManifestDrift` passes it for
`section === "timelines"` so a timeline-with-transitions project round-trips
without false `moved`/`folder-*` drift (issue #28)[^claude-md].

**The model itself stays faithful** — the subfolder stays unnamed; the
synthetic name lives only in the drift comparison, never written back. But
c3source now owns the manifest serializer and writer, which makes this
**more load-bearing than it used to be**: previously this was a read-only
observation, but now, emitting the unnamed `timelines/transitions` form
correctly remains the consumer's job — a naive sync that materializes the
synthetic name (e.g. writing back `TIMELINE_TRANSITIONS_FOLDER` as an actual
`name` field) **corrupts the manifest**, a real write hazard that did not
exist before writing was possible[^claude-md].

## Image-derived drift

`detectImageDrift(projectDir)` is a best-effort sub-detector that
`detectManifestDrift` appends to its sections, wrapped in try/catch — a
throw degrades to "images section omitted," never failing core drift. The
degradation is **reported, not swallowed**: the catch records a
`DriftDegradation {section, message}` on `ManifestDrift.degraded`, so a
caller can tell "images verified, no drift" apart from "image verification
threw and was discarded" — previously indistinguishable[^claude-md].
`inSync` stays `sections.length === 0` (a degradation is not drift), and
`C3Project.detectImageDrift()` still throws on a direct call, since that
*is* the caller's request[^claude-md].

Unlike the manifest walks, image drift **ignores the manifest**: it walks
`objectTypes/` and the flat `images/` folder directly and diffs
derived-expected vs. on-disk filenames. `deriveExpectedImages(objectType):
ExpectedImage[]` (`{stem, ext?, context}`) is the structured primitive;
`deriveExpectedImageNames(objectType): string[]` is a thin renderer over it
that fills a missing `ext` with `C3_LEGACY_IMAGE_EXTENSION` (`.png`)[^api-guide-manifest].
Extensions come from each image member's `fileType` MIME via
`IMAGE_FILE_TYPE_EXTENSIONS` (`image/png`→`.png`, `image/jpeg`→`.jpg`,
`image/svg+xml`→`.svg`, `image/webp`→`.webp`)[^api-guide-manifest].

### Absent vs. unmapped `fileType`

These are **not** the same failure mode, and no longer share a behaviour
(issue #68):

- **Absent `fileType`** — C3 releases **before r402** serialize image nodes
  with no `fileType` field at all, though the on-disk file is a perfectly
  ordinary image. The pin is exact: bisecting the editor's own serializer
  across `editor.construct.net/r{397…407}/projectResources.js` shows
  `fileType` first emitted at **r402**, with no `r401.x` sub-release. This
  case is **not** treated as malformed: `ExpectedImage.ext` is `undefined`,
  and `C3_LEGACY_IMAGE_EXTENSION` (`.png`) is what c3source assumes — not a
  guess, since C3's own project loader applies the identical fallback
  (`fileType ?? "image/png"`, unchanged from r402 through r447), so
  c3source matches the editor's own documented fallback rather than
  inventing one[^claude-md].
- **Present but unmapped `fileType`** (e.g. `image/gif`) is still an error:
  `deriveExpectedImages`/`deriveExpectedImageNames` throw `unknown image
  fileType "..."`[^api-guide-manifest].

**Two APIs, two contracts over the same absent-`fileType` case:**
`deriveExpectedImageNames` must always answer with a concrete filename, so
an absent `fileType` renders as `${stem}${C3_LEGACY_IMAGE_EXTENSION}`.
`detectImageDrift` must never *fabricate* a finding from that default, so it
calls `deriveExpectedImages` directly and matches an entry with a known
`ext` exactly on `<stem><ext>`, but matches an entry with `ext: undefined`
on its **stem alone** against on-disk filenames — only if nothing on disk
shares the stem does it fall back to the legacy extension, which then
correctly reports as `missing`. `detectImageDrift` is strictly the more
conservative of the two: the labelled default can never manufacture drift on
its own[^api-guide-manifest]. See [ADR
0023](/decisions/0023-pre-r402-image-serialization-drift-degradation.md).

Do not read `exportFormat` as a format proxy anywhere — it is an export
re-encoding setting (`"lossless"`/`"lossy"`), not the source MIME: a real
corpus project carries `exportFormat: "lossy"` on 8,448 nodes whose actual
source format is `image/png`[^api-guide-manifest].

## Stray files

`detectStrayFiles(projectDir)` is the exact complement of
`find_all_section_items_path` over the same seven `C3_SECTION_FOLDERS`
walks: a non-editor-local file under a name-section root that fails
`isSectionItemName` is a `StrayFile` (`section`, `folder`, `name`,
`diskPath` — deliberately **no** `manifestPath`, since a stray has no
manifest position to map)[^claude-md]. It is **manifest-independent** —
reads no `project.c3proj`, takes none — and scoped to the seven name
sections only; `scripts/`/`images/`/other root file folders are out of
scope by design, since file-folder membership is extension-agnostic and
there is no item-hood rule for a stray to violate there[^claude-md].

`detectManifestDrift` appends the result as the optional
`ManifestDrift.strays?` field, populated only when non-empty — the same
convention as `degraded`, so a clean project's result stays byte-identical
to a pre-2.0.0 one. **A stray is never drift** — `inSync` and `DriftKind`
are both unaffected[^claude-md]. `C3Project.detectStrayFiles()` wraps it,
passing **no** manifest — unlike its `detectManifestDrift()`/
`detectReferenceIntegrity()` siblings, it works even when `project.c3proj`
is missing or malformed[^claude-md]. Filtering a known downstream
convention (e.g. a generator's own `.dsl.txt` sidecar) is the caller's
policy, applied with a one-line filter over the result — c3source reports
every non-item file and filters nothing itself[^api-guide-manifest]. See
[ADR 0025](/decisions/0025-section-item-hood-and-stray-files.md).

## Related

- [Layout Traversal](/layout-traversal.md) — the item-hood axis (`isSectionItemName`) that defines what counts as a section item vs. a stray.
- [Module Architecture](/module-architecture.md) — where `manifest` sits in the module DAG, as one of three mutually-independent siblings above `layouts`.
- [C3Project Handle](/c3project-handle.md) — the root-bound handle wrapping `manifest()`, drift detection, and the write surface.
- [Serialization Form](/serialization-form.md) — the on-disk write form `writeProjectManifest` reproduces.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide-manifest]: docs/api-guide-manifest.md (c3source API guide, 2026-08-20 capture)
</content>
