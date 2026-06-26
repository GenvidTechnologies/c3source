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
summary linking to real docs, not a paste of the design spec. Never cite an
unpushed local branch or commit hash in external communication (issue/PR
comments) — link to something the reader can actually open, or push first.

## Commands

Package manager is **npm** (Node >= 22). All checks below run in CI and must pass.

```sh
npm install
npm run lint        # eslint, --max-warnings 0 over src/ and test/ (test/fixtures/ excluded)
npm run typecheck   # tsc against tsconfig.test.json (src + test, excluding test/fixtures/), --noEmit
npm run test        # mocha + tsx, runs test/**/*.test.ts
npm run build       # tsc -> dist/ (the published artifact)
```

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

Nearly all logic lives in a single module, `src/c3source.ts`; `src/index.ts`
just re-exports it (`export * from "./c3source.js"`). The `.js` extension in the
import is required — the project is ESM (`"type": "module"`, `NodeNext`
resolution). The package `main`/`types`/`exports` point at the built
`dist/*.js` and `dist/*.d.ts` — the same artifacts the `files` allowlist
ships — so a consumer resolves exactly what gets published. (`prepack` builds
`dist/` before any `npm pack`/`npm publish`.) Do **not** reintroduce the old
pnpm-style trick of pointing entry points at `src/*.ts` and rewriting them via
`publishConfig.{main,types,exports}`: npm — unlike pnpm/yarn — ignores those
manifest-field overrides, so the `src/` paths leak into the tarball and break
every consumer (this was issue #8, fixed in 0.3.1). `scripts/verify-package.mjs`
runs in `prepack` and fails the pack if any entry point is missing or falls
outside `files`.

Two functional areas:

1. **Layout traversal** — recursive `find_all_*_path` collectors (skip
   `.uistate.json` files and never descend into `uistate/` subfolders, which
   C3 r487+ writes alongside layouts/object-types/event-sheets) plus visitor
   walkers. The **one canonical definition** of "editor-local vs C3 source" is
   `isEditorLocalPath(name): boolean` backed by `EDITOR_LOCAL_EXCLUSIONS: {dirs, fileSuffixes}`;
   all four former inline skip sites (the `uistate/` directory check in
   `find_all_files_path` plus the `.uistate.json` suffix checks in the three
   named collectors) now consume it uniformly (#19). The named collectors are thin wrappers over the exported generic
   primitive `find_all_files_path(dir, predicate)` — the single recursive walk
   that owns the recursion, the `uistate/` skip, and the per-level
   `readdirSync().sort()` ordering. It is exported so downstream can discover
   non-source artifacts (e.g. generated `.dsl.txt` files) through the same walk
   instead of maintaining a parallel collector that drifts on the next skip-rule
   fix (issue #16); its `predicate` receives the bare basename. The key
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
   **Project manifest** — the `project.c3proj` file in the project root (folder
   format only; not the single-file archive) is modeled by `C3ProjectManifest`
   and parsed strictly by `parseProjectManifest(json)`/`readProjectManifest(path)`.
   Mapping tables `C3_SECTION_FOLDERS` and `C3_ROOT_FILE_FOLDERS` map manifest
   section keys to on-disk folder names. `collectManifestItemNames`/`collectManifestFileNames`
   are thin consumers of the canonical walks `walkManifestNameTree`/`walkManifestFileTree`
   (no parallel recursion). `detectManifestDrift(projectDir, manifest?)` compares
   declared membership against on-disk source (editor-local filtered via `isEditorLocalPath`)
   and returns `ManifestDrift: {sections: SectionDrift[], inSync}`. Each `SectionDrift`
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
   in the drift comparison, never written back); c3source owns no manifest writer, so emitting
   the unnamed form on sync is the consumer's job.
   **Image-derived drift** — `detectImageDrift(projectDir)` is a best-effort sub-detector that
   `detectManifestDrift` appends to its sections (wrapped in try/catch — a throw degrades to
   "images section omitted", never failing core drift). Unlike the manifest walks it **ignores
   the manifest**: it walks `objectTypes/` and the flat `images/` folder **directly** and diffs
   derived-expected vs on-disk filenames. `deriveExpectedImageNames(objectType)` derives the
   expected filenames structurally — `<name>.<ext>` for a top-level `image` field, one
   `<name>-<anim>-<frame3>.<ext>` per animation frame — where `<ext>` comes from the member's
   `fileType` MIME via the exported domain fact `IMAGE_FILE_TYPE_EXTENSIONS` (`image/png`→`png`,
   `image/jpeg`→`jpg`, `image/svg+xml`→`svg`, `image/webp`→`webp`; cf. `EVENTVAR_REFERENCE_ACES`).
   The MIME is read from `image.fileType` (single-image) or each frame's own `fileType`
   (animations — frames may differ). An absent or unmapped `fileType` **throws** (malformed /
   unknown format) — there is no `.png` fallback (#29). Because the manifest keys object types on
   **names**, not filenames, a fixture's image format can be varied (change `fileType` + rename
   the on-disk image) without churning any manifest-membership test.
   **C3Project handle** — `openProject(root): C3Project` is a root-bound handle that
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

2. **Event sheet extraction** — `extractScriptsFromSheet` does a depth-first
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

All file writes serialize JSON with **tab indentation** to match C3's format,
and text from expressions/comments is run through `normalizeLineEndings` (CRLF
-> LF) for cross-platform stability.

## Formatting

Prettier: `printWidth` 120, spaces in code. **JSON files use tabs**, no bracket
spacing (mirrors C3 serialization). ESLint extends `prettier` and deliberately
disables `no-unused-vars` and `no-explicit-any`.

## CI & Publishing

CI runs on **GitHub Actions** (Node 22). `.github/workflows/ci.yml` runs on pull
requests and pushes to `main`; it calls the shared reusable workflow
`genvid-holdings/genvid-public-ci/.github/workflows/node-gate.yml@main`, which
runs lint -> typecheck -> test -> build (plus a non-failing `npm publish
--dry-run`). It requires no secrets, so it is safe on fork PRs.

Publishing is to the **public npm registry** as the scoped package
`@genvid/c3source`. `.github/workflows/publish.yml` triggers on **git tags
matching `v*.*.*`** (e.g. `v0.3.0`): it re-runs the gate, verifies the tag
matches `package.json` `version`, then runs `npm publish --provenance --access
public`. Authentication uses **npm OIDC trusted publishing** — short-lived
credentials minted per run from the GitHub OIDC token (`id-token: write`), so
**no long-lived npm token is stored** anywhere; provenance is automatic. The
package's trusted publisher is registered against this repo
(`genvid-holdings/c3source`) and the `publish.yml` workflow. The first publish
of the name was bootstrapped with a one-time token (since npm's OIDC flow
excludes first-publish), which was revoked once the trusted publisher was
configured.
