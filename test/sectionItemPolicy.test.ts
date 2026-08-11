import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  C3_SECTION_ITEM_EXTENSION,
  isSectionItemName,
  find_all_section_items_path,
  isEditorLocalPath,
  find_all_files_path,
} from "../src/c3source.js";

describe("isSectionItemName / C3_SECTION_ITEM_EXTENSION", () => {
  it("SI1: C3_SECTION_ITEM_EXTENSION is exactly .json", () => {
    expect(C3_SECTION_ITEM_EXTENSION).to.equal(".json");
  });

  it("SI1: true for a plain section-item filename", () => {
    expect(isSectionItemName("Layout 1.json")).to.equal(true);
  });

  it("SI1: false for a non-.json file", () => {
    expect(isSectionItemName("README.md")).to.equal(false);
  });

  it("SI1: false for a .dsl.txt generated artifact", () => {
    expect(isSectionItemName("Level1.dsl.txt")).to.equal(false);
  });

  it("SI1: case-sensitive — an uppercase .JSON does not match, deliberately", () => {
    expect(isSectionItemName("Layout 1.JSON")).to.equal(false);
  });

  it("SI1: true for a .uistate.json file — item-hood only, provenance is isEditorLocalPath's job", () => {
    expect(isSectionItemName("Layout 1.uistate.json")).to.equal(true);
  });
});

describe("find_all_section_items_path", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SI2: applies both the item-hood axis and the provenance axis, as the single owner", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-section-items-"));
    mkdirSync(path.join(root, "sub"), { recursive: true });
    mkdirSync(path.join(root, "uistate"), { recursive: true });
    writeFileSync(path.join(root, "Real.json"), "{}");
    writeFileSync(path.join(root, "stray.md"), "ignored");
    writeFileSync(path.join(root, "sub", "Nested.json"), "{}");
    writeFileSync(path.join(root, "uistate", "Hidden.json"), "{}");
    writeFileSync(path.join(root, "Thing.uistate.json"), "{}");

    const found = find_all_section_items_path(root)
      .map((p) => path.relative(root, p).replace(/\\/g, "/"))
      .sort();
    expect(found).to.deep.equal(["Real.json", "sub/Nested.json"]);
  });
});

describe("find_all_files_path escape hatch: recovers everything the section-item policy drops (SI7)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SI7: an unfiltered predicate still recovers files a section-item collector would drop", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-section-items-escape-"));
    writeFileSync(path.join(root, "Foo.json"), "{}");
    writeFileSync(path.join(root, "notes.txt"), "ignored");
    writeFileSync(path.join(root, "Level1.dsl.txt"), "dsl");

    const found = find_all_files_path(root, () => true)
      .map((p) => path.relative(root, p).replace(/\\/g, "/"))
      .sort();
    expect(found).to.include("notes.txt");
    expect(found).to.include("Level1.dsl.txt");
  });

  it("SI7: (!isEditorLocalPath) alone reproduces the pre-2.0.0 permissive result exactly", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-section-items-escape-"));
    writeFileSync(path.join(root, "Foo.json"), "{}");
    writeFileSync(path.join(root, "notes.txt"), "ignored");
    writeFileSync(path.join(root, "Level1.dsl.txt"), "dsl");

    const found = find_all_files_path(root, (f) => !isEditorLocalPath(f))
      .map((p) => path.relative(root, p).replace(/\\/g, "/"))
      .sort();
    expect(found).to.deep.equal(["Foo.json", "Level1.dsl.txt", "notes.txt"]);
  });
});
