# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`c3source` is a TypeScript library of typed interfaces and traversal/formatting
functions for **Construct 3 (C3) project source files on disk** — layouts,
layers, instances, object types, and event sheets. It is consumed by build
tools, code generators, and analyzers that inspect or mutate C3 JSON outside
the C3 editor. There is no runtime application; it ships as a library.

## Commands

Package manager is **pnpm** (Node >= 22). All checks below run in CI and must pass.

```sh
pnpm install
pnpm run lint        # eslint, --max-warnings 0 over src/ and test/
pnpm run typecheck   # tsc against tsconfig.test.json (src + test), --noEmit
pnpm run test        # mocha + tsx, runs test/**/*.test.ts
pnpm run build       # tsc -> dist/ (the published artifact)
```

Run a single test file or filter by name:

```sh
pnpm exec mocha --timeout 5000 --import=tsx --require ./test/setup.ts test/extractEventSheetScripts.test.ts --exit
pnpm exec mocha --timeout 5000 --import=tsx --require ./test/setup.ts 'test/**/*.test.ts' --grep "scope" --exit
```

Tests use **mocha + chai** with `tsx` for on-the-fly TS execution (no build
step needed). `test/setup.ts` is a mocha root hook that silences `console.log`
and `console.debug` during runs (warn/error pass through), so library code may
log freely.

## Architecture

Nearly all logic lives in a single module, `src/c3source.ts`; `src/index.ts`
just re-exports it (`export * from "./c3source.js"`). The `.js` extension in the
import is required — the project is ESM (`"type": "module"`, `NodeNext`
resolution). The package `main`/`types` point at `src/*.ts` for local
workspace consumers, but `publishConfig` redirects them to `dist/*.js` and
`dist/*.d.ts` for published installs.

Two functional areas:

1. **Layout traversal** — recursive `find_all_*_path` collectors (skip
   `.uistate.json`) plus visitor walkers. The key pattern: a `LayerVisitor`
   returns a *mutation count* (number) and an `InstanceVisitor` returns a
   *changed* boolean; `visit_layers_in_layout` sums the counts and **rewrites
   the layout file only when the total is > 0**. So visitors that mutate
   in-place must report it via the return value or the change is silently
   dropped. Full layer names are `LayoutName.LayerName`; layers flagged
   `global` reset the prefix to `global`.

2. **Event sheet extraction** — `extractScriptsFromSheet` does a depth-first
   walk that mirrors **C3's own event numbering** (groups, blocks,
   function-blocks, and custom-ace-blocks each increment the counter;
   variables, comments, and includes do not). It composes lexical scope as a
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

CircleCI (`.circleci/config.yml`) runs lint -> typecheck -> test -> build ->
`pnpm pack` on the `cimg/node:22.13` image. The full pipeline (build-and-test,
then publish) only triggers on **git tags matching `/\d+\..*/`** (e.g.
`0.1.0`). Publishing does **not** push to npm — it uploads the `.tgz` to an
**Azure Blob Storage** container (`cordova`) under
`<pkgName>/tags/<tag>` or `<pkgName>/branch/<branch>`. Secrets are injected at
runtime via the 1Password CLI (`op run`), so jobs require the
`burbank-onepassword` context.
