# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`c3source` is a TypeScript library of typed interfaces and traversal/formatting
functions for **Construct 3 (C3) project source files on disk** — layouts,
layers, instances, object types, and event sheets. It is consumed by build
tools, code generators, and analyzers that inspect or mutate C3 JSON outside
the C3 editor. There is no runtime application; it ships as a library.

**Known consumers** (all checked out under `C:\repos` on a dev machine, all
depending on the published `@genvidtech/c3source`): **`burbank`**, **`construct3-chef`**
(the heaviest consumer), and **`c3-domain-manager`**. Because the package is
public, that list is a floor rather than a census — but it is the set whose
breakage is *observable from this machine*, so **measure the blast radius of an
API change by grepping all three**, not by reasoning about what a hypothetical
caller might do. The consumers' own decision records are evidence too, and can
be blocking. See [Library Overview](wiki/library-overview.md) for the worked
examples behind this rule.

## Knowledge base — read this before answering an architecture question

**This repo's documentation lives in an LLM-wiki under `wiki/`, not in `docs/`.**
Architecture, the C3 domain facts, the API surface, the fixture mechanism, and
all 26 Architecture Decision Records were migrated there on 2026-08-20. `docs/`
now holds only the four files the tooling contract requires.

Start at **[`wiki/index.md`](wiki/index.md)** — it lists every page with a
one-line description. Direct routes:

| Question | Page |
|---|---|
| What is this library, who consumes it, what is it pinned to? | [`wiki/library-overview.md`](wiki/library-overview.md) |
| Module DAG, the barrel, dist entry points, API-surface verification | [`wiki/module-architecture.md`](wiki/module-architecture.md) |
| File walks, editor-local vs source, item-hood, layer visitors | [`wiki/layout-traversal.md`](wiki/layout-traversal.md) |
| `project.c3proj` model, strict/tolerant parse, drift detection | [`wiki/project-manifest.md`](wiki/project-manifest.md) |
| `openProject`, path fields, the manifest write-through cache | [`wiki/c3project-handle.md`](wiki/c3project-handle.md) |
| Event numbering, scopes, the DSL, expression tokenizing | [`wiki/event-sheet-extraction.md`](wiki/event-sheet-extraction.md) |
| `.c3addon` packages, attribution, the ACE model | [`wiki/addon-domain-layer.md`](wiki/addon-domain-layer.md) |
| Unresolved cross-references, the five `ReferenceIssue` kinds | [`wiki/reference-integrity.md`](wiki/reference-integrity.md) |
| **A C3 platform fact, and how it was validated** | [`wiki/c3-domain-facts.md`](wiki/c3-domain-facts.md) |
| The `construct3-sample` golden fixture and pin-bump hazards | [`wiki/canonical-fixture.md`](wiki/canonical-fixture.md) |
| Tab indent, no trailing newline, the `.brush.json` exception | [`wiki/serialization-form.md`](wiki/serialization-form.md) |
| Reusable patterns this repo has settled on | [`wiki/design-patterns.md`](wiki/design-patterns.md) |
| **Why** a design is the way it is | [`wiki/decisions/index.md`](wiki/decisions/index.md) |

Two rules when working with the wiki:

- **`raw/` is immutable.** It holds verbatim captures of every source a wiki
  page was built from. Never edit a file there; re-capture it as a new file
  instead. `docs/wiki-schema.md` is the binding maintenance schema.
- **Never cite `file:line` in a wiki page.** These pages ship to three
  downstream repos, where a stale line offset misleads longer than it helps.
  Name the symbol — it is stable, and `grep` finds it. (Existing `file:line`
  citations inside ADRs 0018/0020/0023 are left alone: an accepted record
  states the situation at its date.)

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

A computed `.mocharc.cjs` at the repo root applies to **every** mocha
invocation above, including a single-file/`--grep` recipe: it arms
`--forbid-pending` whenever both gated fixtures (the canonical project
fixture and the SDK sample) are materialized, so a run that hits an
unexpected `this.skip()` fails outright rather than reporting a quiet
"0 failing." See [ADR
0026](wiki/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md).

Tests use **mocha + chai** with `tsx` for on-the-fly TS execution (no build
step needed). `test/setup.ts` is a mocha root hook that silences `console.log`
and `console.debug` during runs (warn/error pass through), so library code may
log freely.

## Design records & branches

Feature branches are squashed on merge, and work documents under
`docs/superpowers/` (specs, plans) are routinely cleaned up — treat them as
ephemeral scaffolding, not durable records. The root `plan.md` produced by the
`plan-task` workflow is the same, and in this repo it is **gitignored**
(`/plan.md`): it stays a **local-only working artifact** — never committed, so
there is no prep commit and nothing to remove at PR creation. This keeps a
stale `plan.md` from ever leaking onto `main` and misleading a later session
into reading the wrong plan.

The durable record of a design or decision is the **GitHub issue or PR** (post
the spec as an issue comment or in the PR body, where it survives the squash) —
and the PR body should be a concise summary linking to real docs, not a paste of
the design spec. For **architecture and trade-off decisions** specifically, the
durable in-repo record is an **ADR under `wiki/decisions/`** (MADR-lite,
authored via `/gvt-dev:create-adr` and indexed in
[`wiki/decisions/index.md`](wiki/decisions/index.md)): the ADR's **Compromise**
section preserves the rejected-alternatives rationale a squashed PR body would
otherwise lose, complementing — not replacing — the issue/PR record.

> **ADRs moved on 2026-08-20** from `docs/decisions/` to `wiki/decisions/`,
> keeping their numbering and filenames. `.gvt-agent.json`'s
> `paths["docs/decisions/"]` declares the override, so `/gvt-dev:create-adr`
> and `audit-conventions` resolve the new location. If a skill still scaffolds
> into `docs/decisions/`, that override is what needs fixing — do not move the
> ADRs back.

Never cite an unpushed local branch or commit hash in external communication
(issue/PR comments) — link to something the reader can actually open, or push
first.

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

**The package changed scope at 1.6.0** — `0.0.1`–`1.5.0` were published as
`@genvid/c3source`, `1.6.0` onward as `@genvidtech/c3source` (#41). All twelve
versions of the old name were **deprecated on 2026-08-12** with the message
`moved to @genvidtech/c3source`, so a fresh `npm install @genvid/c3source` now
warns and points at the right package. **A deprecation warns; it does not
block or unpublish** — the old name still installs, still resolves `latest` to
1.5.0, and an existing lockfile pin keeps resolving silently without ever
re-printing the warning. So still treat a consumer reporting behaviour that
predates 1.6.0 as possibly on the old name before debugging the code; the
deprecation improves the signal for *new* installs only.

**`CHANGELOG.md` exists as of 2.0.0** and is the per-version release record
(Keep a Changelog); entries before 2.0.0 were backfilled from git history. Every
release must move `## [Unreleased]` into a dated `## [X.Y.Z]` section **before**
the tag is pushed — `/gvt-dev:release-npm-package` does this automatically, but
it is easy to miss on a hand-cut release. Note the file is deliberately **not**
in `package.json`'s `files` allowlist (`dist`, `LICENSE`, `README.md`), so it
ships on GitHub but not in the npm tarball. Two older records predate it and are
left unedited, since an accepted ADR states the situation at its date: [ADR
0024](wiki/decisions/0024-script-source-fact-and-dotted-extensions.md) reasons
explicitly from "with no CHANGELOG.md in this repo".
