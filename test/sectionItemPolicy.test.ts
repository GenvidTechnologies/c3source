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
  find_all_layouts_path,
  find_all_objectTypes_path,
  C3_SECTION_FOLDERS,
  C3_ROOT_FILE_FOLDERS,
  openProject,
  type C3Project,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

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

describe("find_all_layouts_path / find_all_objectTypes_path narrowed to .json section items (R3)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SI3: both drop a stray non-.json file and a non-item .dsl.txt artifact, keeping only the .json item", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-narrowed-finders-"));
    writeFileSync(path.join(root, "Foo.json"), "{}");
    writeFileSync(path.join(root, "notes.txt"), "ignored");
    writeFileSync(path.join(root, "Level1.dsl.txt"), "dsl");

    const rel = (paths: string[]) => paths.map((p) => path.relative(root, p).replace(/\\/g, "/")).sort();
    expect(rel(find_all_layouts_path(root))).to.deep.equal(["Foo.json"]);
    expect(rel(find_all_objectTypes_path(root))).to.deep.equal(["Foo.json"]);
  });
});

describe("openProject — findAllLayouts()/findAllObjectTypes() narrowed to .json section items (R4)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SI4: the free function and the handle agree — both return exactly the one .json path", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-narrowed-handle-"));
    const layoutsDir = path.join(root, C3_SECTION_FOLDERS.layouts);
    const objectTypesDir = path.join(root, C3_SECTION_FOLDERS.objectTypes);
    mkdirSync(layoutsDir, { recursive: true });
    mkdirSync(objectTypesDir, { recursive: true });
    for (const dir of [layoutsDir, objectTypesDir]) {
      writeFileSync(path.join(dir, "Foo.json"), "{}");
      writeFileSync(path.join(dir, "notes.txt"), "ignored");
      writeFileSync(path.join(dir, "Level1.dsl.txt"), "dsl");
    }

    const proj = openProject(root);

    expect(find_all_layouts_path(layoutsDir)).to.deep.equal([path.join(layoutsDir, "Foo.json")]);
    expect(proj.findAllLayouts()).to.deep.equal([path.join(layoutsDir, "Foo.json")]);
    expect(find_all_objectTypes_path(objectTypesDir)).to.deep.equal([path.join(objectTypesDir, "Foo.json")]);
    expect(proj.findAllObjectTypes()).to.deep.equal([path.join(objectTypesDir, "Foo.json")]);
  });
});

describe("every C3_SECTION_FOLDERS finder applies the same .json-only policy, table-driven (R5)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const SECTION_FINDERS: Record<keyof typeof C3_SECTION_FOLDERS, (proj: C3Project) => string[]> = {
    layouts: (proj) => proj.findAllLayouts(),
    eventSheets: (proj) => proj.findAllEventSheets(),
    objectTypes: (proj) => proj.findAllObjectTypes(),
    timelines: (proj) => proj.findAllTimelines(),
    flowcharts: (proj) => proj.findAllFlowcharts(),
    families: (proj) => proj.findAllFamilies(),
    models3d: (proj) => proj.findAllModels3d(),
  };

  (Object.keys(C3_SECTION_FOLDERS) as (keyof typeof C3_SECTION_FOLDERS)[]).forEach((key) => {
    it(`SI5: ${key} returns exactly Real.json + sub/Nested.json, dropping stray.md`, () => {
      root = mkdtempSync(path.join(tmpdir(), `c3source-si5-${key}-`));
      const folder = C3_SECTION_FOLDERS[key];
      const sectionDir = path.join(root, folder);
      mkdirSync(path.join(sectionDir, "sub"), { recursive: true });
      writeFileSync(path.join(sectionDir, "Real.json"), "{}");
      writeFileSync(path.join(sectionDir, "stray.md"), "ignored");
      writeFileSync(path.join(sectionDir, "sub", "Nested.json"), "{}");

      const proj = openProject(root);
      const found = SECTION_FINDERS[key](proj)
        .map((p) => path.relative(root, p).replace(/\\/g, "/"))
        .sort();
      expect(found).to.deep.equal([`${folder}/Real.json`, `${folder}/sub/Nested.json`]);
    });
  });
});

describe("findAllScripts / findAllAddons are unaffected by the section-item narrowing (R6)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SI6: a stray scripts/data.json is not returned by findAllScripts, which selects .js/.ts only", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-si6-"));
    const scriptsDir = path.join(root, C3_ROOT_FILE_FOLDERS.script);
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(path.join(scriptsDir, "data.json"), "{}");
    writeFileSync(path.join(scriptsDir, "main.js"), "// script");

    const proj = openProject(root);
    const found = proj.findAllScripts().map((p) => path.relative(root, p).replace(/\\/g, "/"));
    expect(found).to.deep.equal(["scripts/main.js"]);
  });
});

describe("canonical fixture: every section finder returns only .json section items (R8, partial)", () => {
  it("SI8: every path from all seven finders ends with C3_SECTION_ITEM_EXTENSION", function () {
    if (!fixtureProjectExists()) return this.skip();
    const proj = openProject(fixtureProjectPath());
    const allPaths = [
      ...proj.findAllLayouts(),
      ...proj.findAllEventSheets(),
      ...proj.findAllObjectTypes(),
      ...proj.findAllTimelines(),
      ...proj.findAllFlowcharts(),
      ...proj.findAllFamilies(),
      ...proj.findAllModels3d(),
    ];
    expect(allPaths.length).to.be.greaterThan(0);
    for (const p of allPaths) {
      expect(p.endsWith(C3_SECTION_ITEM_EXTENSION)).to.equal(true);
    }
  });
});

describe("find_all_layouts_path / find_all_objectTypes_path never surface a stray README.md (R9)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SI9: a README.md alongside the real .json item is excluded by both finders", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-si9-"));
    writeFileSync(path.join(root, "README.md"), "not an item");
    writeFileSync(path.join(root, "Real.json"), "{}");

    expect(find_all_layouts_path(root)).to.not.deep.include(path.join(root, "README.md"));
    expect(find_all_objectTypes_path(root)).to.not.deep.include(path.join(root, "README.md"));
  });
});
