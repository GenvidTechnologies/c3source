/**
 * Deliberately partial mocha config: this file sets `forbid-pending` only.
 * The spec glob, `--import=tsx`, `--require ./test/setup.ts`, and `--timeout`
 * all stay in package.json's `test` script — do not move them here (in
 * particular, moving `--import=tsx` into `node-option` would re-route the TS
 * bootstrap through a different mocha mechanism than the one package.json
 * already uses). A partial rc merges with the CLI flags; CLI flags win.
 *
 * `--forbid-pending` turns an unexpected skip (a bodyless `it`, a suite-level
 * `before` calling `this.skip()`) into a failed run instead of a silently
 * green one — but only when every fixture the suite gates on is actually
 * present. When a fixture is legitimately absent (no submodule checkout),
 * the suite's self-skips are the intended degradation, not a regression, so
 * strictness must be disabled for that run.
 *
 * This file is CJS (require/module.exports/__dirname) because mocha's CLI
 * bootstrap evaluates it before any TypeScript loads, so it cannot import the
 * constants from test/fixtureHelpers.ts — the two path literals below MUST be
 * kept in agreement with PROJECT_MANIFEST/SDK_SAMPLE_ACES there by hand.
 * test/mochaStrictness.test.ts is the (ungated) test that enforces that
 * agreement; if you change a path in test/fixtureHelpers.ts, update it here
 * too or that test will fail.
 */

const fs = require("fs");
const path = require("path");

const projectManifestPath = path.join(__dirname, "test", "fixtures", "canonical", "project.c3proj");
const sdkSampleAcesPath = path.join(__dirname, "SDK", "plugin-sdk", "customImporterPlugin", "aces.json");

const strict = fs.existsSync(projectManifestPath) && fs.existsSync(sdkSampleAcesPath);

if (!strict) {
  console.error(
    "[.mocharc.cjs] one or more gated fixtures are absent (canonical project fixture and/or SDK sample) " +
      "-- disabling --forbid-pending so this run's self-skips are tolerated.",
  );
}

module.exports = {
  "forbid-pending": strict,
};
