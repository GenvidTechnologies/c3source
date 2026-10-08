---
type: decision-context
title: "ADR 0030 — under PREP_FIXTURE_STRICT, prep-fixture fails when the construct3-sample pin cannot be verified, and the publish gate opts in too"
description: Under PREP_FIXTURE_STRICT, scripts/prep-fixture.mjs exits 1 with an ERROR line, before the wipe, when project.c3proj is absent, construct3-sample is not its own git repository, or the new never-throwing checkGitlinkPin returns unknown; publish.yml's gate now checks out submodules recursively and sets the same strict opt-in as ci.yml. Non-strict behaviour and findGitlinkDrift's null contract are unchanged.
tags: [adr, testing, fixtures, tooling, ci, publishing]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-06T18:00:00Z }
sources:
  - id: issue-93-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/93
    title: "c3source#93 — strict prep-fixture must fail when the construct3-sample pin cannot be verified"
---

# ADR 0030 — under PREP_FIXTURE_STRICT, prep-fixture fails when the construct3-sample pin cannot be verified, and the publish gate opts in too

**Status:** accepted
**Date:** 2026-10-06
**Issue:** [#93](https://github.com/GenvidTechnologies/c3source/issues/93)

Partially supersedes [ADR 0029](/decisions/0029-prep-fixture-drift-fatal-under-explicit-opt-in.md): its guards no longer always exit 0, a null/unknown pin result is no longer always silent, and `publish.yml` is now in scope. Partially supersedes [ADR 0028](/decisions/0028-prep-fixture-warns-on-gitlink-drift.md)'s "say nothing" clause for an unverifiable pin, under strict only; its never-throws contract still holds.

## Context

ADR 0029 made a *detected* drift fatal under `PREP_FIXTURE_STRICT`, but left
three ways for the strict check to pass without checking anything: the
submodule absent, the submodule not a git repository of its own, and
`findGitlinkDrift` returning `null` for "could not tell". Each ended in a
silent skip or silence, so strict mode was green by default exactly when the
pin was unknowable[^issue-93].

`publish.yml` was the live case. Its gate passed no submodules, so the
construct3-sample checkout was absent and the fixture self-skipped. The v2.0.1
publish run logged "submodule not checked out; skipping" and the
`--forbid-pending` disable (ADR 0026); the analyst read roughly 358 passing and
158 pending from that log, a count inherited rather than re-verified here. The
release gate therefore graded a fraction of the suite. No tag run has used the
fix yet, so the first release after merge is the real check.

A related defect surfaced on the way: the own-repository guard used
`git rev-parse --git-dir`, which walks up to c3source's own `.git` when the
submodule's `.git` is missing. That produced a false drift under strict, and
under non-strict a crash after the wipe.

## Decision

**A new helper, `checkGitlinkPin(superRoot, subPath)`.** It lives in
`scripts/gitlink-drift.mjs`, never throws, and returns one of three states:
clean, drift, or unknown (with a reason). It is declared in
`scripts/gitlink-drift.d.mts` as `GitlinkPinStatus`. `findGitlinkDrift` is now a
thin wrapper over it and keeps ADR 0028's null contract: `null` still means "no
drift or could not tell".

**Under strict, three conditions exit 1 with an `ERROR:` line.** (a)
`project.c3proj` is absent, (b) construct3-sample is not its own git
repository, (c) `checkGitlinkPin` returns unknown. None prints "skipping": a
failing run must not claim it is skipping. Every strict exit happens before the
`rmSync`, so an existing fixture survives.

**The own-repository check is `git rev-parse --show-prefix` printing an empty
string.** That is true only at the root of a repository, so a missing `.git`
inside the submodule no longer resolves to the superproject.

**Non-strict is unchanged wherever a guard fired before.** Messages are
byte-identical and the exit stays 0. An unknown pin in non-strict mode stays
silent. One side effect: a submodule whose `.git` was removed used to crash
after wiping the fixture; it now gets the clean "not a git repository" skip.

**`publish.yml`'s gate opts in.** It passes `submodules: recursive` and
`extra-env: PREP_FIXTURE_STRICT=1`, the same as `ci.yml`, so the release gate
grades the pinned fixture instead of self-skipping. construct3-sample is public
and checkout rewrites its SSH URL to HTTPS, so no token is needed.

## Compromise

**Change `findGitlinkDrift`'s return (option B).** Rejected. Five assertions
would churn, and accepted ADR 0028's null contract would stop matching the code.

**Have prep-fixture re-parse `ls-files` itself (option C).** Rejected. Two
parsers of one index entry, inside `scripts/`, which no lint or typecheck covers.

**Compare `--show-toplevel` paths.** Rejected. Slash, case and 8.3 short-path
normalization on Windows make the comparison unreliable; `--show-prefix` has
no paths to normalize.

**`submodules: recursive` alone in `publish.yml`.** Rejected. Removing the
checkout later would silently return the gate to green-by-skip; the strict
input is what turns that into a failure.

**Reuse the existing "skipping" messages under strict.** Rejected, as above.

**Cost accepted.** The first release after merge is the only end-to-end check
of the publish change. The unit and temp-tree tests (G1-G7, the replaced P6, P8-P13) and six
mutations, each turning exactly its own test red, are the evidence until then.

## Consequences

- **No semver bump, no `src/` change.** `scripts/` is not in the npm tarball.
- **`PREP_FIXTURE_STRICT=1 npm test` fails fast without the submodule.**
- **Out of scope, recorded and not fixed:**
  - Non-strict with an unborn submodule HEAD still wipes the fixture and then
    crashes in `git archive`.
  - prep-fixture never checks `SDK/`, so a missing SDK still disables
    `--forbid-pending`, even under strict; the manual pending-count check
    remains the safeguard.
  - An inherited `GIT_DIR` (for example from a git hook) would redirect the
    `git -C` calls. This is unprobed.
- **Test coverage.** `test/gitlinkDrift.test.ts` covers `checkGitlinkPin`;
  `test/prepFixture.test.ts` spawns the real script for the strict exits and
  checks the workflow opt-ins.
- **Extends** ADR 0028 and ADR 0029.

## Related

- [ADR 0029 — prep-fixture treats gitlink drift as fatal only under an explicit PREP_FIXTURE_STRICT opt-in](/decisions/0029-prep-fixture-drift-fatal-under-explicit-opt-in.md) — the strict mode this extends.
- [ADR 0028 — prep-fixture warns when construct3-sample drifts from its pinned gitlink](/decisions/0028-prep-fixture-warns-on-gitlink-drift.md) — the never-throws helper and null contract.
- [ADR 0026 — Fixture gate: skip-if-absent / throw-if-moved](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md) — the `--forbid-pending` backstop this does not extend to `SDK/`.
- [Canonical Reference Fixture](/canonical-fixture.md) and [CI & Publishing](/ci-and-publishing.md) — the current-state descriptions.

[^issue-93]: c3source#93 and its comments
