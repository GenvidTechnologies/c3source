# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`c3source` is a TypeScript library of typed interfaces and traversal/formatting
functions for **Construct 3 (C3) project source files on disk** — layouts,
layers, instances, object types, and event sheets. It is consumed by build
tools, code generators, and analyzers that inspect or mutate C3 JSON outside
the C3 editor. There is no runtime application; it ships as a library.

## Design records & branches

Feature branches are squashed on merge, and work documents under
`docs/superpowers/` (specs, plans) are routinely cleaned up — treat them as
ephemeral scaffolding, not durable records. The root `plan.md` produced by the
`plan-task` workflow is the same, and in this repo it is **gitignored**
(`/plan.md`): it stays a **local-only working artifact** — never committed, so
there is no prep commit and nothing to remove at PR creation. (`plan-task`
detects this via `git check-ignore plan.md` and skips the prep commit.) This
keeps a stale `plan.md` from ever leaking onto `main` and misleading a later
session into reading the wrong plan. The durable record of a design or
decision is the **GitHub issue or PR** (post the spec as an issue comment or in
the PR body, where it survives the squash) — and the PR body should be a concise
summary linking to real docs, not a paste of the design spec. For
**architecture and trade-off decisions** specifically, the durable in-repo
record is an **ADR under `docs/decisions/`** (MADR-lite, authored via
`/gvt-dev:create-adr` and indexed in `docs/TOC.md` under *Decision Records*):
the ADR's **Compromise** section preserves the rejected-alternatives rationale a
squashed PR body would otherwise lose, complementing — not replacing — the
issue/PR record. ADRs 0001–0010 were backfilled from commit history on
2026-07-17. Never cite an unpushed local branch or commit hash in external
communication (issue/PR comments) — link to something the reader can actually
open, or push first.

## Commands

Package manager is **npm** (Node >= 22). All checks below run in CI and must pass.

```sh
npm install
npm run lint        # eslint, --max-warnings 0 over src/ and test/ (test/fixtures/ excluded)
npm run typecheck   # tsc against tsconfig.test.json (src + test, excluding test/fixtures/), --noEmit
npm run test        # mocha + tsx, runs test/**/*.test.ts
npm run build       # tsc -> dist/ (the published artifact)
```

The full validation gate is the **`.gvt-agent.json` `commands.validate`**
chain (`npm run lint && npm run typecheck && npm run test && npm run build`),
**not** an npm script — there is no `npm run validate`.

Run a single test file or filter by name:

```sh
npx mocha --timeout 5000 --import=tsx --require ./test/setup.ts test/extractEventSheetScripts.test.ts --exit
npx mocha --timeout 5000 --import=tsx --require ./test/setup.ts 'test/**/*.test.ts' --grep "scope" --exit
```

Tests use **mocha + chai** with `tsx` for on-the-fly TS execution (no build
step needed). `test/setup.ts` is a mocha root hook that silences `console.log`
and `console.debug` during runs (warn/error pass through), so library code may
log freely.

## Architecture

Logic is split across seven per-area modules — `src/serialize.ts`,
`src/layouts.ts`, `src/eventSheets.ts`, `src/manifest.ts`, `src/addons.ts`,
`src/references.ts`, `src/project.ts` — imported in an acyclic DAG.
`serialize` is the sole leaf (it imports nothing from the package); `layouts`
imports only `serialize`; `eventSheets`, `addons`, and `manifest` all import
only `layouts` (`manifest` additionally imports `serialize`, for its write
path) and are mutually independent siblings; `references` sits one tier above
that sibling group, importing `layouts`, `eventSheets`, `addons`, and
`manifest`; `project` imports all of the above. `src/c3source.ts` is a thin
internal re-export barrel over the seven (`export *` from each, in DAG order
— serialize, layouts, eventSheets, manifest, addons, references, project);
`src/index.ts` is unchanged and still re-exports it (`export * from
"./c3source.js"`), so the public API surface did not move. See [ADR
0012](docs/decisions/0012-per-area-module-split.md) for the split rationale
(it supersedes the module-layout half of [ADR
0001](docs/decisions/0001-single-module-esm-library.md)); [ADR
0016](docs/decisions/0016-c3-source-json-serialization-form.md) adds
`serialize` beneath `layouts` as the new leaf; [ADR
0021](docs/decisions/0021-reference-integrity-detection.md) adds `references`
as the new tier beneath `project`. The `.js`
extension on intra-package imports is required — the project is ESM
(`"type": "module"`, `NodeNext` resolution). The package `main`/`types`/`exports` point at the built
`dist/*.js` and `dist/*.d.ts` — the same artifacts the `files` allowlist
ships — so a consumer resolves exactly what gets published. (`prepack` builds
`dist/` before any `npm pack`/`npm publish`.) Do **not** reintroduce the old
pnpm-style trick of pointing entry points at `src/*.ts` and rewriting them via
`publishConfig.{main,types,exports}`: npm — unlike pnpm/yarn — ignores those
manifest-field overrides, so the `src/` paths leak into the tarball and break
every consumer (this was issue #8, fixed in 0.3.1). `scripts/verify-package.mjs`
runs in `prepack` and fails the pack if any entry point is missing or falls
outside `files`.

A second, **dev-only** verification script sits alongside it:
`scripts/api-surface.mjs` (added #47, not wired to CI) dumps the **public export
surface** — every name reachable from the built `dist/index.d.ts` via the TS
checker (`getExportsOfModule`, following `export *` chains + alias re-exports),
one sorted `name | flags | canonicalized-declaration-text` line each. Diff two
builds' dumps to prove a change keeps the API **byte-identical**: this was how
the #47 module split (`src/c3source.ts` → per-area modules) was verified, and it
is the check to reach for on any future API-preserving refactor or release.
Crucially it captures the type-only exports (interfaces/type aliases) that a
runtime `Object.keys(dist/index.js)` diff cannot see — run the two as a
value-vs-type pair.

**The declaration text includes JSDoc**, so "byte-identical dump" is a
stronger claim than "identical API": a **comment-only** edit to a member of an
exported interface moves the dump even though no signature changed. ADR 0012
and ADR 0017 both cite an *exactly-empty* diff as their purity proof, which
held only because those refactors happened not to touch JSDoc — a
doc-carrying PR has no such luxury and will show entries that look like scope
leaks but are prose. (#63 hit exactly this: the predicted two-line delta came
back as three, the extra one being `C3Project` after `findAllScripts`'s
comment was corrected.) When a change deliberately touches comments, strip
JSDoc blocks from both dumps and re-diff to isolate real signature changes —
e.g. `sed -E 's#/\*\*[^*]*\*+([^/*][^*]*\*+)*/##g'` over each dump before
`diff`. Reserve the empty-diff standard for refactors that leave comments
alone.

Four functional areas:

1. **Layout traversal** (in `src/layouts.ts`) — recursive `find_all_*_path` collectors (skip
   `.uistate.json` files and never descend into `uistate/` subfolders, which
   C3 r487+ writes alongside layouts/object-types/event-sheets) plus visitor
   walkers. The **one canonical definition** of "editor-local vs C3 source" is
   `isEditorLocalPath(name): boolean` backed by `EDITOR_LOCAL_EXCLUSIONS: {dirs, fileSuffixes, exactNames}`;
   all four former inline skip sites (the `uistate/` directory check in
   `find_all_files_path` plus the `.uistate.json` suffix checks in the three
   named collectors) now consume it uniformly (#19). This classifier is
   **provenance-only** — source vs. editor-local — and serialization form is
   deliberately not a membership criterion (see [ADR
   0018](docs/decisions/0018-brush-json-minified-source-not-editor-local.md)).
   The named collectors are thin wrappers over the exported generic
   primitive `find_all_files_path(dir, predicate, descend?)` — the single recursive walk
   that owns the recursion, the `uistate/` skip, and the per-level
   `readdirSync().sort()` ordering. It is exported so downstream can discover
   non-source artifacts (e.g. generated `.dsl.txt` files) through the same walk
   instead of maintaining a parallel collector that drifts on the next skip-rule
   fix (issue #16); its `predicate` receives the bare basename. The optional
   third parameter, `descend`, controls directory *reachability* separately
   from `predicate`'s file selection, defaulting to the same editor-local rule
   (`ts-defs` — named via the exported `C3_TS_DEFS_FOLDER` — is otherwise
   unreachable, which blocked a downstream consumer needing its `.d.ts`
   files); overriding it disables inherited editor-local classification for
   the entered subtree, so `EDITOR_LOCAL_EXCLUSIONS`/`isEditorLocalPath`
   themselves are unchanged (see [ADR
   0020](docs/decisions/0020-caller-controlled-walk-descent.md), #63). The key
   pattern: a `LayerVisitor`
   returns a _mutation count_ (number) and an `InstanceVisitor` returns a
   _changed_ boolean; `visit_layers_in_layout` sums the counts and **rewrites
   the layout file only when the total is > 0**. So visitors that mutate
   in-place must report it via the return value or the change is silently
   dropped. Full layer names are `LayoutName.LayerName`; layers flagged
   `global` reset the prefix to `global`. The single recursive traversal lives
   in one internal generator, `walkLayerEntries` (it yields a `LayerEntry` per
   layer: bare `name`, dotted/global-resetting `fullName`, root-first
   `ancestors` chain, `parent` sibling array, `index`). The in-memory
   `visitLayers`/`visitLayout`/`visitInstances` and the early-exit finder family
   `findLayer`/`findLayerEntry`/`findLayerByName`/`findLayerEntryInLayout` are
   all thin consumers of that one generator (the finders stop on the first
   predicate hit); the file-based `visit_*_in_layouts` wrap the visitors
   (read → parse → visit → write-if-count>0). The walk is **fully recursive**
   through `subLayers` (an earlier version descended only one level), so
   consumers see nested layers a shallow walk previously skipped.
   **Project manifest** (in `src/manifest.ts`) — the `project.c3proj` file in the project root (folder
   format only; not the single-file archive) is modeled by `C3ProjectManifest`
   and parsed strictly by `parseProjectManifest(json)`/`readProjectManifest(path)`.
   The tolerant counterpart, `parseProjectManifestTolerant(json)`/
   `readProjectManifestTolerant(path)`, returns a `ManifestReadResult:
   {manifest, issues}` instead of throwing on shape violations — `manifest` is
   the same object by identity (never cloned), `issues` is every violation
   `validateProjectManifest(json): ManifestValidationIssue[]` (the standalone,
   never-throwing detector) found. Both the strict and tolerant paths are thin
   callers of one private collector, so a shape rule is added once and neither
   path can drift from the other; the serializer (`serializeProjectManifest(m)`
   / `writeProjectManifest(path, m)`, built on the new `src/serialize.ts` leaf)
   completes the round trip. See [ADR
   0017](docs/decisions/0017-tolerant-manifest-read.md) and [ADR
   0016](docs/decisions/0016-c3-source-json-serialization-form.md).
   Mapping tables `C3_SECTION_FOLDERS` and `C3_ROOT_FILE_FOLDERS` map manifest
   section keys to on-disk folder names. `collectManifestItemNames`/`collectManifestFileNames`
   are thin consumers of the canonical walks `walkManifestNameTree`/`walkManifestFileTree`
   (no parallel recursion). `detectManifestDrift(projectDir, manifest?)` compares
   declared membership against on-disk source (editor-local filtered via `isEditorLocalPath`)
   and returns `ManifestDrift: {sections: SectionDrift[], inSync, degraded?}`. Each `SectionDrift`
   carries `entries: DriftEntry[]` — a structured list where every entry has a `kind`
   (`missing` | `untracked` | `moved` | `folder-missing` | `folder-untracked` | `dangling-ref`)
   and path-segment arrays (`manifestPath`, `diskPath`) locating the item within the
   subfolder nesting without re-walking. Name-section disk walks use `walkDiskNameTree`
   (recursive, `readdirSync`-based, section-root-relative paths). File-folder disk walks
   use `walkDiskFileTree` which recurses **manifest-declared subfolders only** (D3) — so
   undeclared generated subtrees like `scripts/ts-defs/` are never visited. `diffNameMaps`
   is the diff engine: it builds `name → path` maps per side and emits `missing`/`untracked`/`moved`
   entries (a same-name/different-path leaf is a move, not a delete+add, exploiting
   per-category name uniqueness — a C3 invariant).
   **Timeline transitions exception** — C3 serializes a timeline's `transitions/` directory
   (shown as **"Eases"** in the editor) as an **unnamed** subfolder under `timelines` in
   `project.c3proj` (a `{items, subfolders}` node with no `name` key). This is the one place a
   nameless manifest subfolder is meaningful, not degenerate. `TIMELINE_TRANSITIONS_FOLDER`
   (`"transitions"`) is the exported C3 domain fact (cf. `EVENTVAR_REFERENCE_ACES`); the
   manifest walks `walkManifestNameTree`/`collectManifestFolderPaths` take an optional
   `unnamedSubfolderName` that names a nameless **top-level** subfolder (not propagated into
   recursion → direct children of the section root only, matching C3 where transitions is always
   a direct child). `detectManifestDrift` passes it for `section === "timelines"` so a
   timeline-with-transitions project round-trips without false `moved`/`folder-*` drift (#28).
   The model itself stays faithful (the subfolder stays unnamed — the synthetic name lives only
   in the drift comparison, never written back); c3source now owns the manifest serializer and
   writer (`serializeProjectManifest`/`writeProjectManifest`, ADR 0016), but emitting the unnamed
   `timelines/transitions` form correctly **remains the consumer's job**, because the model keeps
   the subfolder nameless by design. This is *more* load-bearing now that writing is possible: a
   naive sync that materializes the synthetic name (e.g. writing back `TIMELINE_TRANSITIONS_FOLDER`
   as an actual `name` field) corrupts the manifest — that was previously a read-only observation,
   now a real write hazard.
   **Image-derived drift** — `detectImageDrift(projectDir)` is a best-effort sub-detector that
   `detectManifestDrift` appends to its sections (wrapped in try/catch — a throw degrades to
   "images section omitted", never failing core drift). The degradation is **reported, not
   swallowed**: the catch records a `DriftDegradation {section, message}` on
   `ManifestDrift.degraded`, so a caller can tell "images verified, no drift" from "image
   verification threw and was discarded" — previously indistinguishable. `inSync` stays
   `sections.length === 0` (a degradation is not drift), and `C3Project.detectImageDrift()`
   still throws on a direct call, because that *is* the caller's request (ADR 0021's policy).
   Unlike the manifest walks it **ignores
   the manifest**: it walks `objectTypes/` and the flat `images/` folder **directly** and diffs
   derived-expected vs on-disk filenames. `deriveExpectedImageNames(objectType)` derives the
   expected filenames structurally — `<name>.<ext>` for a top-level `image` field, one
   `<name>-<anim>-<frame3>.<ext>` per animation frame — where `<ext>` comes from the member's
   `fileType` MIME via the exported domain fact `IMAGE_FILE_TYPE_EXTENSIONS` (`image/png`→`png`,
   `image/jpeg`→`jpg`, `image/svg+xml`→`svg`, `image/webp`→`webp`; cf. `EVENTVAR_REFERENCE_ACES`).
   The MIME is read from `image.fileType` (single-image) or each frame's own `fileType`
   (animations — frames may differ). The two failure modes are **not** the same and no longer
   share a behaviour (#68): a present-but-**unmapped** `fileType` still **throws** (unknown
   format — #29's decision stands), but an **absent** one does not. C3 first emits `fileType`
   at **r402**, so an older project records no MIME at all while the on-disk file is a perfectly
   ordinary image — calling that "malformed" was simply wrong. The structured
   `deriveExpectedImages(objectType): ExpectedImage[]` (`{stem, ext?, context}`) is now the
   primitive; `deriveExpectedImageNames` is a one-line renderer over it that fills a missing
   `ext` with `C3_LEGACY_IMAGE_EXTENSION` (`"png"` — **not a guess**: C3's own loader applies the
   identical `fileType ?? "image/png"` fallback). The two read paths deliberately diverge —
   `deriveExpectedImageNames` must answer with a concrete name, while `detectImageDrift` must not
   fabricate a finding, so it matches `ext`-less entries on their **stem**. The detector is
   strictly the more conservative of the two, so the default can never *manufacture* drift. See
   [ADR 0023](docs/decisions/0023-pre-r402-image-serialization-drift-degradation.md).
   Because the manifest keys object types on
   **names**, not filenames, a fixture's image format can be varied (change `fileType` + rename
   the on-disk image) without churning any manifest-membership test.
   **C3Project handle** (in `src/project.ts`) — `openProject(root): C3Project` is a root-bound handle that
   unifies the previously-split API: callers no longer assemble section paths by
   hardcoding `"eventSheets"`/`"layouts"`/etc., because the handle derives all path
   fields from `C3_SECTION_FOLDERS`/`C3_ROOT_FILE_FOLDERS` at construction (#36, #38).
   Construction does **no I/O** — path fields are string joins, `manifest()` reads
   lazily and caches, `has*()` methods call `existsSync` fresh. The handle covers the
   **full canonical set of C3 on-disk subfolders**: every key in `C3_SECTION_FOLDERS`
   (event sheets, layouts, object types, families, timelines, flowcharts, 3D models)
   and every key in `C3_ROOT_FILE_FOLDERS` (scripts, sounds, music, videos, fonts,
   icons, files), plus the flat `images/` folder via the exported domain fact
   `IMAGES_FOLDER = "images"` (cf. `TIMELINE_TRANSITIONS_FOLDER`). Every dir gets a
   `*Dir` path field and a `has*()` presence check. `findAll*(sub?)` finders exist for
   the traversable `.json` name sections: event sheets, layouts, object types, families,
   timelines, flowcharts, and 3D models; all are graceful-empty (return `[]` when the
   directory is absent). Binary asset dirs (images, sounds, music, videos, fonts, icons,
   files) expose `*Dir` + `has*()` only — no `findAll*`. `findAllFamilies` filters `.json`
   via `find_all_files_path`; `findAllScripts` filters `.ts` source (excludes `.d.ts` —
   all generated declaration files live under `ts-defs/`). `detectManifestDrift()` and
   `detectImageDrift()` delegate to the free functions, passing the cached manifest.
   The exported constants `PROJECT_MANIFEST_FILE = "project.c3proj"` (#36) and
   `IMAGES_FOLDER` (#38) are also defined here as C3 domain facts.
   The free functions remain exported and unchanged — the handle is additive.
   **Write surface** (#57, #58) — `writeManifest(m?)` writes `m` (or, with no
   argument, the already-cached manifest) via `writeProjectManifest`, and only
   *after* the write succeeds assigns `cachedManifest = m`: a **write-through,
   never-invalidate** cache rule, not the more obvious write-then-drop-cache.
   Invalidating would force the next `manifest()` to re-read strictly, which
   turns a successful repair of a `manifestTolerant()` document into a crash on
   the very next read — write-through has no such trap. `manifestTolerant()`
   delegates to `readProjectManifestTolerant`, always reading fresh from disk
   and touching `cachedManifest` in **neither** direction (isolated on read
   *and* write), so a tolerant peek can never leak an unvalidated document into
   `manifest()`'s cache. `reloadManifest()` is the cache's one true invalidation
   path — it discards `cachedManifest` and re-reads `manifestPath` strictly.
   See [ADR 0016](docs/decisions/0016-c3-source-json-serialization-form.md) for
   the write-through rationale.

2. **Event sheet extraction** (in `src/eventSheets.ts`) — `extractScriptsFromSheet` does a depth-first
   walk that mirrors **C3's own event numbering** (groups, blocks,
   function-blocks, and custom-ace-blocks each increment the counter;
   variables, comments, and includes do not). The canonical counter lives in
   `visitEvents` (which exposes each event's `eventNumber` via
   `EventVisitContext`); `extractScriptsFromSheet` reads its event numbers from
   that one walk, so `eventNumber`, `eventIndex`, and `generateFunctionName`
   cannot drift. It composes lexical scope as a
   stack of `ScopeSegment`s: all `variable` events at a level are in scope for
   every block at that level regardless of declaration order, so they are
   pre-collected before traversal. Regular sibling blocks disambiguate their
   scope keys with `#<eventIndex>`; functions/ACEs use their unique names.
   `formatAction`/`formatCondition` render events into a single-line DSL (see
   the doc comment on `formatAction` for the full grammar). Sibling extractors
   `walkScriptActions`, `extractFunctions`, and `extractIncludes` are thin
   consumers of the same `visitEvents` walk, returning (respectively) script
   actions, function/custom-ACE definitions (each carrying its `params` +
   `returnType` signature), and include edges (`IncludeReference` =
   `includeSheet` + `jsonPath`), all in canonical event order. The
   `isFunctionDefinition` guard narrows an event to the two signature-bearing
   kinds for callers that walk events themselves.
   **Event-variable references** — `isEventVarReference(ace)` and
   `getEventVarReferenceName(ace)` classify a single action/condition as
   referencing a C3 event variable. The canonical fact table
   `EVENTVAR_REFERENCE_ACES` maps each known System ACE id (`set-eventvar-value`,
   `compare-eventvar`, `compare-boolean-eventvar`, …) to the parameter **key**
   that holds the variable name — a key, not a positional index, because ACE
   parameters are a keyed `Record`. `isEventVarReference` gates on
   `objectClass === "System"` (avoiding false positives from a plugin reusing an
   id); `getEventVarReferenceName` resolves `parameters[nameParamKey]`
   defensively. This is the C3 *domain fact* (id-list + name param) owned here so
   downstream need not re-hardcode it (#26); name→declaration scope resolution
   (incl. shadowing) stays the consumer's job.
   **SID traversal** — `walkSids(node, visit: (sid, segments) => void)` is the
   exported primitive that recursively visits every object carrying a numeric
   `sid`, delivering both the sid value and its structured
   `SidPathSegment[] = (string | number)[]` path. `formatSidPath(segments)`
   renders segments into the canonical dotted/indexed string (`""` for root,
   `[i]` for array positions, `.key` for object keys with no leading dot).
   `collectSids` and `collectSidsWithPaths` are thin consumers: they call
   `walkSids` once and accumulate; callers that need a different rendering (e.g.
   a semantic label when `segments.length === 0`) can drive `walkSids` directly.
   **Editor-strictness validation** — `validateForEditor(sheet)` and
   `validateEventForEditor(event, jsonPath?)` model the **C3 editor loader's
   required-field set**, which is stricter than c3source's intentionally lenient
   parse types (fields like `EventSheetVariable.comment` / `GroupEvent.description`
   are typed optional here but the editor rejects `undefined` on import with
   `Error: expected string`). Detection-only — no mutation. Returns
   `EditorValidationIssue[]: {path, rule, message}` where `path` is the
   `visitEvents` `jsonPath` (cannot drift). `validateForEditor` is a thin
   `visitEvents` consumer; `validateEventForEditor` validates a single detached
   event (optional `jsonPath` defaults to `"event"`). The exported extensible
   `EDITOR_FIELD_RULES: EditorFieldRule[]` table follows the same domain-fact
   convention as `EVENTVAR_REFERENCE_ACES` / `IMAGE_FILE_TYPE_EXTENSIONS` — each
   new C3-load bug becomes a one-line rule addition. Rule check is
   `typeof === "string"` so an **empty string passes**; only `undefined`/non-string
   is flagged (originating incident: adding `comment: ""` / `description: ""`
   resolved C3 import failures). Seed rules: `eventvar-comment-required`
   (`variable` → `.comment`) and `group-description-required` (`group` →
   `.description`) (#33).
   **Comparison operators** — `COMPARISON_OPERATORS: Record<number, string>` is
   the exported C3 domain fact mapping each bare `comparison` ACE parameter value
   to its operator symbol: `0`=`=`, `1`=`≠`, `2`=`<`, `3`=`≤`, `4`=`>`, `5`=`≥`,
   version-pinned to C3 r487. `comparisonSymbol(n): string | undefined` looks up
   the symbol, returning `undefined` for out-of-range values. The DSL renderer
   (`formatCondition`/`formatRecordParams`) annotates a `comparison` param with the
   symbol alongside the numeric value (e.g. `comparison=4 (>)`), keeping the number
   as the round-trippable source form; out-of-range or non-numeric values render raw.
   Owned here so downstream need not re-hardcode the magic numbers (#39); keyed on
   param name, no `objectClass` gate.
   **Expression references** — `extractExpressionReferences(expr: string): ExpressionToken[]`
   is a single-pass, stateful tokenizer over a raw C3 expression string (an
   action/condition parameter value, not a DSL-rendered string), sibling to the
   event-variable-reference classifiers above. It returns a flat, source-ordered
   discriminated union `ExpressionToken = ExpressionReferenceToken |
   SystemFunctionToken | VariableToken` (`kind: "reference" | "systemFunction" |
   "variable"`), tracking nesting with a general paren-frame stack — one frame per
   open `(`, whether or not it belongs to a call — so every token gets a
   `parentIndex` pointing at the nearest enclosing call token and every call token
   gets a best-effort `argCount` from its own `(...)`. Like the editor-strictness
   rules, it is **never-throws, best-effort**: string literals (C3's `"…"` form
   with `""` as the doubled-quote escape) are skipped so refs inside quotes are
   never reported, nested-call and operator-concat refs are never dropped, and
   malformed input (an unterminated string, a trailing `Sprite.`, unbalanced
   parens) degrades to a partial or empty result rather than raising. This is C3
   *domain grammar* owned here so downstream need not re-roll a tokenizer (cf.
   `EVENTVAR_REFERENCE_ACES` / `isEventVarReference`) (#43). It is grammar-level
   only — no name→id resolution, no decision about which ACE parameters are
   expression-typed, and no event-sheet iteration; all three stay the consumer's
   job (the last is already covered by `visitEvents`).

3. **Addon domain layer** (in `src/addons.ts`) — parsing and discovery for
   Construct's `.c3addon` plugin/behavior/effect packages (#44). It follows
   the same domain/presentation split as the rest of the library: c3source
   models and discovers addon data; validation, diffing, and rendering stay
   the consumer's job. `addons` sits at the same DAG tier as
   `eventSheets`/`manifest` (imports only `layouts`, for `ObjectType`/`Family`/
   `find_all_files_path`/`isEditorLocalPath`).
   **Attribution** — `attributeObjectType(ot)`/`attributeFamily(f)` derive an
   `AddonAttribution` (`name`, `source: "objectType" | "family"`, `pluginId`,
   `behaviorIds[]`, `effectIds[]`) purely from an object type's or family's
   own declared fields: `plugin-id` plus the `behaviorId`/`effectId` of each
   entry in `behaviorTypes: BehaviorTypeRef[] {behaviorId, name, sid?}` /
   `effectTypes: EffectTypeRef[] {effectId, name}` (both added to `ObjectType`
   and the new `Family` in `src/layouts.ts`, pinned from real fixtures as C3
   domain facts) — no manifest cross-reference, no I/O.
   `collectAddonAttribution(objectTypes, families)` maps a full set (object
   types first, then families) and is the primitive the `C3Project` handle's
   `collectAddonAttribution()` wraps.
   **`usedAddons`** (in `src/manifest.ts`) — `C3UsedAddon` (`type`, `id`,
   `name`, `author`, `bundled`, `version?` — optional, observed absent in real
   fixtures even when `bundleAddons` is true) models one entry of the
   manifest's optional `usedAddons` list; `getUsedAddons(m)` returns it, or
   `[]` when the section is absent.
   **Discovery** — `C3ADDON_EXTENSION = ".c3addon"` and `findAllAddons(dir)`
   find every `.c3addon` package under a directory, built on the same
   `find_all_files_path` primitive as the named layout collectors; there is no
   canonical C3 subfolder for addon-source storage, so it takes a bare
   directory rather than a project-derived path. The `C3Project` handle's
   `findAllAddons(sub?)` wraps it against the project root.
   **Reader** — `readAddonPackage(source): AddonPackage` opens a `.c3addon`
   package for reading, auto-detecting its on-disk form (an unpacked
   directory, or the zip archive C3 itself loads) via **fflate — c3source's
   first runtime dependency** (see [ADR
   0013](docs/decisions/0013-fflate-dependency-c3addon-reader.md)). Both
   modes share one `entryNames`/`hasEntry`/`readBytes`/`readText`/`readJson`
   interface and one BOM-strip + decode path. The domain facts
   `ADDON_MANIFEST_FILE = "addon.json"` and `ADDON_ACES_FILE = "aces.json"`
   name the two package entries; `UTF8_BOM`/`stripBom` exist because some
   package files carry a leading UTF-8 BOM (observed on `aces.json`, not
   `addon.json`, in real SDK samples) that readers must tolerate. That BOM is
   **not** a C3 behavior and is not version-pinned: C3 neither authors nor
   generates addons — a `.c3addon` is hand-written by a third-party developer,
   so the BOM is an artifact of that author's text editor and is unpredictable
   per file and per addon. Hence stripping unconditionally on every read rather
   than allowlisting known-BOM'd entries.
   **ACE model** — `parseAcesModel(json)`/`parseAddonMetadata(json)` are pure
   parsers behind the reader's pre-read-JSON boundary (they take an
   already-parsed value, never a path, so they stay testable without
   `fflate`). `aceIdentity(kind, id)` builds an ACE's canonical `(kind, id)`
   identity — an action and a condition may legally share an `id` — and
   `findAce` resolves by that identity, while `findExpression` resolves an
   expression by its distinct `expressionName` (the PascalCase name used in
   event-sheet expressions, which need not share a stem with `id`).
   Real, BOM'd `addon.json`/`aces.json` fixtures come from the [Construct
   Addon SDK](https://github.com/Scirra/Construct-Addon-SDK), vendored as the
   `SDK/` git submodule; SDK-gated tests self-skip when it is absent or
   checked out non-recursively, so CI must check out submodules recursively
   for that coverage to actually run. See
   [api-guide-addons.md](docs/api-guide-addons.md) for the full reference.

4. **Reference integrity** (in `src/references.ts`, #60) — detects **unresolved**
   name-keyed cross-references the manifest/source's own data implies, not
   editor-observed rejections. Five kinds via one `ReferenceIssue` type:
   `addon-undeclared`/`family-member-missing`/`instance-type-missing` are
   `error` (C3 fails to load); `addon-unused` is `warning` (hygiene);
   `event-class-unresolved` is `warning` because the detector cannot
   distinguish a deleted object type from a pseudo-class its table doesn't yet
   know. Shape: four **pure** detectors (`detectAddonReferenceIssues`,
   `detectFamilyMemberIssues`, `detectInstanceTypeIssues`,
   `detectEventClassIssues` — take already-parsed `SourceDoc<T>[]`, no I/O) plus
   one I/O orchestrator (`detectReferenceIntegrity(projectDir, manifest?,
   options?)`) plus the `C3Project` handle's `detectReferenceIntegrity(options?)`,
   which passes the cached manifest. The exported table `C3_PSEUDO_OBJECT_CLASSES`
   (`objectClass` values resolving to no object type/family **by design**;
   statically known members only, currently just `"System"`) is **known
   incomplete** — corpus-derived, not C3-source-derived — with
   `scripts/scan-references.mjs` (dev-only, mirrors `scripts/api-surface.mjs`)
   as the tool to re-validate it against real projects on a C3 version bump.
   C3's functions object is deliberately **not** in that table: its name is a
   **per-project setting** (`project.c3proj`'s optional `functionsName`,
   defaulting to `C3_DEFAULT_FUNCTIONS_NAME` = `"Functions"`), so
   `detectEventClassIssues` resolves it separately, one additional name atop
   the pseudo-class set, with precedence `options.functionsName` →
   `manifest.functionsName` → the default; a renamed functions object means
   the literal `"Functions"` stops resolving. This was a real defect (#60,
   fixed in commit 353f571): the table originally hardcoded `"Functions"`
   too, which the 14-project corpus scan never caught because every scanned
   project used the default name — the scan validated the *value*, not the
   *mechanism*. `collectLayoutEffectIds` **supplements**
   `collectAddonAttribution` rather than widening it — a layout/layer effect is
   not an item's own declared field, and adding it to `AddonAttribution.source`
   would break any consumer's exhaustive `switch`. Error policy deliberately
   diverges from `detectImageDrift`: findings are collected, but I/O/parse
   failures throw rather than degrading to a partial result, because reference
   integrity *is* the caller's request. Ownership boundary: c3source ships the
   declared-`usedAddons` ↔ used-in-source edge; the `.c3addon`-package ↔
   `usedAddons` direction stays construct3-chef's (`addonValidator.ts`,
   `addonInventory.ts`). See [ADR
   0021](docs/decisions/0021-reference-integrity-detection.md) and
   [api-guide-references.md](docs/api-guide-references.md).

All file writes go through `src/serialize.ts`'s `serializeC3Json`/
`writeC3JsonFile` (`C3_JSON_INDENT = "\t"`) — the single owner of the C3
source-JSON write form: **tab-indented, and — the inverse of the usual
text-file convention — with no trailing newline**. Text from
expressions/comments is run through `normalizeLineEndings` (CRLF -> LF) for
cross-platform stability. See [ADR
0016](docs/decisions/0016-c3-source-json-serialization-form.md). `serialize.ts`
also owns the one documented exception: `tilemapBrushes/**/*.brush.json` is
project **source**, not editor-local — just written in a second, minified form
— per the `C3_MINIFIED_SOURCE_SUFFIXES`/`isMinifiedSourcePath` domain fact and
[ADR 0018](docs/decisions/0018-brush-json-minified-source-not-editor-local.md).

## Domain-fact tables: how they are validated (#68)

[ADR 0008](docs/decisions/0008-c3-domain-fact-tables.md) owns *that* C3 facts live
here as exported tables; [ADR
0022](docs/decisions/0022-domain-fact-audit-convention.md) owns *how one is
validated*. Three rules:

1. **Every table's JSDoc carries a confidence label** — `AUDITED` / `KNOWN
   INCOMPLETE` / `UNVALIDATED` / `NOT CORPUS-AUDITABLE` (the last must name the
   evidence source that *would* validate it) — **paired with the blast radius of
   being wrong**, which differs sharply per table: `EDITOR_LOCAL_EXCLUSIONS`
   contaminates every drift section, `IMAGE_FILE_TYPE_EXTENSIONS` throws, the rest
   are silent false negatives or cosmetic.
2. **Numbers never go in JSDoc.** JSDoc ships to consumers in `dist/*.d.ts`, where
   "audited against 14 projects" is false the day a 15th appears. Counts, releases
   and the scan date live in [docs/domain-fact-audit.md](docs/domain-fact-audit.md);
   JSDoc holds only the label and a pointer. A **release pin** (`r402`, `r437`) is
   the one exception — a fixed historical fact, not a rotting count.
3. **`scripts/scan-domain-facts.mjs` reports partitions; the maintainer produces the
   verdict.** It never concludes a table is correct — `scripts/*.mjs` is unlinted,
   untypechecked, untested and not in CI, so a probe bug must yield odd-looking
   evidence a human notices, not a wrong conclusion baked into a table. Every verdict
   line carries its own observation count, and zero observations prints `NOT
   EXERCISED`, never a pass (a probe once printed "NO CONTRADICTIONS" having scanned
   nothing).

**Reach for C3's own bundle before a corpus scan.**
`https://editor.construct.net/r{NNN}/` is permanently hosted and fetchable per
release (`construct.net`'s human-facing docs are Cloudflare-gated; this is not):
`plugins/allAces.json` is C3's **authoritative ACE table**, and bisecting
`c3runtime/projectResources.js` across releases **pins exactly when a field
appeared**. A corpus answers *what values occur*; the bundle answers *what the
mechanism is* — the distinction ADR 0008's addendum says a corpus structurally
cannot make. In #68 it proved `EVENTVAR_REFERENCE_ACES` complete, proved
`is-boolean-eventvar-set` **fabricated** (not merely unobserved), and converted two
corpus brackets into exact pins (`fileType`→r402, `functionsName`→r437).

## Canonical reference fixture (`construct3-sample`)

A **second** git submodule, `construct3-sample/` (pinned at the commit tagged
`v0.6.0`, added #51), is the **canonical golden C3 project** — the single,
editor-round-tripped
source of on-disk shape that c3source and its sibling tools consume instead of
each hand-maintaining a drifting fixture. c3source is the **validator, not the
owner** (it runs `validateForEditor`/`detectManifestDrift` over it). See [ADR
0015](docs/decisions/0015-canonical-c3-reference-fixture.md) for the ownership +
tag-pinned-submodule mechanism and the rejected alternatives (npm companion,
vendored copy). This is distinct from — and additive to — the retained Scirra
`SDK/` submodule (its retirement, #50, was closed won't-do).
`scripts/prep-fixture.mjs` materializes the golden into the **gitignored**
`test/fixtures/canonical/` — a byte-for-byte copy of `construct3-sample/project/`'s
**tracked HEAD content** (via `git archive`, not a working-tree copy — see [ADR
0019](docs/decisions/0019-hermetic-fixture-materialization.md) / #64) + an
additive `test/fixtures/canonical-overlay/` − the `canonical.striplist.txt`
paths; a `pretest` npm hook runs it before every `npm test`, and it is a
**guarded no-op** (exit 0) when the submodule is absent or its checked-out
directory isn't a git repository, so tests self-skip rather than the run
breaking. Because materialization reads tracked HEAD content, enriching the
golden now requires a **local commit in the `construct3-sample` submodule**
before the change appears in the materialized fixture — an uncommitted edit
there is invisible to the fixture. As of **#54**, all the formerly
`c3source-fixture/`-backed tests consume the materialized `test/fixtures/canonical/`
(via the `PROJECT_FIXTURE` constant in `test/fixtureHelpers.ts`), and the committed
`test/fixtures/c3source-fixture/` has been retired. The pin advanced to **v0.2.0**
for that migration — v0.1.0 had no event-var-reference ACEs; v0.2.0 adds them to
`Event sheet 1`, which `eventVarReference.test.ts` needs — and then to **v0.4.1**,
which adds a **global layer with override** to both layouts (exercising the
prefix-resetting `global` path in `walkLayerEntries`) plus upstream-owned addon
sources. Then **v0.5.0** (#60), adding Functions ACEs to `Event sheet 1`, and
**v0.6.0** (#68), adding a boolean event variable plus a `compare-boolean-eventvar`
condition to `Event sheet 2` — the golden had no boolean-event-variable construct at
all, which is part of how a **fabricated** ACE id survived unnoticed in
`EVENTVAR_REFERENCE_ACES`. Every bump from v0.4.1 on is corpus-neutral: the
`.json`/`.c3proj` counts are unchanged (29/3/26, 26 kept round-tripping bar the brush
file), because each edits existing files rather than adding any, and non-`project/`
additions are never copied by `prep-fixture`. **When bumping the pin, re-measure
rather than assume** — a tag that adds or removes a `project/` JSON file moves the
corpus counts `manifestSerialize.test.ts` asserts.
**What is actually pinned is a commit, not a tag:** the superproject tree stores a
`160000 commit <sha>` entry and `.gitmodules` carries no `branch`/tag field, so git
never consults a tag when updating the submodule — `git describe --tags` merely
resolves that sha to a nearby tag name for humans. Tagging each golden release (ADR
0015's convention) stays worthwhile as a readable label and a signal that a fixture
state was deliberately published, but a bump is complete the moment the commit
pointer is staged; the tag name in this doc is documentation, not configuration.
**Overlay vs. upstream-enrich — the decision rule:** coverage the golden
genuinely *should* carry (a real C3 construct a downstream test needs, e.g.
event-var-reference ACEs) is added **upstream in `construct3-sample`**
(editor-round-trip → commit → push → new tag → bump the pin), **never** faked
into `canonical/` — an overlaid, hand-authored event sheet would couple those
bytes to `canonicalFixture.test.ts`'s `validateForEditor`/drift gate. The
additive `canonical-overlay/` is reserved for c3source-specific shaping the
golden **deliberately omits** (e.g. `uistate/` + `*.instancesBar.json`, which
the golden's own `.gitignore` excludes) so the `isEditorLocalPath` drift-filter
coverage isn't vacuous. When enriching the golden, verify before pushing to the
shared submodule (parses, `validateForEditor` == 0 issues, referenced var
declared + in scope, minimal `git diff --stat`). `construct3-sample`'s remote is
**SSH** (`git@github.com:GenvidTechnologies/construct3-sample`, set in
`.gitmodules`), so pushing there goes through the same 1Password SSH-agent path
as a c3source push and may need the user present to approve — it is no longer
the "HTTPS, no prompt" exception this section once described. The SCP-style
`git@github.com:` spelling is deliberate: `actions/checkout` rewrites that form
to token-authenticated HTTPS for submodule clones, whereas a `git+ssh://` URL is
not covered by that rewrite and would break CI's recursive checkout — and with it
every fixture-backed test, which would **self-skip silently** rather than fail
(watch the `pending` count, not just the green check).

## Formatting

Prettier: `printWidth` 120, spaces in code. **JSON files use tabs**, no bracket
spacing (mirrors C3 serialization). ESLint extends `prettier` and deliberately
disables `no-unused-vars` and `no-explicit-any`.

Prettier formatting is **not enforced** by any check: `npm run lint` is
eslint-only, and `eslint-config-prettier` merely *disables* eslint rules that
would conflict with Prettier — there is no `prettier` dependency and no
`--check` step anywhere. So formatting drift (e.g. a multi-line union collapsed
to one line) passes lint/typecheck/test/build untouched; **review is the only
formatting gate** — match the surrounding style by hand rather than relying on CI.

**Never run `prettier` / `prettier --write` (or `npx prettier`) here.** Because
no local prettier config is wired to the checks, it falls back to Prettier's
defaults (printWidth 80, bracket spacing) — *not* this repo's `printWidth` 120 /
no-bracket-spacing conventions — so it rewrites unrelated code: it collapses the
intentional multi-line unions and re-spaces brackets across the whole file,
producing drift hunks you then must hand-revert. Format by hand to match the
surrounding style instead.

## CI & Publishing

CI runs on **GitHub Actions** (Node 22). `.github/workflows/ci.yml` runs on pull
requests and pushes to `main`; it calls the shared reusable workflow
`GenvidTechnologies/public-github-actions/.github/workflows/node-gate.yml@main`, which
runs lint -> typecheck -> test -> build (plus a non-failing `npm publish
--dry-run`). It requires no secrets, so it is safe on fork PRs.

Publishing is to the **public npm registry** as the scoped package
`@genvidtech/c3source`. `.github/workflows/publish.yml` triggers on **git tags
matching `v*.*.*`** (e.g. `v0.3.0`): it re-runs the gate, verifies the tag
matches `package.json` `version`, then runs `npm publish --provenance --access
public`. Authentication uses **npm OIDC trusted publishing** — short-lived
credentials minted per run from the GitHub OIDC token (`id-token: write`), so
**no long-lived npm token is stored** anywhere; provenance is automatic. The
package's trusted publisher is registered against this repo
(`GenvidTechnologies/c3source`) and the `publish.yml` workflow. The first publish
of the name was bootstrapped with a one-time token (since npm's OIDC flow
excludes first-publish), which was revoked once the trusted publisher was
configured.
