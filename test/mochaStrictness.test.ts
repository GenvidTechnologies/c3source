import { createRequire } from "node:module";
import { describe, it } from "mocha";
import { expect } from "chai";
import { PROJECT_MANIFEST, SDK_SAMPLE_ACES, fixtureProjectExists, sdkFixtureExists } from "./fixtureHelpers.js";

// Ungated by design: this test must run in every fixture state (present,
// absent, or partially present) so it can actually catch drift between the
// hand-maintained path literals in .mocharc.cjs and the canonical ones
// exported from ./fixtureHelpers.ts. See .mocharc.cjs's own doc comment for
// why it cannot import those constants directly.
describe(".mocharc.cjs forbid-pending strictness", () => {
  const require = createRequire(import.meta.url);
  const rc = require("../.mocharc.cjs") as { "forbid-pending": boolean };

  it("biconditional: forbid-pending is true iff both gated fixtures are present", () => {
    const expected = fixtureProjectExists(PROJECT_MANIFEST) && sdkFixtureExists(SDK_SAMPLE_ACES);
    const message =
      "forbid-pending must equal (canonical fixture present && SDK sample present) -- a mismatch means " +
      "a path literal in .mocharc.cjs has drifted from test/fixtureHelpers.ts";
    expect(rc["forbid-pending"], message).to.equal(expected);
  });

  it("one-directional confirmation: forbid-pending true implies both underlying probes are true", () => {
    if (!rc["forbid-pending"]) return;
    expect(
      fixtureProjectExists(PROJECT_MANIFEST),
      "forbid-pending is true but the canonical project fixture probe is false -- .mocharc.cjs is armed on stale evidence",
    ).to.equal(true);
    expect(
      sdkFixtureExists(SDK_SAMPLE_ACES),
      "forbid-pending is true but the SDK sample probe is false -- .mocharc.cjs is armed on stale evidence",
    ).to.equal(true);
  });
});
