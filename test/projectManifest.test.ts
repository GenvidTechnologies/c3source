import { describe, it, before } from "mocha";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseProjectManifest,
  readProjectManifest,
  collectManifestItemNames,
  collectManifestFileNames,
  detectManifestDrift,
  C3_SECTION_FOLDERS,
  C3_ROOT_FILE_FOLDERS,
  walkManifestNameTree,
  walkDiskNameTree,
  walkDiskFileTree,
  diffNameMaps,
  formatManifestPath,
  type C3ProjectManifest,
  type SectionDrift,
} from "../src/c3source.js";
import { fixturePath } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixturePath("sample-project");
const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");

describe("parseProjectManifest / readProjectManifest", () => {
  let m: C3ProjectManifest;

  before(() => {
    m = readProjectManifest(MANIFEST_PATH);
  });

  it("R-C1: reads name and savedWithRelease from the fixture", () => {
    expect(m.name).to.equal("sample-project");
    expect(m.savedWithRelease).to.equal(48700);
  });

  it("R-C2: name-folder typing — layouts.items and eventSheets.items", () => {
    expect(m.layouts.items).to.deep.equal(["Main Layout", "Second Layout", "Templates Layout"]);
    expect(m.eventSheets.items).to.deep.equal(["Event sheet 1", "Event sheet 2"]);
  });

  it("R-C3: file-folder typing — script items and icon count", () => {
    expect(m.rootFileFolders.script.items[0].name).to.equal("importsForEvents.ts");
    expect(typeof m.rootFileFolders.script.items[0].sid).to.equal("number");
    expect(m.rootFileFolders.icon.items.length).to.equal(7);
  });

  it("R-C4: collectManifestItemNames recurses into subfolders (timelines)", () => {
    const names = collectManifestItemNames(m.timelines);
    expect(names).to.deep.equal(["Timeline 1"]);
  });

  it("R-C5: parseProjectManifest(raw) deep-equals readProjectManifest(path)", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    const parsed = parseProjectManifest(JSON.parse(raw));
    expect(parsed).to.deep.equal(m);
  });

  it("R-C6: mapping tables have expected keys and values", () => {
    expect(C3_SECTION_FOLDERS.layouts).to.equal("layouts");
    expect(C3_SECTION_FOLDERS.families).to.equal("families");
    expect(C3_SECTION_FOLDERS.models3d).to.equal("models3d");
    const rootKeys = Object.keys(C3_ROOT_FILE_FOLDERS);
    expect(rootKeys.length).to.equal(7);
    expect(C3_ROOT_FILE_FOLDERS.script).to.equal("scripts");
    expect(C3_ROOT_FILE_FOLDERS.icon).to.equal("icons");
  });

  it("R-C7: un-modeled fields are preserved (properties, containers, firstLayout, usedAddons)", () => {
    expect(m.properties).to.be.an("object");
    expect(m.containers).to.be.an("array");
    expect(Object.prototype.hasOwnProperty.call(m, "firstLayout")).to.equal(true);
    expect(Array.isArray(m.usedAddons)).to.equal(true);
  });

  it("R-C16: populated subfolders carry a name; degenerate empty subfolder has none", () => {
    expect(m.objectTypes.subfolders.map((sf) => sf.name)).to.deep.equal(["global", "images", "tiles"]);
    // the empty timelines subfolder C3 serialized without a name must parse cleanly
    expect(m.timelines.subfolders[0].name).to.equal(undefined);
  });

  it("R-C17: containers are typed with a string[] members list", () => {
    expect(m.containers[0].members).to.deep.equal(["Sprite2", "Text2"]);
  });
});

describe("parseProjectManifest — strict throws", () => {
  it("R-C8: throws when top-level is not an object", () => {
    expect(() => parseProjectManifest(42)).to.throw(/invalid project\.c3proj/);
    expect(() => parseProjectManifest(null)).to.throw(/invalid project\.c3proj/);
    expect(() => parseProjectManifest([])).to.throw(/invalid project\.c3proj/);
  });

  it("R-C9: throws when a name-folder's items are not all strings", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    bad.layouts.items = [123];
    expect(() => parseProjectManifest(bad)).to.throw(/layouts\.items must be string\[\]/);
  });

  it("R-C10: throws when a file entry's sid is not a number", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    bad.rootFileFolders.script.items[0].sid = "x";
    expect(() => parseProjectManifest(bad)).to.throw(/invalid project\.c3proj/);
  });

  it("R-C11: extra top-level key passes through and is preserved", () => {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    raw.__extra__ = "hello";
    const parsed = parseProjectManifest(raw);
    expect((parsed as Record<string, unknown>).__extra__).to.equal("hello");
  });

  it("tolerates a fully absent modeled section (does not throw)", () => {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    delete raw.layouts;
    expect(() => parseProjectManifest(raw)).to.not.throw();
  });

  it("R-C18: throws when a subfolder name is present but not a string", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    bad.objectTypes.subfolders[0].name = 123;
    expect(() => parseProjectManifest(bad)).to.throw(/name must be a string when present/);
  });

  it("R-C19: throws when a container's members are not all strings", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    bad.containers[0].members = ["ok", 7];
    expect(() => parseProjectManifest(bad)).to.throw(/containers\[0\]\.members must be string\[\]/);
  });
});

describe("collectManifestFileNames", () => {
  it("flattens file-folder items recursively", () => {
    const m = readProjectManifest(MANIFEST_PATH);
    const names = collectManifestFileNames(m.rootFileFolders.script);
    expect(names).to.include("main.ts");
    expect(names).to.include("importsForEvents.ts");
    expect(names.length).to.equal(2);
  });
});

describe("detectManifestDrift", () => {
  it("R-C12: clean fixture reports inSync === true (ts-defs/ and uistate/ not flagged)", () => {
    const drift = detectManifestDrift(FIXTURE_DIR);
    expect(drift.inSync).to.equal(true);
    expect(drift.sections).to.deep.equal([]);
  });

  it("R-C13: phantom manifest entry produces missingOnDisk", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.layouts.items.push("Phantom Layout");
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const layoutsDrift = drift.sections.find((s: SectionDrift) => s.section === "layouts");
    expect(layoutsDrift).to.not.be.undefined;
    expect(layoutsDrift!.missingOnDisk).to.deep.equal(["Phantom Layout"]);
  });

  it("R-C14: clearing layouts.items surfaces real file as untracked; no editor-local entries", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.layouts.items = [];
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const layoutsDrift = drift.sections.find((s: SectionDrift) => s.section === "layouts");
    expect(layoutsDrift).to.not.be.undefined;
    expect(layoutsDrift!.untracked).to.deep.equal(["Main Layout", "Second Layout", "Templates Layout"]);
    // editor-local artifacts must not appear
    const allUntracked = drift.sections.flatMap((s: SectionDrift) => s.untracked);
    expect(allUntracked.some((u: string) => u.includes("instancesBar") || u === "uistate")).to.equal(false);
  });

  it("R-C15: clearing script items surfaces js files as untracked; ts-defs/ not flagged", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.rootFileFolders.script.items = [];
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const scriptDrift = drift.sections.find((s: SectionDrift) => s.section === "rootFileFolders.script");
    expect(scriptDrift).to.not.be.undefined;
    expect(scriptDrift!.untracked.sort()).to.deep.equal(["importsForEvents.ts", "main.ts"]);
    // ts-defs/ (dir) and tsconfig.json (generated) are editor-local and must not appear
    expect(scriptDrift!.untracked.some((u: string) => u.includes("ts-defs"))).to.equal(false);
    expect(scriptDrift!.untracked.includes("tsconfig.json")).to.equal(false);
  });
});

describe("F1: path-walk primitives", () => {
  let m: C3ProjectManifest;

  before(() => {
    m = readProjectManifest(MANIFEST_PATH);
  });

  it('F1-1: formatManifestPath renders slash-joined segments; empty → ""', () => {
    expect(formatManifestPath(["images", "Sprite"])).to.equal("images/Sprite");
    expect(formatManifestPath(["images"])).to.equal("images");
    expect(formatManifestPath([])).to.equal("");
  });

  it("F1-2: walkManifestNameTree finds Sprite under images and Text at root", () => {
    const items = walkManifestNameTree(m.objectTypes);
    const sprite = items.find((e) => e.name === "Sprite");
    expect(sprite).to.not.be.undefined;
    expect(sprite!.path).to.deep.equal(["images"]);

    const text = items.find((e) => e.name === "Text");
    expect(text).to.not.be.undefined;
    expect(text!.path).to.deep.equal([]);
  });

  it("F1-3: walkManifestNameTree yields all 10 objectType items with correct paths", () => {
    const items = walkManifestNameTree(m.objectTypes);
    // root: Text, TextInput, Text2
    expect(
      items
        .filter((e) => e.path.length === 0)
        .map((e) => e.name)
        .sort(),
    ).to.deep.equal(["Text", "Text2", "TextInput"]);
    // global subfolder
    expect(items.find((e) => e.name === "JSON")!.path).to.deep.equal(["global"]);
    // images subfolder: 9patch, Sprite, Sprite2, Sprite3
    const imageItems = items.filter((e) => e.path.length === 1 && e.path[0] === "images").map((e) => e.name);
    expect(imageItems.sort()).to.deep.equal(["9patch", "Sprite", "Sprite2", "Sprite3"]);
    // tiles subfolder
    const tileItems = items.filter((e) => e.path.length === 1 && e.path[0] === "tiles").map((e) => e.name);
    expect(tileItems.sort()).to.deep.equal(["TiledBackground", "Tilemap"]);
    expect(items.length).to.equal(10);
  });

  it("F1-4: walkDiskNameTree yields the same 10 name/path pairs as manifest (section-root-relative)", () => {
    const diskItems = walkDiskNameTree(path.join(FIXTURE_DIR, "objectTypes"));
    expect(diskItems.length).to.equal(10);

    // Paths must be section-root-relative (not absolute)
    for (const item of diskItems) {
      for (const seg of item.path) {
        expect(path.isAbsolute(seg)).to.equal(false);
      }
    }

    // spot-check specific items
    const sprite = diskItems.find((e) => e.name === "Sprite");
    expect(sprite).to.not.be.undefined;
    expect(sprite!.path).to.deep.equal(["images"]);

    const text = diskItems.find((e) => e.name === "Text");
    expect(text).to.not.be.undefined;
    expect(text!.path).to.deep.equal([]);

    const json = diskItems.find((e) => e.name === "JSON");
    expect(json).to.not.be.undefined;
    expect(json!.path).to.deep.equal(["global"]);

    const tilemap = diskItems.find((e) => e.name === "Tilemap");
    expect(tilemap).to.not.be.undefined;
    expect(tilemap!.path).to.deep.equal(["tiles"]);
  });

  it("F1-5: diffNameMaps produces missing, untracked, and moved entries correctly", () => {
    const manifestItems = [
      { name: "Alpha", path: ["a"] as string[] },
      { name: "Beta", path: ["a"] as string[] }, // will be moved
      { name: "Gamma", path: [] as string[] }, // manifest-only → missing
    ];
    const diskItems = [
      { name: "Alpha", path: ["a"] as string[] }, // same → no entry
      { name: "Beta", path: ["b"] as string[] }, // different path → moved
      { name: "Delta", path: [] as string[] }, // disk-only → untracked
    ];
    const entries = diffNameMaps(manifestItems, diskItems);

    const missing = entries.filter((e) => e.kind === "missing");
    expect(missing.length).to.equal(1);
    expect(missing[0].name).to.equal("Gamma");
    expect(missing[0].manifestPath).to.deep.equal([]);
    expect(missing[0].diskPath).to.be.undefined;

    const untracked = entries.filter((e) => e.kind === "untracked");
    expect(untracked.length).to.equal(1);
    expect(untracked[0].name).to.equal("Delta");
    expect(untracked[0].diskPath).to.deep.equal([]);
    expect(untracked[0].manifestPath).to.be.undefined;

    const moved = entries.filter((e) => e.kind === "moved");
    expect(moved.length).to.equal(1);
    expect(moved[0].name).to.equal("Beta");
    expect(moved[0].manifestPath).to.deep.equal(["a"]);
    expect(moved[0].diskPath).to.deep.equal(["b"]);
  });

  it("F1-6: walkDiskFileTree returns main.ts and importsForEvents.ts; excludes ts-defs/ and tsconfig.json", () => {
    const scriptFolder = path.join(FIXTURE_DIR, "scripts");
    const items = walkDiskFileTree(scriptFolder, m.rootFileFolders.script.subfolders);
    const names = items.map((e) => e.name);

    expect(names).to.include("main.ts");
    expect(names).to.include("importsForEvents.ts");

    // ts-defs/ is undeclared → not recursed
    expect(names.some((n) => n.includes("ts-defs"))).to.equal(false);
    // tsconfig.json is editor-local → filtered
    expect(names.includes("tsconfig.json")).to.equal(false);
  });

  it("F1-7: walkManifestNameTree with nameless subfolder (timelines) does not throw and yields Timeline 1 at root path", () => {
    let items: Array<{ name: string; path: string[] }>;
    expect(() => {
      items = walkManifestNameTree(m.timelines);
    }).to.not.throw();
    // Timeline 1 is a root item; the nameless subfolder has no items, so path is []
    const timeline = items!.find((e) => e.name === "Timeline 1");
    expect(timeline).to.not.be.undefined;
    expect(timeline!.path).to.deep.equal([]);
  });
});
