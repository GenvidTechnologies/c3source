---
type: reference
title: Development Workflow
description: c3source's day-to-day working conventions — npm/Node, the four checks and the gate that chains them, mocha/chai/tsx test invocation, the hard rule against running Prettier, the file:line citation policy, and the ephemeral-work-doc / durable-record split.
tags: [workflow, testing, mocha, linting, prettier, design-records]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Development Workflow

## Commands and the validation gate

Package manager is **npm** (Node >= 22)[^claude-md]:

```sh
npm install
npm run lint        # eslint, --max-warnings 0 over src/ and test/ (test/fixtures/ excluded)
npm run typecheck   # tsc against tsconfig.test.json (src + test, excluding test/fixtures/), --noEmit
npm run test        # mocha + tsx, runs test/**/*.test.ts
npm run build       # tsc -> dist/ (the published artifact)
```

**The full validation gate is the `.gvt-agent.json` `commands.validate`
chain** (`npm run lint && npm run typecheck && npm run test && npm run
build`), **not** an npm script — there is no `npm run validate`[^claude-md].
Don't look for it in `package.json`; it is defined in `.gvt-agent.json`.

## Running a single test

```sh
npx mocha --timeout 5000 --import=tsx --require ./test/setup.ts test/extractEventSheetScripts.test.ts --exit
npx mocha --timeout 5000 --import=tsx --require ./test/setup.ts 'test/**/*.test.ts' --grep "scope" --exit
```

A computed `.mocharc.cjs` at the repo root applies to **every** mocha
invocation above, including a single-file/`--grep` recipe: it arms
`--forbid-pending` whenever both gated fixtures (the canonical project
fixture and the SDK sample) are materialized, so a run that hits an
unexpected `this.skip()` fails outright rather than reporting a quiet "0
failing"[^claude-md]. See [ADR
0026](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md)
and [Canonical Reference Fixture](/canonical-fixture.md) for the full
skip-vs-throw gating story this backstop supports.

Tests use **mocha + chai** with **tsx** for on-the-fly TS execution — no
build step needed. `test/setup.ts` is a mocha root hook that silences
`console.log` and `console.debug` during runs (warn/error pass through), so
library code may log freely[^claude-md].

## Formatting

Prettier: `printWidth` 120, spaces in code. **JSON files use tabs**, no
bracket spacing (mirrors C3 serialization). ESLint extends `prettier` and
deliberately disables `no-unused-vars` and `no-explicit-any`[^claude-md].

**Formatting is not enforced by any check.** `npm run lint` is eslint-only,
and `eslint-config-prettier` merely *disables* eslint rules that would
conflict with Prettier — there is no `prettier` dependency and no
`--check` step anywhere. Formatting drift (e.g. a multi-line union collapsed
to one line) passes lint/typecheck/test/build untouched — **review is the
only formatting gate**; match the surrounding style by hand rather than
relying on CI[^claude-md].

### Never run Prettier here

**Never run `prettier` / `prettier --write` (or `npx prettier`).** Because
no local prettier config is wired to the checks, it falls back to
Prettier's **defaults** (printWidth 80, bracket spacing) — *not* this
repo's `printWidth` 120 / no-bracket-spacing conventions — so it rewrites
unrelated code: it collapses the intentional multi-line unions and
re-spaces brackets across the whole file, producing drift hunks you then
must hand-revert. Format by hand to match the surrounding style
instead[^claude-md]. This is a hard rule, not a preference — the two facts
above (no wired config, and formatting being otherwise unenforced) compound:
a Prettier run would both silently diverge from the repo's actual
conventions *and* leave no CI signal to catch the divergence before review.

## The `file:line` citation policy

**Citation style differs between `CLAUDE.md` and published documentation.**
`CLAUDE.md` cites `file:line` freely — it is maintained every session and a
stale offset is noticed and fixed quickly. **`wiki/` pages should not** (nor
did the `docs/` tree they replaced): these ship to three downstream repos
where a stale `:149-151` misleads longer than it helps. Name the symbol instead — it is stable, and `grep` finds
it[^claude-md]. The rot is not hypothetical: within one branch, a dispatch
brief cited a function at one line number and the agent found it eleven
lines later, because an earlier commit in the same branch had added six
lines above it[^claude-md]. **This rule applies to every wiki page as
well** — never cite `file:line` here; name the symbol.

**This is a forward-looking rule, not a description of the current
tree.** An earlier claim that `docs/` carried zero `file:line` citations
was measured and found false — they lived only in decision records
predating the rule's articulation. **Re-measured on 2026-08-20 during the
wiki migration, the published figure of 20 was itself off by one:** the ADRs
carry **21** citation occurrences — 13 in ADR 0018, 6 in ADR 0023, 2 in ADR
0020 — or **17 distinct** file-and-line pairs, since ADR 0018 repeats
`src/layouts.ts:107` and `src/project.ts:212-215` three times each. ADR 0018
has 13 occurrences, not the 12 previously recorded. They are left in
place, since an accepted ADR states the situation at its date; but they are
not the convention, and nothing new should join them[^claude-md]. The
lesson generalizes: an argument built *from* an absence should have that
absence measured, not assumed — the paragraph that first stated the rule
argued from an absence that did not in fact exist.

## Design records & branches

Feature branches are squashed on merge, and work documents under
`docs/superpowers/` (specs, plans) are routinely cleaned up — treat them as
ephemeral scaffolding, not durable records. The root `plan.md` produced by
the `plan-task` workflow is the same, and in this repo it is
**gitignored** (`/plan.md`): it stays a **local-only working artifact** —
never committed, so there is no prep commit and nothing to remove at PR
creation[^claude-md].

The durable record of a design or decision is the **GitHub issue or PR**
(post the spec as an issue comment or in the PR body, where it survives the
squash) — and the PR body should be a concise summary linking to real docs,
not a paste of the design spec. For **architecture and trade-off decisions**
specifically, the durable in-repo record is an **ADR under
`wiki/decisions/`** (MADR-lite, authored via `/gvt-dev:create-adr` and
indexed in [the decision-records index](/decisions/index.md)): the ADR's
**Compromise** section preserves the rejected-alternatives rationale a
squashed PR body would otherwise lose, complementing — not replacing — the
issue/PR record[^claude-md].

Never cite an unpushed local branch or commit hash in external
communication (issue/PR comments) — link to something the reader can
actually open, or push first[^claude-md].

## Related

- [Canonical Reference Fixture](/canonical-fixture.md) — the fixture-gate skip-vs-throw story and `.mocharc.cjs`'s `--forbid-pending`.
- [CI & Publishing](/ci-and-publishing.md) — where these checks run in the shared GitHub Actions gate.
- [Design Patterns](/design-patterns.md) — the reusable engineering patterns this workflow's tests and tooling are built on.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
