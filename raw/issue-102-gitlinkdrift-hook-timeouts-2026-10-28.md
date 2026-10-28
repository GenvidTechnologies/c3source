# Issue #102 — gitlinkDrift hook timeouts: measurements and the adopted fix (capture)

**Captured:** 2026-10-28
**For:** GenvidTechnologies/c3source#102 (https://github.com/GenvidTechnologies/c3source/issues/102), `test/gitlinkDrift.test.ts` `beforeEach` hooks intermittently exceed mocha's 5000 ms default
**Source:** the issue body section "Measured at planning" and the acceptance-evidence comment, plus the mocha behaviour checked in `mocha/lib/suite.js` during the fix session.
**Nature:** timing measurements from one idle Windows dev machine, not a portable benchmark. The absolute numbers are one machine's; the ordering is what carries over.

---

## Measurements

`test/gitlinkDrift.test.ts` builds a hermetic superproject with 7 synchronous `git` spawns: in the submodule `init`, `add`, `commit`, `rev-parse`; in the superproject `init`, `update-index --cacheinfo`, `commit`.

10 samples each, idle machine:

| Operation | min | median | max |
|---|---|---|---|
| Build the fixture from scratch (7 git spawns) | 909 ms | 1151 ms | 1312 ms |
| `cpSync` of a prebuilt template | 225 ms | 282 ms | 521 ms |

Under load, the per-test `beforeEach` build intermittently exceeded the 5000 ms default: about 3 of 8 full `npm run test` runs (issue #102).

## Fix adopted

In each affected `describe`:

- build the fixture once in `before()` into a template dir;
- `cpSync(template, tmp, { recursive: true })` in `beforeEach`;
- remove the template in `after()`;
- `this.timeout(20000)` on the describe.

A copied tree reads identically through the scripts under test (checked: clean state, then drift after a submodule commit; the template is unaffected by mutations made in a copy).

## Mocha facts checked

- `this.timeout` needs a `function ()` describe callback; an arrow function has no mocha `this`.
- It must be called before the suite's hooks and tests are registered: mocha copies the suite timeout into each hook/test at registration (the `Suite` hook registration and `addTest` in `mocha/lib/suite.js` call `.timeout(this.timeout())`).
- Copy per test, not per describe, whenever tests mutate the tree (in gitlinkDrift, most do).
- The suite-wide default stays `--timeout 5000` in `package.json`'s `test` script; raise it per describe, not globally.

## Acceptance evidence

After the fix, 10 consecutive full `npm run test` runs: all exit 0, 589 passing, 0 failing, 0 pending; no `Timeout of .*gitlinkDrift\.test\.ts` match in any log. The first three runs overlapped a concurrent agent and took up to 3x longer, so a run under load held up too.
