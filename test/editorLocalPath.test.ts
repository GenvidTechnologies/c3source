import { describe, it } from "mocha";
import { expect } from "chai";
import { isEditorLocalPath, EDITOR_LOCAL_EXCLUSIONS } from "../src/c3source.js";

describe("isEditorLocalPath", () => {
  it("R-B2: returns true for the uistate directory name", () => {
    expect(isEditorLocalPath("uistate")).to.equal(true);
  });

  it("R-B3: returns true for a .uistate.json file", () => {
    expect(isEditorLocalPath("foo.uistate.json")).to.equal(true);
  });

  it("R-B4: returns false for real source names", () => {
    expect(isEditorLocalPath("Layout 1")).to.equal(false);
    expect(isEditorLocalPath("layout.json")).to.equal(false);
  });
});

describe("EDITOR_LOCAL_EXCLUSIONS", () => {
  it("R-B5: dirs includes uistate", () => {
    expect(EDITOR_LOCAL_EXCLUSIONS.dirs).to.include("uistate");
  });

  it("R-B5: fileSuffixes includes .uistate.json", () => {
    expect(EDITOR_LOCAL_EXCLUSIONS.fileSuffixes).to.include(".uistate.json");
  });
});
