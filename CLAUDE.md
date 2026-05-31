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
ephemeral scaffolding, not durable records. The durable record of a design or
decision is the **GitHub issue or PR** (post the spec as an issue comment or in
the PR body, where it survives the squash). Never cite an unpushed local branch
or commit hash in external communication (issue/PR comments) — link to
something the reader can actually open, or push first.

## Commands

Package manager is **npm** (Node >= 22). All checks below run in CI and must pass.

```sh
npm install
npm run lint        # eslint, --max-warnings 0 over src/ and test/
npm run typecheck   # tsc against tsconfig.test.json (src + test), --noEmit
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
   walkers. The key pattern: a `LayerVisitor`
   returns a *mutation count* (number) and an `InstanceVisitor` returns a
   *changed* boolean; `visit_layers_in_layout` sums the counts and **rewrites
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
   the doc comment on `formatAction` for the full grammar).

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
