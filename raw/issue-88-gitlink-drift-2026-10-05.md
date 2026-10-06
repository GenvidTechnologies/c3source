# Issue #88 — prep-fixture gitlink drift (capture)

Captured 2026-10-05 for GenvidTechnologies/c3source#88, verbatim from `gh issue view 88 --json title,body,comments`. Upstream: https://github.com/GenvidTechnologies/c3source/issues/88 (opened 2026-10-05T14:41:31Z).

## Title

feat: prep-fixture warns when the construct3-sample checkout differs from the pinned gitlink

## Body

## Problem

`scripts/prep-fixture.mjs` materializes the canonical fixture with `git archive HEAD` of the `construct3-sample` submodule **checkout**. It never compares that checkout with the commit the superproject actually pins (the gitlink). When the two differ, `npm test` silently grades a different golden from the one c3source records, and nothing in the output says so.

This is not hypothetical. While planning #86 (2026-10-01), the submodule checkout sat at `b3001bd` (upstream `main`, untagged) while the gitlink was `c6884ff` (`v1.1.0`). Any test run in that state would have materialized `b3001bd`: a green or red result about a fixture no commit of c3source points at. It was caught only because a design agent compared the two by hand.

`wiki/canonical-fixture.md` already explains that materialization reads the *tracked HEAD content* (so uncommitted submodule edits are invisible). It doesn't cover the HEAD-vs-gitlink gap, and a doc note only helps whoever reads it.

## Proposed change

In `prep-fixture.mjs`, before archiving, compare the submodule's `HEAD` with the **index** gitlink (`git ls-files -s construct3-sample`). Use the index rather than `git ls-tree HEAD`, so that a pin bump whose new gitlink is already staged, the normal mid-bump state, passes.

On a mismatch, print a clear warning naming both SHAs and the remedy (`git submodule update`, or stage the new pin).

Warn rather than throw, at least at first. A developer deliberately testing an unpinned upstream commit is a legitimate (if rare) workflow. A follow-up could make it fatal under CI, where a mismatch can never be intended.

## Acceptance (sketch)

- With HEAD == the index gitlink: no warning, same behaviour as today.
- With HEAD ahead of an unstaged gitlink: a warning naming both SHAs.
- With the new gitlink staged (`git add construct3-sample`): no warning.
- Covered by a test against a temp superproject + submodule, not the real fixture.

Related: #86 (where this surfaced; its plan adds a doc note to `wiki/canonical-fixture.md` as a stopgap).

## Acceptance Criteria

Pledged 2026-10-05 by the plan for branch `feat/prep-fixture-gitlink-drift`. Supersedes the *Acceptance (sketch)* above, which is kept as the author's sketch: sketch-1 → R1, sketch-2 → R2+R6, sketch-3 → R3, sketch-4 → R5. R4 and R7–R11 are new. R8 corrects the #86 stopgap note, which told readers to compare against `git ls-tree HEAD`; a probe showed that false-warns mid-bump.

- [ ] **R1** `findGitlinkDrift(superRoot, subPath)` (in `scripts/gitlink-drift.mjs`) returns `null` when the submodule `HEAD` equals the index gitlink. *Verified by:* unit test.
- [ ] **R2** When the submodule `HEAD` is ahead of an unstaged gitlink, it returns `{pinned, head}` with both full 40-char SHAs. *Verified by:* unit test.
- [ ] **R3** With the new gitlink staged, it returns `null`, and the test also asserts that `git ls-tree HEAD` still shows the old pin, so the case can't pass by accident. *Verified by:* unit test.
- [ ] **R4** It returns `null` and does not throw when the path isn't registered in the index or the superproject isn't a git repo. *Verified by:* unit test.
- [ ] **R5** The test file is ungated: no `fixtureExists`/`this.skip`. It builds only a `mkdtemp` tree, and uses no `git submodule add` and no `file://` protocol. *Verified by:* reading the test.
- [ ] **R6** `scripts/prep-fixture.mjs` calls the helper before the wipe/archive. On drift it uses `console.warn`, not `throw` or `process.exit`, naming both SHAs, `git submodule update`, and `git add construct3-sample`. *Verified by:* reading the diff.
- [ ] **R7** `[point-in-time]` Mutation control on the real repo: with `construct3-sample` detached to `HEAD~1`, `npm run prep-fixture` prints the warning, exits 0 and materializes the fixture. After `git submodule update`, no warning. Evidence is recorded on this issue. *Verified by:* orchestrator run.
- [ ] **R8** `wiki/canonical-fixture.md` has 0 occurrences of `ls-tree HEAD` (baseline 1) and 0 of `proposed in c3source#88` (baseline 1), and it describes the guard and why it reads the index. *Verified by:* `grep -c -F` on that file only.
- [ ] **R9** An ADR `wiki/decisions/0028-*.md` exists, is indexed in `wiki/decisions/index.md`, and records the index-vs-HEAD and warn-vs-throw choices with their rejected alternatives. *Verified by:* file read.
- [ ] **R10** `CHANGELOG.md` `[Unreleased]` has an entry citing #88. *Verified by:* grep.
- [ ] **R11** The full validate chain (lint, typecheck, test, build) is green: `fail 0`, and the pass count goes up by exactly the new test file's test count. *Verified by:* validator.

## Comment by ninoles (2026-10-05T20:33:56Z)

Source: https://github.com/GenvidTechnologies/c3source/issues/88#issuecomment-6002416950

**R7 mutation control, discharged 2026-10-05** on branch `feat/prep-fixture-gitlink-drift`, with the task-2 wiring of `scripts/prep-fixture.mjs`. It ran against the real repo; the pin is `fe53059` (`v1.2.0`).

| Step | Submodule HEAD | Output | Exit |
|---|---|---|---|
| clean | `fe53059` (= pin) | no warning, `materialized 122 files` | 0 |
| `git -C construct3-sample checkout HEAD~1` | `b3001bd` | `[prep-fixture] WARNING: construct3-sample is checked out at b3001bdbb46fad8534d4fd3583401a3541a3b748, but c3source pins fe53059a85d2c1d3728b3612b8747aac06b2c147; ... Run git submodule update construct3-sample to restore the pin, or git add construct3-sample to stage a deliberate pin bump.` then `materialized 117 files` (fixture present) | 0 |
| `git submodule update construct3-sample` | `fe53059` | no warning, `materialized 122 files` | 0 |

`HEAD~1` happens to be `b3001bd`, the very commit from the 2026-10-01 incident. The 117-vs-122 file count shows the drifted checkout really does materialize a different golden.
