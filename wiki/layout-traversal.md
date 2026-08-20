---
type: reference
title: Layout Traversal
description: find_all_files_path is the single canonical recursive disk walk underneath c3source's layout, section-item, and script-source collectors, with provenance, reachability, and item-hood kept as three deliberately orthogonal axes, plus the layer-visitor mutation contract built on the same walk pattern.
tags: [traversal, layouts, filesystem, c3-domain-facts]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide
    resource: ../raw/docs-api-guide-2026-08-20.md
    title: "docs/api-guide.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Layout Traversal

## `find_all_files_path`: the single canonical walk

`find_all_files_path(dir, predicate, descend?)` is the exported generic
primitive that owns recursion over a project directory: it owns the
recursive descent itself, the `uistate/` skip, and the per-level
`readdirSync().sort()` ordering. Every named collector (`find_all_layouts_path`,
`find_all_eventsheets_path`, `find_all_objectTypes_path`, and the rest) is a
thin wrapper over it[^claude-md]. It skips `.uistate.json` files and never
descends into `uistate/` subfolders — a folder C3 r487+ writes alongside
layouts, object types, and event sheets[^claude-md].

It is exported precisely so a downstream tool can discover non-source
artifacts (e.g. a generator's own `.dsl.txt` sidecar files) through the same
walk, instead of maintaining a second, parallel collector that silently
drifts the next time a skip-rule is fixed here — this was issue #16's
motivation[^claude-md].

A directory walk over a C3 project must answer three genuinely orthogonal
questions, each owned by its own predicate, each deliberately declining to
answer the other two[^api-guide]:

| Axis | Question | Owner |
|---|---|---|
| Provenance | Is this file C3 source, or an editor-local artifact? | `isEditorLocalPath` |
| Reachability | May the walk enter this directory at all? | `find_all_files_path`'s `descend` parameter |
| Item-hood | Is this file an item of the section it sits in? | `isSectionItemName` |

## Axis 1: provenance — `isEditorLocalPath`

The one canonical definition of "editor-local vs. C3 source" is
`isEditorLocalPath(name: string): boolean`, backed by the exported table
`EDITOR_LOCAL_EXCLUSIONS: {dirs, fileSuffixes, exactNames}`. All four former
inline skip sites — the `uistate/` directory check in `find_all_files_path`
plus the `.uistate.json` suffix checks in the three originally
hand-written named collectors — now consume this one classifier uniformly
(issue #19)[^claude-md].

`isEditorLocalPath` accepts a bare basename (no path separator) and returns
`true` if that name matches any excluded directory, exact filename, or
suffix — one call replaces every skip site uniformly[^api-guide]. If a
future C3 release introduces a new editor-local convention, add it to
`EDITOR_LOCAL_EXCLUSIONS` and every call site inherits the change
automatically; the predicate should never be inlined at a new call
site[^api-guide].

This classifier is provenance-only — source vs. editor-local — and
serialization form is deliberately not a membership criterion: see [ADR
0018](/decisions/0018-brush-json-minified-source-not-editor-local.md)
and [Serialization Form — the minified-source exception](/serialization-form.md)
for the `*.brush.json` case this deliberately excludes[^claude-md].

## Axis 2: reachability — the `descend` parameter

`isEditorLocalPath` used to answer two different questions with one
predicate: "is this directory C3 source?" and "may a disk walk enter it?"
Because `ts-defs` is in `EDITOR_LOCAL_EXCLUSIONS.dirs`,
`scripts/ts-defs/**` was unreachable through `find_all_files_path` no matter
what `predicate` a caller passed — the directory-descent rule was hardcoded,
not merely defaulted[^api-guide].

The optional third parameter, `descend`, controls directory reachability
separately from `predicate`'s file selection, defaulting to the same
editor-local rule. `ts-defs` — named via the exported
`C3_TS_DEFS_FOLDER` constant — was otherwise unreachable, which blocked a
downstream consumer that needed its `.d.ts` files[^claude-md]. Overriding it
disables inherited editor-local classification for the entered subtree, so
`EDITOR_LOCAL_EXCLUSIONS`/`isEditorLocalPath` themselves stay unchanged — only
reachability, not classification, became overridable[^claude-md]:

```ts
const tsDefs = find_all_files_path(
  scriptsDir,
  (name) => name.endsWith(".d.ts"),
  (dirname) => dirname === C3_TS_DEFS_FOLDER || !isEditorLocalPath(dirname),
);
```

Overriding `descend` disables inherited editor-local classification for the
entered subtree — the caller's `predicate` becomes the only filter, and it
will see bare basenames `isEditorLocalPath` would normally flag (e.g.
`objects.d.ts`, `Main Layout.instancesBar.json`). Write the `predicate`
defensively if the opened subtree could contain such names[^api-guide]. See
[ADR 0020](/decisions/0020-caller-controlled-walk-descent.md) (issue
#63) for why the classifier itself stayed unchanged and only reachability
became overridable[^claude-md]. A named `ts-defs` collector wrapper was
deliberately not added on the same pass — that is deferred until a second
call site exists, not an oversight.

## Axis 3: item-hood — `isSectionItemName` and `find_all_section_items_path`

`C3_SECTION_ITEM_EXTENSION = ".json"` is the exported C3 domain fact naming
the on-disk extension every item of a `C3_SECTION_FOLDERS` name section
carries. `isSectionItemName(name)` tests a bare basename against it,
case-sensitively — unlike `isScriptSourceName`'s case-insensitive match,
because C3's lowercasing-before-testing rule is unverified for `.json`, and
matching case-insensitively here would silently widen every consumer with
no evidence backing the widening[^claude-md].

`find_all_section_items_path(dir)` is the single owner of the combined
item-hood-plus-provenance policy — `isSectionItemName(file) &&
!isEditorLocalPath(file)`, built on `find_all_files_path`. All seven
name-section finders — `find_all_eventsheets_path`, `find_all_layouts_path`,
`find_all_objectTypes_path`, and the four `C3Project` finders for families,
timelines, flowcharts, and 3D models — are thin consumers of it, so the
policy cannot drift between sections again[^claude-md].

Explicitly excluded from this axis: `findAllScripts` ([ADR
0024](/decisions/0024-script-source-fact-and-dotted-extensions.md))
and `findAllAddons` (`.c3addon`). Both already had a correct,
section-specific item-hood rule of their own before item-hood was
generalized[^api-guide].

### The 2.0.0 narrowing, and how to recover the old behaviour

Narrowed in 2.0.0 — `find_all_layouts_path`/`find_all_objectTypes_path`
previously returned every non-editor-local file regardless of extension.
This was inherited drift from three independently hand-written functions,
not a deliberate design decision — the other five name-section finders
already filtered to `.json`, and `README.md` had documented `.json` for all
seven the whole time[^claude-md][^api-guide]. 2.0.0 makes the two
permissive finders delegate like their five siblings always did — a
breaking change in behaviour, not signature[^claude-md].

The pre-2.0.0 permissive result set is recoverable verbatim:

```ts
import { find_all_files_path, isEditorLocalPath } from "@genvidtech/c3source";

// Everything under dir, no filtering at all:
find_all_files_path(dir, () => true);

// The exact pre-2.0.0 find_all_layouts_path / find_all_objectTypes_path
// behavior — every non-editor-local file, regardless of extension:
find_all_files_path(dir, (f) => !isEditorLocalPath(f));
```

See [ADR 0025](/decisions/0025-section-item-hood-and-stray-files.md)
for the full rationale, including why a non-`.json` file under a name
section is now reported as a diagnostic (`detectStrayFiles`, see [Project
Manifest — Stray files](/project-manifest.md)) rather than silently dropped
or silently included[^api-guide].

## Script source classification

C3 accepts two script languages under `scripts/` — JavaScript and
TypeScript — and its own folder-project reconcile treats a `.js` file as
generated build output, not authored source, whenever a same-basename
`.ts` file sits beside it[^api-guide].

`SCRIPT_SOURCE_EXTENSIONS` (`[".js", ".ts"]`) is the exported C3 domain fact
naming the extensions C3 accepts as authored script source under `scripts/`.
`isScriptSourceName(name)` tests a bare basename against it
case-insensitively and additionally excludes `.d.ts` — `ts-defs/`, where
generated declarations live, is already pruned by directory (Axis 2 above),
so the `.d.ts` suffix check only ever fires on a stray hand-authored `.d.ts`
sitting loose directly under `scripts/`[^claude-md].

`isGeneratedScriptOutput(name, siblings)` is C3's own folder-project
reconcile rule, not a heuristic: a `.js` file is treated as generated
build output when `siblings` (bare basenames from the same directory)
contains a same-basename `.ts` file. A `.ts` file is never treated as
generated, regardless of any `.js` sibling[^api-guide].

`filterAuthoredScriptPaths(paths)` applies that rule per-directory over a
`find_all_files_path` result — grouping by directory first, so a `.js` in
one directory is never cancelled by a same-basename `.ts` in another —
dropping every generated `.js` while preserving input order[^claude-md][^api-guide].
See ADR 0024 (issues #73, #74) for the design rationale and
[C3Project Handle — file finders](/c3project-handle.md) for how
`findAllScripts` composes these three primitives.

## The layer-visitor contract

The key pattern: a `LayerVisitor` returns a mutation count (a number) and
an `InstanceVisitor` returns a changed boolean; `visit_layers_in_layout`
sums the counts and rewrites the layout file only when the total is greater
than 0[^claude-md]. Visitors that mutate in-place must report the mutation
via their return value, or the change is silently dropped on write.

Full layer names are `LayoutName.LayerName`; layers flagged `global` reset
the prefix to `global` instead of concatenating[^claude-md].

The single recursive traversal underneath every layer-visiting function lives
in one internal generator, `walkLayerEntries`. It yields a `LayerEntry` per
layer: bare `name`, dotted/global-resetting `fullName`, root-first
`ancestors` chain, sibling `parent` array, and `index`[^claude-md]. The
in-memory `visitLayers`/`visitLayout`/`visitInstances` and the early-exit
finder family `findLayer`/`findLayerEntry`/`findLayerByName`/`findLayerEntryInLayout`
(which stop on the first predicate hit) are all thin consumers of that one
generator; the file-based `visit_*_in_layouts` functions wrap the in-memory
visitors with the read, parse, visit, write-if-count-greater-than-zero
cycle above[^claude-md].

The walk is fully recursive through `subLayers` — an earlier version of
this walk descended only one level, so consumers now see nested layers a
shallow walk previously skipped[^claude-md].

## Related

- [Module Architecture](/module-architecture.md) — where `layouts` sits in the module DAG (directly above `serialize`).
- [Project Manifest](/project-manifest.md) — `C3_SECTION_FOLDERS`/`C3_ROOT_FILE_FOLDERS` and stray-file detection built on this axis structure.
- [C3Project Handle](/c3project-handle.md) — the `findAll*` finders that wrap these primitives against a project root.
- [Serialization Form](/serialization-form.md) — the minified-source exception, orthogonal to provenance.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide]: docs/api-guide.md (c3source API guide, 2026-08-20 capture)
</content>
