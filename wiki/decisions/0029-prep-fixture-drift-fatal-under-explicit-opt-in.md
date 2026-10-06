---
type: decision-context
title: "ADR 0029 — prep-fixture treats gitlink drift as fatal only under an explicit PREP_FIXTURE_STRICT opt-in, which CI sets"
description: scripts/prep-fixture.mjs exits 1 before wiping the fixture when construct3-sample drifts from its pinned gitlink and PREP_FIXTURE_STRICT is 1 or true; the default stays the ADR 0028 warning, an unrecognized value is itself an error, and CI opts in visibly through a generic extra-env input on the shared node-gate workflow rather than keying on the CI variable.
tags: [adr, testing, fixtures, tooling, ci]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-06T12:00:00Z }
sources:
  - id: issue-90
    resource: ../../raw/issue-90-prep-fixture-strict-2026-10-06.md
    title: "c3source#90 and its comments (2026-10-06 capture)"
    last_modified: 2026-10-06
  - id: issue-90-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/90
    title: "c3source#90 — feat: make prep-fixture gitlink drift fatal under CI"
  - id: issue-88
    resource: ../../raw/issue-88-gitlink-drift-2026-10-05.md
    title: "c3source#88 and its comments (2026-10-05 capture)"
    last_modified: 2026-10-05
---

# ADR 0029 — prep-fixture treats gitlink drift as fatal only under an explicit PREP_FIXTURE_STRICT opt-in, which CI sets

**Status:** accepted
**Date:** 2026-10-06
**Issue:** [#90](https://github.com/GenvidTechnologies/c3source/issues/90)

Partially supersedes [ADR 0028](/decisions/0028-prep-fixture-warns-on-gitlink-drift.md)'s "Fatal under CI: deferred" Compromise entry. ADR 0028's index comparison, its never-throws `findGitlinkDrift` helper and the default warning all remain in effect.

## Context

ADR 0028 made `prep-fixture.mjs` warn when the `construct3-sample` checkout
differs from the gitlink, and deferred a hard failure in CI to this issue[^issue-90].
A warning in a CI log is easy to miss, and in CI a mismatch is never intended.
But a CI checkout follows the gitlink by construction, so the drift this guard
reports cannot arise there today; the fatal path is a tripwire for a future
checkout configuration, not a fix for a live failure.

The shared gate is a reusable workflow, `node-gate.yml` in
`GenvidTechnologies/public-github-actions`, called from 14 caller files in 7
repos, all pinned `@main`. A caller's `env:` does not reach a called workflow,
so c3source had no way to hand the script a variable without a change there.

## Decision

**Strict mode is an explicit opt-in: `PREP_FIXTURE_STRICT`.** `parseStrictFlag`
and the `STRICT_ENV` constant live in `scripts/gitlink-drift.mjs`. `1` and
`true` turn it on; unset, empty, `0` and `false` leave it off; any other value
is invalid.

**`prep-fixture.mjs` parses the flag first, before its guards.** An invalid
value prints a message naming the accepted values and the value received, and
exits 1. An unrecognized value is fatal on purpose: a typo that silently
disables strictness is exactly the "easy to miss" failure this issue exists to
remove.

**On drift with strict on, the script exits 1 before the wipe.** It prints both
SHAs, says the fixture will not be materialized from an unpinned checkout, and
repeats ADR 0028's two remedies. Because the exit precedes the `rmSync`, an
existing fixture survives. With strict off, the ADR 0028 warning is printed
and the run continues, unchanged.

**What stays as it was.** `findGitlinkDrift` is untouched. A `null` result
("no drift" or "could not tell") stays silent, which keeps ADR 0028's
never-throws contract. The two guards (submodule not checked out; not a git
repository) still exit 0. Making those fatal, and gating `publish.yml` (which
passes no submodules, so the release gate self-skips the fixture), is out of
scope; a follow-up issue tracks both.

**CI opts in visibly.** `node-gate.yml` gained a generic `extra-env` input
(public-github-actions
[PR #3](https://github.com/GenvidTechnologies/public-github-actions/pull/3)):
newline-separated `KEY=VALUE` lines written to `$GITHUB_ENV` after checkout,
skipped when empty. c3source's `ci.yml` passes `PREP_FIXTURE_STRICT=1` through
it. Local runs leave it unset, so they warn and the unpinned-commit workflow
stays possible.

## Compromise

**Key on `process.env.CI`.** Rejected. It is implicit, so nothing in `ci.yml`
shows that CI behaves differently. It would also make any local shell that has
`CI` set fatal, and `construct3-chef` keys on `CI` for an unrelated purpose, so
the variable's meaning is already contested. The user chose visibility over
zero cross-repo cost.

**A specific `node-gate` input such as `strict-fixture-pin`.** Rejected. It
would leak one consumer's variable into a workflow shared by 14 caller files in
7 repos. A generic `extra-env` serves the next consumer without another edit.

**A JSON `env` input.** Rejected. Expression support for it in a reusable
workflow was unverified, and a JSON blob in a YAML caller reads worse than
`KEY=VALUE` lines.

**A sibling, non-reusable pin-check job.** Rejected. It would check a different
checkout from the one the gate grades, so it could pass while the graded
checkout drifted.

**Key on `GITHUB_WORKFLOW_REF`.** Rejected. Implicit, for the same reason as
`CI`.

**Strict in `pretest`.** Rejected. It would kill the local unpinned-commit
workflow ADR 0028 chose to preserve.

**A repository variable.** Rejected. It is invisible in `ci.yml`, so a reader
cannot see the gate's behaviour from the repo.

**Test seams.** A helper-only test (T-B) cannot prove exit-before-wipe. A
child-process-only test (T-C) pays extra spawns to cover the flag grammar.
The chosen split is unit tests for the grammar plus a spawned real script,
copied into a temp tree with throwaway git repos, for the exit code, the exact
stderr, and a sentinel file that must survive.

**A `--root` / `PREP_FIXTURE_ROOT` override.** Rejected. It would be a test-only
knob steering a destructive `rmSync`; copying the script into the temp tree
needs no such knob.

**Cost accepted.** No end-to-end CI positive control for drift is possible,
since a CI checkout follows the gitlink by construction. The temp-tree tests and
three mutations (removing the strict exit, wiping before the strict check,
making `CI` the switch) are the evidence, and each turned a test red.

## Consequences

- **No semver bump, no `src/` change.** `scripts/` is development tooling and is
  not in the npm tarball.
- **Cross-repo change.** The `extra-env` input lives in
  `public-github-actions`; it is generic and skipped when empty, so the other
  callers are unaffected.
- **Test coverage.** `test/gitlinkDrift.test.ts` covers the flag grammar;
  `test/prepFixture.test.ts` spawns the real script and also asserts that
  `ci.yml` carries the opt-in line, so removing it turns a test red.
- **Extends** ADR 0028 and, through it, ADR 0019 and ADR 0026.

## Related

- [ADR 0028 — prep-fixture warns when construct3-sample drifts from its pinned gitlink](/decisions/0028-prep-fixture-warns-on-gitlink-drift.md) — the default warning and index comparison this builds on; its CI-fatal deferral is what this resolves.
- [ADR 0026 — Fixture gate: skip-if-absent / throw-if-moved](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md) — the sibling warn-vs-throw decision for the path axis.
- [Canonical Reference Fixture](/canonical-fixture.md) — the current-state description of the drift guard.

[^issue-90]: c3source#90 and its comments (2026-10-06 capture)
