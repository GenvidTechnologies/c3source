---
type: decision-context
title: "ADR 0001 — Single-module ESM library"
description: Nearly all logic lives in a single module, src/c3source.ts, behind a pure re-export barrel, and the package targets ESM with NodeNext resolution (mandatory .js import extensions) rather than CommonJS.
tags: [adr, module-architecture, esm]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0001
    resource: ../../raw/adr-0001-single-module-esm-library-2026-08-20.md
    title: "ADR 0001 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0001 — Single-module ESM library

**Status:** superseded (module-layout only) by [ADR 0012](/decisions/0012-per-area-module-split.md); the ESM/NodeNext decision below remains in effect
**Date:** 2026-04-03
**Issue:** — (initial release)

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0001].

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
[ADR 0004](/decisions/0004-dist-entry-points-no-publishconfig.md).

## Related

- [ADR 0012 — Per-area module split](/decisions/0012-per-area-module-split.md) — supersedes this record's module-layout half; the ESM/NodeNext decision here is unchanged.
- [ADR 0013 — Depend on fflate for .c3addon zip reading](/decisions/0013-fflate-dependency-c3addon-reader.md) — partially revises this record's no-runtime-deps stance.
- [ADR 0004 — Package entry points at dist/, not src/*.ts via publishConfig](/decisions/0004-dist-entry-points-no-publishconfig.md) — the packaging decision built on this ESM substrate.
- [Module Architecture](/module-architecture.md) — describes the current (post-0012) module layout.

[^adr-0001]: ADR 0001 (docs/decisions capture, 2026-08-20)
