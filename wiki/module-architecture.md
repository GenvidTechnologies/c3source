---
type: reference
title: Module Architecture
description: c3source's logic is split across seven per-area modules imported in an acyclic DAG, re-exported through a thin internal barrel, published as built dist/ artifacts, and verified byte-identical across refactors by a dedicated API-surface script.
tags: [architecture, modules, esm, api-surface, build]
status: stable
stale_after: 2027-08-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: jsdoc-asymmetry-experiment
    resource: ../raw/2026-08-20-jsdoc-dump-asymmetry-experiment.md
    title: "Controlled api-surface JSDoc-asymmetry experiment (2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Module Architecture

## The seven per-area modules and their DAG

Logic is split across seven per-area modules — `src/serialize.ts`,
`src/layouts.ts`, `src/eventSheets.ts`, `src/manifest.ts`, `src/addons.ts`,
`src/references.ts`, `src/project.ts` — imported in an acyclic DAG[^claude-md]:

- `serialize` is the **sole leaf** — it imports nothing from the package.
- `layouts` imports only `serialize`.
- `eventSheets`, `addons`, and `manifest` all import only `layouts`
  (`manifest` additionally imports `serialize`, for its write path) and are
  **mutually independent siblings**.
- `references` sits one tier above that sibling group, importing `layouts`,
  `eventSheets`, `addons`, and `manifest`.
- `project` imports all of the above, at the top of the DAG.

[ADR 0012](/decisions/0012-per-area-module-split.md) records the split
rationale — it supersedes the module-layout half of
[ADR 0001](/decisions/0001-single-module-esm-library.md), which
originally described a single-module library[^claude-md]. [ADR
0016](/decisions/0016-c3-source-json-serialization-form.md) added
`serialize` beneath `layouts` as the new leaf; [ADR
0021](/decisions/0021-reference-integrity-detection.md) added
`references` as the new tier beneath `project`[^claude-md].

## The internal barrel and the public entry point

`src/c3source.ts` is a thin **internal** re-export barrel over the seven
modules (`export *` from each, in DAG order — serialize, layouts,
eventSheets, manifest, addons, references, project). `src/index.ts` is
unchanged and still re-exports it (`export * from "./c3source.js"`), so the
public API surface did not move when the module split happened[^claude-md].

## ESM import requirement

The project is ESM (`"type": "module"`, `NodeNext` module resolution), so the
`.js` extension on intra-package imports is **required** — not optional
tidiness — for every import between the seven modules[^claude-md].

## Published entry points: why `publishConfig` must never come back

The package's `main`/`types`/`exports` fields point at the built
`dist/*.js` and `dist/*.d.ts` — the same artifacts the `files` allowlist
ships — so a consumer resolves exactly what gets published. `prepack` builds
`dist/` before any `npm pack`/`npm publish`[^claude-md].

**Do not reintroduce the old pnpm-style trick of pointing entry points at
`src/*.ts` and rewriting them via `publishConfig.{main,types,exports}`.**
npm — unlike pnpm/yarn — ignores those manifest-field overrides at publish
time, so the `src/` paths leak into the published tarball and break every
consumer. This is not a hypothetical: it is exactly what happened in issue
#8, fixed in 0.3.1[^claude-md]. `scripts/verify-package.mjs` runs in
`prepack` and fails the pack if any entry point is missing or falls outside
`files`, guarding against a regression of the same defect[^claude-md].

## `scripts/api-surface.mjs`: proving an API-preserving refactor

A second, **dev-only** verification script sits alongside `verify-package.mjs`:
`scripts/api-surface.mjs` (added in issue #47, not wired into CI) dumps the
**public export surface** — every name reachable from the built
`dist/index.d.ts` via the TypeScript checker (`getExportsOfModule`, following
`export *` chains and alias re-exports), one sorted
`name | flags | canonicalized-declaration-text` line per export[^claude-md].

Diffing two builds' dumps proves a change keeps the API **byte-identical**.
This is how the issue #47 module split (`src/c3source.ts` → the per-area
modules above) was verified, and it is the tool to reach for on any future
API-preserving refactor or release[^claude-md]. Crucially, it captures
type-only exports (interfaces and type aliases) that a runtime
`Object.keys(dist/index.js)` diff cannot see at all — run the two checks as a
**value-vs-type pair**[^claude-md].

### The JSDoc-in-dump asymmetry

**The declaration text includes JSDoc — but not uniformly**, which makes
"byte-identical dump" a *stronger* claim than "identical API." A
**comment-only** edit to a member of an exported interface moves the dump
even though no signature changed[^claude-md]. Specifically:

| Export shape | JSDoc in the dump? |
|---|---|
| Interface or type member | Yes — its doc comment travels with it |
| Top-level `const` | No — the entry is the bare type signature only |

For example, editing a top-level `const`'s doc comment (a version-pin
comment, say) moves nothing in the dump — the entry stays the bare type
signature (e.g. `NAME  flags  NAME: readonly string[]`). This was measured
directly on issue #81, which changed a `const`'s JSDoc version pin and still
produced a **byte-identical** dump, contradicting an earlier, flatter
prediction that any JSDoc edit would move the dump[^claude-md].

Issue #81 established only the const half of the table — a single run cannot
also prove the interface-member half. A controlled experiment on 2026-08-20
exercised both halves in one dump comparison: a single change edited JSDoc on
three top-level `const`s (in `serialize.ts`, `layouts.ts`, and
`references.ts`) and on the interface member `C3ProjectManifest.functionsName`
in `manifest.ts`. The raw dump moved **exactly one line** — `C3ProjectManifest`
— while the JSDoc-stripped diff was **empty**; had the `const` edits also
moved the dump, the raw delta would have been four or more
lines[^jsdoc-asymmetry-experiment]. The baseline for that comparison came from
`git stash push -- src/`, rebuild, dump, `git stash pop`, rebuild — isolating
the `src/` change from everything else in the working tree so the two dumps
differ by nothing else[^jsdoc-asymmetry-experiment]. The practical rule this
yields: to predict a dump delta, count only the comments attached to
interface/type members — const comments are free[^jsdoc-asymmetry-experiment].
And the empty JSDoc-stripped diff, not the raw one, is the real "no signature
changed" proof — a non-empty raw diff on a doc-carrying change is expected,
not a failure signal[^jsdoc-asymmetry-experiment].

[ADR 0012](/decisions/0012-per-area-module-split.md) and [ADR
0017](/decisions/0017-tolerant-manifest-read.md) both cite an
*exactly-empty* diff as their purity proof — that held only because those two
refactors happened not to touch JSDoc. A doc-carrying PR has no such luxury
and will show entries that *look like* scope leaks but are prose: issue #63
hit this directly, where a predicted two-line delta came back as three, the
extra line being an unrelated export whose doc comment was corrected in the
same branch[^claude-md].

**When a change deliberately touches comments**, strip JSDoc blocks from both
dumps before diffing, to isolate real signature changes from prose noise —
e.g. a regex-based strip such as
`sed -E 's#/\*\*[^*]*\*+([^/*][^*]*\*+)*/##g'` run over each dump before
`diff`[^claude-md]. Reserve the empty-diff standard for refactors that
genuinely leave comments alone.

## Related

- [Library Overview](/library-overview.md) — what c3source is and who consumes it.
- [Layout Traversal](/layout-traversal.md) — the `layouts` module's traversal primitives, sitting directly above `serialize` in the DAG.
- [Project Manifest](/project-manifest.md) — the `manifest` module, one of the three mutually-independent siblings above `layouts`.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — the `eventSheets` module, another of those siblings.
- [Serialization Form](/serialization-form.md) — the `serialize` module, the DAG's sole leaf.
- [C3Project Handle](/c3project-handle.md) — the `project` module, at the top of the DAG.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^jsdoc-asymmetry-experiment]: Controlled api-surface JSDoc-asymmetry experiment (2026-08-20 capture)
