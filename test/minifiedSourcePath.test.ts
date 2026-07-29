import { describe, it } from "mocha";
import { expect } from "chai";
import { isMinifiedSourcePath, C3_MINIFIED_SOURCE_SUFFIXES, isEditorLocalPath } from "../src/c3source.js";

describe("isMinifiedSourcePath", () => {
  it("R5: returns true for .brush.json basenames", () => {
    expect(isMinifiedSourcePath("Tilemap.brush.json")).to.equal(true);
    expect(isMinifiedSourcePath("x.brush.json")).to.equal(true);
  });

  it("R5: returns false for non-matching names", () => {
    expect(isMinifiedSourcePath("Tilemap.json")).to.equal(false);
    expect(isMinifiedSourcePath("brush.json.bak")).to.equal(false);
    // "mybrush.json" does NOT end with ".brush.json" (no dot before "brush") —
    // .endsWith(".brush.json") requires the leading dot, so a name that merely
    // contains "brush" must not match.
    expect(isMinifiedSourcePath("mybrush.json")).to.equal(false);
    expect(isMinifiedSourcePath("Main Layout.uistate.json")).to.equal(false);
    expect(isMinifiedSourcePath("tsconfig.json")).to.equal(false);
  });
});

describe("C3_MINIFIED_SOURCE_SUFFIXES", () => {
  it("R6: contains .brush.json", () => {
    expect(C3_MINIFIED_SOURCE_SUFFIXES).to.include(".brush.json");
  });
});

describe("isMinifiedSourcePath vs. isEditorLocalPath: orthogonality (R7)", () => {
  it("*.brush.json is minified source, not editor-local", () => {
    expect(isMinifiedSourcePath("Tilemap.brush.json")).to.equal(true);
    expect(isEditorLocalPath("Tilemap.brush.json")).to.equal(false);
  });

  // C3 writes *.uistate.json minified, but isMinifiedSourcePath covers minified
  // *source* only — editor-local files are out of its scope by design, so this is
  // false despite the on-disk form. See the scope note on
  // C3_MINIFIED_SOURCE_SUFFIXES; the two predicates answer different questions.
  it("*.uistate.json is editor-local, so it is out of the minified-source predicate's scope", () => {
    expect(isEditorLocalPath("Main Layout.uistate.json")).to.equal(true);
    expect(isMinifiedSourcePath("Main Layout.uistate.json")).to.equal(false);
  });

  it("uistate/*.instancesBar.json is editor-local (via the uistate/ directory, not its own basename) and not minified", () => {
    expect(isEditorLocalPath("uistate")).to.equal(true);
    // The basename alone is not flagged editor-local by isEditorLocalPath — it is
    // editor-local only via the inherited uistate/ directory rule a directory walk
    // applies; that is a documented quirk (see CLAUDE.md), not something to "fix" here.
    expect(isEditorLocalPath("Main Layout.instancesBar.json")).to.equal(false);
    expect(isMinifiedSourcePath("Main Layout.instancesBar.json")).to.equal(false);
  });

  it("an ordinary .json file is neither editor-local nor minified-source", () => {
    expect(isEditorLocalPath("layout.json")).to.equal(false);
    expect(isMinifiedSourcePath("layout.json")).to.equal(false);
  });
});
