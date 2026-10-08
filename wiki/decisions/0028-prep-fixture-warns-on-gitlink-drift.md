---
type: decision-context
title: "ADR 0028 — prep-fixture warns (does not fail) when construct3-sample drifts from its pinned gitlink, comparing against the index"
description: scripts/prep-fixture.mjs calls findGitlinkDrift before materializing and prints a warning naming both SHAs and both remedies when the construct3-sample checkout differs from the gitlink in the superproject's index; it reads the pin from the index (so a staged bump is not drift) and warns rather than throws (so testing an unpinned upstream commit stays possible).
tags: [adr, testing, fixtures, tooling]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-05T12:00:00Z }
sources:
  - id: issue-88
    resource: ../../raw/issue-88-gitlink-drift-2026-10-05.md
    title: "c3source#88 and its comments (2026-10-05 capture)"
    last_modified: 2026-10-05
  - id: issue-88-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/88
    title: "c3source#88 — prep-fixture should detect a construct3-sample checkout that drifted from its pin"
---

# ADR 0028 — prep-fixture warns (does not fail) when construct3-sample drifts from its pinned gitlink, comparing against the index

**Status:** partially superseded by [ADR 0029](/decisions/0029-prep-fixture-drift-fatal-under-explicit-opt-in.md) — drift is fatal when PREP_FIXTURE_STRICT is on; the index comparison and the default warning below remain in effect; [ADR 0030](/decisions/0030-prep-fixture-strict-fails-on-unverifiable-pin.md) makes an unverifiable pin fatal under strict, but never-throws still holds
**Date:** 2026-10-05
**Issue:** [#88](https://github.com/GenvidTechnologies/c3source/issues/88)

## Context

`scripts/prep-fixture.mjs` materializes `test/fixtures/canonical/` from the
`construct3-sample` submodule's checked-out `HEAD` ([ADR
0019](/decisions/0019-hermetic-fixture-materialization.md)), not from the gitlink
the superproject records. When the two differ, `npm test` silently grades an
unpinned golden. This happened on 2026-10-01: the checkout sat at `b3001bd`
while the gitlink was `c6884ff`[^issue-88]. Any fixture-gated run in that state would have
graded the wrong corpus with nothing in the output to say so; it was caught
only because a design agent compared the two SHAs by hand. The only safeguard
afterwards was the documentation note
[#86](https://github.com/GenvidTechnologies/c3source/issues/86) added, asking
the reader to make that comparison, which helps only whoever reads it.

The fixture gate ([ADR
0026](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md)) guards
the *path* and *presence* axes. It does not guard *which commit* was
materialized: a drifted checkout can have every expected path.

## Decision

A new helper, `findGitlinkDrift(superRoot, subPath)` in
`scripts/gitlink-drift.mjs`, returns `{ pinned, head }` when the submodule's
checked-out `HEAD` differs from the pinned gitlink, and `null` otherwise.
`prep-fixture.mjs` calls it after its two existing guards (submodule absent,
checkout not a git repo) and before the wipe/archive step. On drift it prints
one `console.warn` naming both SHAs and both remedies, then continues: exit 0,
fixture still materialized.

**The pin is read from the superproject's index**, via `git ls-files -s --
<subPath>` (exactly one mode-160000 entry), and the head via `git rev-parse
HEAD` inside the submodule. The helper never throws: it returns `null` for
not-a-repo, path-not-registered, not-a-gitlink, a multi-stage merge conflict,
an unreadable submodule `HEAD`, and equality. A guard that can crash the
`pretest` hook would be worse than the gap it closes, so every
"cannot establish drift" case degrades to "say nothing".

**Remedies in the warning:** `git submodule update construct3-sample` restores
the pin; `git add construct3-sample` stages a deliberate bump (after which the
index and `HEAD` agree and the warning stops).

## Compromise

**Compare against `git ls-tree HEAD`, not the index.** Rejected. Mid
pin-bump, the normal state is a *staged* gitlink that `HEAD` does not hold yet.
A probe in a scratch repo confirmed the split: after `git add <sub>`,
`git ls-files -s` showed the new SHA while `git ls-tree HEAD` still showed the
old one. An `ls-tree HEAD` comparison would therefore false-warn on every
staged bump, training developers to ignore the one warning whose job is to be
believed. The index is the pin the developer has most recently declared.

**Throw instead of warn.** Rejected. Deliberately testing an unpinned upstream
commit (for example, trying a not-yet-tagged `construct3-sample` change before
pinning it) is a legitimate, if rare, workflow, and a throw would make it
impossible without editing the script. The warning makes the state visible
without forbidding it. The cost: a developer who ignores the warning still gets
a result against the wrong corpus; the gate informs, it does not enforce.

**A documentation note only.** Rejected. That was the existing stopgap, and it
is what failed on 2026-10-01: a note only helps whoever reads it, while the
warning prints in the run where the drift matters.

**Fatal under CI.** Deferred, not rejected. In CI a mismatch is never intended,
so a hard failure there would cost nothing. It is left to a follow-up,
[#90](https://github.com/GenvidTechnologies/c3source/issues/90) (filed
2026-10-05), so this change stays a pure addition with no new failure mode.

## Consequences

- **No semver bump, no `src/` change.** `scripts/` is development tooling and is
  not in the npm tarball (`package.json` `files` is `dist`, `LICENSE`,
  `README.md`).
- **Mutation control.** Detaching the real submodule to `HEAD~1` (`b3001bd`, the
  2026-10-01 incident commit) produced the warning, exit 0, and a materialized
  fixture of 117 files against 122 at the pin `fe53059`; restoring with `git
  submodule update` removed the warning.
- **Test coverage.** `test/gitlinkDrift.test.ts` is ungated: it builds a
  throwaway superproject in a temp directory and creates the gitlink with
  `git update-index --cacheinfo`, without `git submodule add`, so it needs
  neither submodule checked out. The helper is typed by hand in
  `scripts/gitlink-drift.d.mts`.
- **Extends, does not revise,** ADR 0019 (materialization source) and ADR 0026
  (the fixture gate's other axes).

## Related

- [ADR 0019 — Hermetic fixture materialization](/decisions/0019-hermetic-fixture-materialization.md) — defines the checked-out-HEAD source whose drift this guard reports.
- [ADR 0026 — Fixture gate: skip-if-absent / throw-if-moved](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md) — the sibling warn-vs-throw decision for the path axis.
- [ADR 0029 — prep-fixture treats gitlink drift as fatal only under an explicit PREP_FIXTURE_STRICT opt-in](/decisions/0029-prep-fixture-drift-fatal-under-explicit-opt-in.md) — resolves the "Fatal under CI" deferral above.
- [Canonical Reference Fixture](/canonical-fixture.md) — the current-state description of the drift guard.

[^issue-88]: c3source#88 and its comments (2026-10-05 capture)