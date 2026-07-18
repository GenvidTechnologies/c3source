# 0001. Single-module, ESM-only library

- **Status:** accepted
- **Date:** 2026-04-03
- **Issue:** — (initial release)

## Context

`c3source` is a library — there is no runtime application. It ships typed
interfaces and traversal/formatting functions for reading and mutating Construct 3
project source files on disk, consumed by build tools, code generators, and
analyzers. The initial release had to settle two structural questions: how the
code is laid out across modules, and which module system it targets.

## Decision

Nearly all logic lives in a **single module**, `src/c3source.ts`; `src/index.ts`
is a pure re-export barrel (`export * from "./c3source.js"`). The package is
**ESM**: `package.json` declares `"type": "module"` with `NodeNext` resolution,
so relative imports carry the `.js` extension even in `.ts` source
(`"./c3source.js"`). The traversal and extraction logic is tightly
interrelated, so keeping it in one module keeps the domain cohesive and the
public surface a single barrel.

## Compromise

A multi-module split (one file per functional area) would localize concerns but
fragment a domain whose pieces constantly reference one another; we chose one
module for cohesion, accepting that it grows large. ESM over CommonJS aligns
with modern Node (≥ 22) and tree-shakeable consumers, at the cost of the
mandatory `.js`-in-`.ts` import extension — a well-known ESM footgun that must be
respected or `NodeNext` resolution breaks.

## Consequences

New features grow `c3source.ts`; `index.ts` stays a re-export barrel and
consumers get a single entry point. Contributors must write `.js` import
extensions from TypeScript source. Tests run against `src/` directly via `tsx`
with no build step. This decision is the substrate for the packaging choices in
[ADR 0004](0004-dist-entry-points-no-publishconfig.md).
