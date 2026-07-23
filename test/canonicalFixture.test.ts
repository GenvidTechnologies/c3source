import { describe, it, before } from "mocha";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  openProject,
  validateForEditor,
  detectManifestDrift,
  type EventSheet,
  type EditorValidationIssue,
} from "../src/c3source.js";
import { fixtureProjectPath, fixtureProjectExists } from "./fixtureHelpers.js";

const CANONICAL_ROOT = fixtureProjectPath();

// Validation gate: proves c3source's own validators (editor-strictness + manifest-drift)
// accept the materialized canonical golden fixture cleanly. Self-skips when the fixture
// has not been materialized (submodule absent / prep-fixture not run) — see CLAUDE.md.
describe("canonical fixture — c3source validators", function () {
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  it("validateForEditor reports zero issues across every event sheet", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();

    const proj = openProject(CANONICAL_ROOT);
    const sheetPaths = proj.findAllEventSheets();
    expect(sheetPaths.length, "canonical fixture has at least one event sheet").to.be.greaterThan(0);

    const allIssues: Array<EditorValidationIssue & { sheetPath: string }> = [];
    for (const sheetPath of sheetPaths) {
      const sheet = JSON.parse(readFileSync(sheetPath, "utf-8")) as EventSheet;
      const issues = validateForEditor(sheet);
      allIssues.push(...issues.map((issue) => ({ ...issue, sheetPath })));
    }

    const summary = allIssues.map((i) => `${i.sheetPath} :: ${i.path} [${i.rule}] ${i.message}`).join("\n");
    expect(allIssues.length, `expected no editor-validation issues, got:\n${summary}`).to.equal(0);
  });

  it("detectManifestDrift reports the canonical project as in sync", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();

    // Starts as a bare assertion: the golden fixture is expected to be drift-free. If the
    // canonical project legitimately reports some drift (e.g. an image-derived section),
    // this must be replaced with an assertion of the exact known entry set (not weakened
    // to "some drift is fine") so any NEW, unexpected drift still fails the gate.
    const drift = detectManifestDrift(CANONICAL_ROOT);
    const message = `expected inSync, got sections:\n${JSON.stringify(drift.sections, null, 2)}`;
    expect(drift.inSync, message).to.equal(true);
  });
});
