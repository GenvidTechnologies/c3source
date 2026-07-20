# 0012. Per-area module split (supersedes 0001)

- **Status:** accepted (supersedes [ADR 0001](0001-single-module-esm-library.md))
- **Date:** 2026-07-20
- **Issue:** #47

## Context

`src/c3source.ts` had grown to 2458 lines and 120 exports in the single
module established by [ADR 0001](0001-single-module-esm-library.md). One file
covering the whole domain — layout traversal, event-sheet extraction, project
manifest/drift, and the `C3Project` handle — had become hard to navigate and
review, and git blame/diff locality was poor: an event-sheet change and a
manifest change landed in the same file's diff. Meanwhile `src/index.ts` was
already a pure re-export barrel (`export * from "./c3source.js"`) and
consumers import only from the package root, so the public surface was
already decoupled from the file layout — a split could be purely internal,
with no API-surface change.

## Decision

`c3source.ts` is split into four per-area modules along the existing region
seams: `src/layouts.ts` (foundation leaf — data-model types, the
editor-local classifier, the generic file walk plus named collectors, layer
visitors, sceneGraph mutators, `normalizeLineEndings`), `src/eventSheets.ts`
(event-sheet extraction, DSL formatters, event-var references, the
expression tokenizer, comparison operators, the editor-strict validator, SID
traversal), `src/manifest.ts` (the `project.c3proj` model, the drift engine,
and image-derived drift), and `src/project.ts` (the `C3Project` handle /
`openProject`). `c3source.ts` itself is retained as a 4-line internal
re-export barrel (`export *` from each of the four modules), so `index.ts`
and every consumer are untouched — this fits the wider architecture as a
purely internal decomposition behind the existing barrel, not an API
redesign.

Intra-package imports carry the `.js` `NodeNext` extension (per ADR 0001) and
form an acyclic DAG: `layouts` (leaf) is imported by both `eventSheets` and
`manifest`, which are in turn imported by `project`. The published API is
byte-identical: verified by `scripts/api-surface.mjs` (a TS-checker
export-surface dump diffed before/after over all 120 exports, including
type-only exports) plus a runtime `Object.keys` diff, and the full validate
chain (`lint`, `typecheck`, `test`, `build`) plus all 20 test files pass
unchanged.

## Compromise

ADR 0001 chose one module because "the traversal and extraction logic is
tightly interrelated, so keeping it in one module keeps the domain cohesive
and the public surface a single barrel," deliberately accepting that the file
would grow large. That trade-off reversed here: at 2458 lines / 120 exports
the single-file cost — navigation, review, and blame/diff locality — now
outweighs the cohesion benefit, and because the public surface was already a
barrel (`index.ts` → `c3source.ts`), splitting the internals costs nothing at
the API boundary. This is a zero-behavior-change mechanical decomposition,
not a redesign of what is exported or how it is grouped conceptually.

Two alternatives were rejected:

- **Delete `c3source.ts` and re-point `index.ts` plus all 20 test-file
  imports directly at the new per-area modules** — rejected. It would churn
  every test file for no structural gain; keeping `c3source.ts` as an
  internal barrel confines the churn to the split itself.
- **Finer-grained splitting** (separate modules for types, the expression
  tokenizer, editor-strict validation, etc.) — rejected as over-design for a
  domain with no such internal seams. For example, `comparisonSymbol` and the
  DSL formatters it annotates belong together in `eventSheets.ts`; splitting
  them further would fragment cohesive event-sheet-domain knowledge without
  reducing any file below a size that already justifies a boundary.

## Consequences

Each area is now independently navigable and reviewable, and the module
dependency DAG (`layouts` ← {`eventSheets`, `manifest`} ← `project`) is
explicit in the imports rather than implicit in file regions. New features
land in the relevant area module and flow through the `c3source.ts` barrel
automatically — no `index.ts`, `package.json`, or `tsconfig` edit is needed,
since `tsconfig` globs `src/**`. Contributors must keep the `.js` extension
on new intra-package imports (per ADR 0001) and must not import the barrel
(`./c3source.js`) or `./index.js` from a member module, which would introduce
a cycle; there is no ESLint `import/no-cycle` rule, so the test suite is the
backstop against that. This decision amends only the module-layout half of
[ADR 0001](0001-single-module-esm-library.md) — its ESM/`NodeNext` decision
is unchanged.
