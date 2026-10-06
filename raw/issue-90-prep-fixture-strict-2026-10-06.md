# Issue #90 — prep-fixture strict mode (capture)

Captured 2026-10-06 for GenvidTechnologies/c3source#90, verbatim from `gh issue view 90 --json title,body,comments`. Upstream: https://github.com/GenvidTechnologies/c3source/issues/90 (opened 2026-10-05T20:40:43Z). The body is captured after the plan's `## Acceptance Criteria` section replaced the original `## Acceptance (sketch)`.

## Title

feat: make prep-fixture gitlink drift fatal under CI

## Body

## Problem

#88 made `scripts/prep-fixture.mjs` **warn** when the `construct3-sample` checkout differs from the gitlink in the superproject's index (`findGitlinkDrift` in `scripts/gitlink-drift.mjs`). It warns rather than fails so that a developer can deliberately test an unpinned upstream commit; see ADR 0028 (`wiki/decisions/0028-prep-fixture-warns-on-gitlink-drift.md`).

In CI a mismatch is never intended, though, and a warning in a CI log is easy to miss. If CI ever checked out the submodule at a different commit from the pin (a misconfigured checkout step, or a `submodules: remote`-style update), the gate would grade an unpinned golden and still go green.

## Proposed change

When `process.env.CI` is set (GitHub Actions sets `CI=true`), make the drift fatal: print the same message and `process.exit(1)` before materializing. Outside CI, keep the warning.

Open questions:
- Is `CI` the right switch, or should it be an explicit opt-in such as `PREP_FIXTURE_STRICT=1`, so the behaviour is visible in `ci.yml`? CI runs through the shared `node-gate.yml`, which may not make passing an env var easy.
- Does the CI checkout fetch the submodules at all? If it doesn't, the existing "submodule not checked out" guard exits 0 first and this change never fires there.

## Acceptance Criteria

Pre-committed before implementation (ADR-0017). Graded by the validator and the code-reviewer. It replaces the original `## Acceptance (sketch)` section; every sketch item is mapped below:

- sketch-1 (CI + drift → exit 1, message names both SHAs) → **R4** (+ R5 mutation control)
- sketch-2 (CI + no drift → unchanged) → **R6**
- sketch-3 (no CI → #88 warning unchanged) → **R7**, R8
- sketch-4 (ADR 0028 updated or superseded) → **R19–R22**. Repo convention forbids retro-editing an accepted ADR, so this is a new ADR 0029 that partially supersedes 0028.

Criteria the sketch could not have contained, because they arise from planning-time decisions:
- **R1–R3, R10:** the explicit `PREP_FIXTURE_STRICT` switch replaces `process.env.CI` (user decision), and an unrecognized value is fatal.
- **R13, R14, R17, R18:** the opt-in reaches CI through a new `extra-env` input on the shared `node-gate.yml`, because a reusable-workflow caller cannot pass env.
- **R9, R11, R12, R15, R16, R23–R29:** regression guards, real-fixture safety, and docs/CHANGELOG.

R17 is corrected from the design draft (wrong from the start, not drifted): the draft read a local clone the user ruled out, and the corrected check reads `main` through `gh api`.

Markers:
- **[point-in-time]:** graded when the check runs, with evidence recorded here.
- **[not-yet-due]:** out of scope for branch review.

Baselines were measured on `main` = `694a627`.

- [ ] **R1** `parseStrictFlag` added and declared. `grep -c "^export function parseStrictFlag(" scripts/gitlink-drift.mjs` and the same over `scripts/gitlink-drift.d.mts`. Baseline 0 / 0 → pass 1 / 1.
- [ ] **R2** `STRICT_ENV` declared in both. `grep -c "^export const STRICT_ENV" scripts/gitlink-drift.mjs scripts/gitlink-drift.d.mts`. Baseline 0 / 0 → pass 1 / 1.
- [ ] **R3** Value grammar. Unit tests S1–S3 in `test/gitlinkDrift.test.ts` check:
  - `"1"` and `"true"` → true;
  - `undefined`, `""`, `"0"`, `"false"` → false;
  - `"yes"`, `"TRUE"`, `" 1"`, `"on"` → null.

  Run `npx mocha --timeout 5000 --import=tsx --require ./test/setup.ts test/gitlinkDrift.test.ts --exit`. Baseline 5 passing → pass 8 passing, 0 failing.
- [ ] **R4** Strict + drift (`test/prepFixture.test.ts` P1): child exits 1; stderr contains the pinned SHA **and** the head SHA; `SENTINEL` still exists; stdout has no `materialized` line. Baseline: file absent → pass: P1 passes.
- [ ] **R5** [point-in-time] Mutation control for R4.
  - Mutation 1: replace the strict branch's `process.exit(1);` with a uniquely tagged no-op (`/* MUTATION */`). The anchor is asserted to match exactly once, because the script will contain two `process.exit(1)`.
  - Mutation 2: move the drift block below `rmSync`.

  Pass: each mutation makes P1 fail, and P1 passes after the exact-inverse reverts.
- [ ] **R6** Strict + no drift unchanged (P2). The same case runs strict-on and with the variable deleted. Both exit 0 with identical stdout and empty stderr; stdout matches `materialized 1 files`; SENTINEL is gone (the wipe ran). Baseline 0 tests → pass: P2 passes.
- [ ] **R7** Off + drift is #88 byte-for-byte; `CI` alone is not the switch (P3). With `CI=true`, the variable deleted and drift present: exit 0; stderr equals the #88 warning literal, built from both SHAs; fixture materialized. [point-in-time, mutation half] Making the parse read `process.env[STRICT_ENV] ?? process.env.CI` must make P3 fail; then revert. Pass: P3 passes, and fails under the mutation.
- [ ] **R8** The #88 warning literal survives in `scripts/prep-fixture.mjs`. Each `grep -cF` must print ≥1 (baseline 1 each):
  - `'WARNING: construct3-sample is checked out at ${drift.head}, but c3source pins ${drift.pinned}; '`
  - `'"the fixture will be materialized from the unpinned checkout. " +'`
  - ``'"Run `git submodule update construct3-sample` to restore the pin, " +'``
  - ``'"or `git add construct3-sample` to stage a deliberate pin bump.",'``
- [ ] **R9** Staged pin bump under strict (P4): the submodule has a new commit and `git add construct3-sample` is staged. Exit 0, empty stderr. Baseline 0 tests → pass: P4 passes.
- [ ] **R10** Invalid value is fatal (P5): `PREP_FIXTURE_STRICT=yes` exits 1; stderr names `PREP_FIXTURE_STRICT` and `"yes"`; SENTINEL survives. Baseline 0 tests → pass: P5 passes.
- [ ] **R11** Guards stay exit 0 (P6): strict on, `construct3-sample/project/project.c3proj` absent. Exit 0; stderr contains `submodule not checked out; skipping`. Baseline 0 tests → pass: P6 passes.
- [ ] **R12** [point-in-time] The real fixture is never touched. `touch test/fixtures/canonical/ZZ_SENTINEL`, run `npx mocha --timeout 30000 --import=tsx --require ./test/setup.ts test/prepFixture.test.ts --exit`, then `test -f test/fixtures/canonical/ZZ_SENTINEL && echo kept`. Positive control: `npm test` (pretest) deletes it. Pass: `kept` after the mocha run; the sentinel is absent after `npm test`.
- [ ] **R13** Key-name typo guard. P7 reads `.github/workflows/ci.yml` and asserts a line matching `^\s+${STRICT_ENV}=1\s*$`. CLI form: `grep -cE '^\s+PREP_FIXTURE_STRICT=1\s*$' .github/workflows/ci.yml`. Control: `grep -cE '^\s+submodules: recursive\s*$' .github/workflows/ci.yml` = 1. Baseline 0 → pass 1; P7 passes.
- [ ] **R14** Opt-in visible in `ci.yml`: `grep -c "^      extra-env: |$" .github/workflows/ci.yml`. Baseline 0 → pass 1.
- [ ] **R15** Full suite: `npm test`. Baseline 530 passing → pass ≥540 passing (hypothesis: 530 + 3 + 7), 0 failing, 0 pending.
- [ ] **R16** Validate chain: `npm run lint && npm run typecheck && npm run test && npm run build` is green.
- [ ] **R17** [not-yet-due: precondition gate before pushing the `ci.yml` line] The node-gate input is merged: `gh api repos/GenvidTechnologies/public-github-actions/contents/.github/workflows/node-gate.yml --jq .content | base64 -d | grep -c "^      extra-env:$"`. Baseline 0 → pass 1.
- [ ] **R18** [not-yet-due: post-push CI] End to end on the PR's CI run: `gh run view <id> --log | grep -c "exported PREP_FIXTURE_STRICT"` ≥ 1. Control on the same log: `materialized 122 files` = 1, and ≥540 passing. Baseline 0 on run 37400501315.
- [ ] **R19** ADR 0029 exists: `ls wiki/decisions | grep -c '^0029-'`. Baseline 0 → pass 1.
- [ ] **R20** ADR 0028 Status line: `grep -cF '**Status:** partially superseded by [ADR 0029]' wiki/decisions/0028-prep-fixture-warns-on-gitlink-drift.md`. Baseline 0 → pass 1.
- [ ] **R21** ADR 0028 Related: `grep -c "^- \[ADR 0029" wiki/decisions/0028-prep-fixture-warns-on-gitlink-drift.md`. Baseline 0 → pass 1.
- [ ] **R22** ADR 0028 is touched only on those lines.

  ```
  git diff -U0 main...HEAD -- wiki/decisions/0028-prep-fixture-warns-on-gitlink-drift.md | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-](\*\*Status:\*\*|- \[ADR 0029)' | wc -l
  ```

  Pass: the count is 0. Control: the same pipeline without the last filter gives ≥2; if the control gives 0, the row is unevaluable, not passed. Use `--staged` while the work is staged.
- [ ] **R23** Raw capture: `ls raw | grep -c '^issue-90-'`. Baseline 0 → pass 1 (control: `'^issue-88-'` = 1).
- [ ] **R24** `wiki/canonical-fixture.md` updated: `grep -c "PREP_FIXTURE_STRICT"` and `grep -c "decisions/0029-"`. Baseline 0 / 0 → pass ≥1 / ≥1.
- [ ] **R25** Index: `grep -c "^\* \[ADR 0029" wiki/decisions/index.md`. Baseline 0 → pass 1 (control: `ADR 0028` = 1).
- [ ] **R26** Log: `grep -c "^\* \*\*Creation\*\*: decisions/0029-" wiki/log.md`. Baseline 0 → pass 1 (control: `0028-` = 1).
- [ ] **R27** No `file:line` in the new or edited pages: `grep -cE "\.(mjs|ts|md|yml|json):[0-9]+" wiki/decisions/0029-*.md wiki/canonical-fixture.md`. Pass: 0 for both. Control: `wiki/decisions/0018-brush-json-minified-source-not-editor-local.md` = 12.
- [ ] **R28** Stale CHANGELOG clause gone: `grep -cF "SHAs and the remedy; it still exits 0. A staged pin bump is not reported." CHANGELOG.md`. Baseline 1 → pass 0.
- [ ] **R29** One CHANGELOG bullet citing both issues: `grep -cF "(#88, #90)" CHANGELOG.md` → 1 (baseline 0), and ``grep -c '^- \*\*`prep-fixture`' CHANGELOG.md`` stays 1.

Follow-up to #88.
