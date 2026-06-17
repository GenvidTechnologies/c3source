import { describe, it } from "mocha";
import { expect } from "chai";
import { mkdtempSync, rmdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  openProject,
  readProjectManifest,
  C3_SECTION_FOLDERS,
  C3_ROOT_FILE_FOLDERS,
  PROJECT_MANIFEST_FILE,
  type C3Project,
} from "../src/c3source.js";
import { fixturePath } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixturePath("c3source-fixture");

describe("openProject — path fields", () => {
  let proj: C3Project;

  before(() => {
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-1: root equals the argument passed to openProject", () => {
    expect(proj.root).to.equal(FIXTURE_DIR);
  });

  it("OP-2: manifestPath is join(root, PROJECT_MANIFEST_FILE)", () => {
    expect(proj.manifestPath).to.equal(path.join(FIXTURE_DIR, PROJECT_MANIFEST_FILE));
  });

  it("OP-3: eventSheetsDir is derived from C3_SECTION_FOLDERS table, not a literal", () => {
    expect(proj.eventSheetsDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.eventSheets));
  });

  it("OP-4: layoutsDir is derived from C3_SECTION_FOLDERS table", () => {
    expect(proj.layoutsDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.layouts));
  });

  it("OP-5: objectTypesDir is derived from C3_SECTION_FOLDERS table", () => {
    expect(proj.objectTypesDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.objectTypes));
  });

  it("OP-6: familiesDir is derived from C3_SECTION_FOLDERS table", () => {
    expect(proj.familiesDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.families));
  });

  it("OP-7: scriptsDir is derived from C3_ROOT_FILE_FOLDERS table (script → scripts)", () => {
    expect(proj.scriptsDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.script));
  });
});

describe("openProject — manifest() lazy read", () => {
  it("OP-8: manifest() deep-equals readProjectManifest(manifestPath)", () => {
    const proj = openProject(FIXTURE_DIR);
    const expected = readProjectManifest(path.join(FIXTURE_DIR, PROJECT_MANIFEST_FILE));
    expect(proj.manifest()).to.deep.equal(expected);
  });

  it("OP-9: manifest() returns the same cached object on repeated calls (referential equality)", () => {
    const proj = openProject(FIXTURE_DIR);
    const first = proj.manifest();
    const second = proj.manifest();
    expect(first).to.equal(second);
  });
});

describe("openProject — has*() methods on the fixture", () => {
  let proj: C3Project;

  before(() => {
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-10: hasEventSheets() is true for the fixture", () => {
    expect(proj.hasEventSheets()).to.equal(true);
  });

  it("OP-11: hasLayouts() is true for the fixture", () => {
    expect(proj.hasLayouts()).to.equal(true);
  });

  it("OP-12: hasObjectTypes() is true for the fixture", () => {
    expect(proj.hasObjectTypes()).to.equal(true);
  });

  it("OP-13: hasFamilies() is true for the fixture", () => {
    expect(proj.hasFamilies()).to.equal(true);
  });

  it("OP-14: hasScripts() is true for the fixture", () => {
    expect(proj.hasScripts()).to.equal(true);
  });
});

describe("openProject — empty temp dir (no I/O at construction)", () => {
  let tmpDir: string;
  let proj: C3Project;

  before(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-test-"));
    proj = openProject(tmpDir);
  });

  after(() => {
    rmdirSync(tmpDir);
  });

  it("OP-15: construction on an empty dir does not throw", () => {
    expect(() => openProject(tmpDir)).to.not.throw();
  });

  it("OP-16: hasEventSheets() is false for an empty dir", () => {
    expect(proj.hasEventSheets()).to.equal(false);
  });

  it("OP-17: hasLayouts() is false for an empty dir", () => {
    expect(proj.hasLayouts()).to.equal(false);
  });

  it("OP-18: hasObjectTypes() is false for an empty dir", () => {
    expect(proj.hasObjectTypes()).to.equal(false);
  });

  it("OP-19: hasFamilies() is false for an empty dir", () => {
    expect(proj.hasFamilies()).to.equal(false);
  });

  it("OP-20: hasScripts() is false for an empty dir", () => {
    expect(proj.hasScripts()).to.equal(false);
  });

  it("OP-21: root equals the temp dir path", () => {
    expect(proj.root).to.equal(tmpDir);
  });
});
