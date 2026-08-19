import { describe, it, before } from "mocha";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseProjectManifest,
  readProjectManifest,
  validateProjectManifest,
  collectManifestItemNames,
  collectManifestFileNames,
  detectManifestDrift,
  deriveExpectedImageNames,
  deriveExpectedImages,
  C3_LEGACY_IMAGE_EXTENSION,
  detectImageDrift,
  C3_SECTION_FOLDERS,
  C3_ROOT_FILE_FOLDERS,
  TIMELINE_TRANSITIONS_FOLDER,
  IMAGE_FILE_TYPE_EXTENSIONS,
  SCRIPT_FILE_TYPE_EXTENSIONS,
  walkManifestNameTree,
  walkDiskNameTree,
  walkDiskFileTree,
  diffNameMaps,
  formatManifestPath,
  openProject,
  type C3ProjectManifest,
  type C3NameFolder,
  type C3FileFolder,
  type ManifestDrift,
  type SectionDrift,
  type ManifestShapeRuleId,
  type ManifestValidationIssue,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath, makeTempProject, makeTempImageProject } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixtureProjectPath();
const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");

describe("parseProjectManifest / readProjectManifest", () => {
  let m: C3ProjectManifest;

  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    m = readProjectManifest(MANIFEST_PATH);
  });

  it("R-C1: reads name and savedWithRelease from the fixture", () => {
    expect(m.name).to.equal("construct3-sample");
    expect(m.savedWithRelease).to.equal(49502);
  });

  it("R-C2: name-folder typing — layouts and eventSheets are nested under domain subfolders (v1.0.0 fold)", () => {
    // Templates Layout has no assigned event sheet, so it stays unfoldered at the section root.
    expect(m.layouts.items).to.deep.equal(["Templates Layout"]);
    expect(m.layouts.subfolders.map((sf) => sf.name)).to.deep.equal(["Gameplay", "UI"]);
    expect(m.layouts.subfolders.find((sf) => sf.name === "Gameplay")!.items).to.deep.equal(["Main Layout"]);
    expect(m.layouts.subfolders.find((sf) => sf.name === "UI")!.items).to.deep.equal(["Second Layout"]);

    // Every event sheet is foldered by domain — no root items at all.
    expect(m.eventSheets.items).to.deep.equal([]);
    expect(m.eventSheets.subfolders.map((sf) => sf.name)).to.deep.equal(["Gameplay", "UI"]);
    expect(m.eventSheets.subfolders.find((sf) => sf.name === "Gameplay")!.items).to.deep.equal(["Event sheet 1"]);
    expect(m.eventSheets.subfolders.find((sf) => sf.name === "UI")!.items).to.deep.equal(["Event sheet 2"]);

    // collectManifestItemNames must still recover every item across the flat and nested entries.
    expect(collectManifestItemNames(m.layouts).sort()).to.deep.equal([
      "Main Layout",
      "Second Layout",
      "Templates Layout",
    ]);
    expect(collectManifestItemNames(m.eventSheets).sort()).to.deep.equal(["Event sheet 1", "Event sheet 2"]);
  });

  it("R-C3: file-folder typing — script items and icon count", () => {
    expect(m.rootFileFolders.script.items[0].name).to.equal("importsForEvents.ts");
    expect(typeof m.rootFileFolders.script.items[0].sid).to.equal("number");
    expect(m.rootFileFolders.icon.items.length).to.equal(7);
  });

  it("R-C4: collectManifestItemNames recurses into subfolders (timelines, incl. unnamed transitions)", () => {
    const names = collectManifestItemNames(m.timelines);
    // root item, then the unnamed transitions subfolder + its named "Others" child, then "Mixing"
    expect(names).to.deep.equal(["Timeline 1", "Matt's Ease", "Matt's Ease2", "Timeline 2"]);
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

  it("R-C16: populated subfolders carry a name; the unnamed timelines/transitions subfolder has none", () => {
    expect(m.objectTypes.subfolders.map((sf) => sf.name)).to.deep.equal(["global", "images", "tiles"]);
    // C3 serializes the timelines/transitions ("Eases") container as an UNNAMED subfolder;
    // it must parse cleanly with name === undefined (the sibling "Mixing" is named).
    expect(m.timelines.subfolders[0].name).to.equal(undefined);
    expect(m.timelines.subfolders[1].name).to.equal("Mixing");
  });

  it("R-C17: containers are typed with a string[] members list", () => {
    expect(m.containers[0].members).to.deep.equal(["Sprite2", "Text2"]);
  });
});

describe("parseProjectManifest — strict throws", () => {
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

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
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  it("flattens file-folder items recursively", () => {
    const m = readProjectManifest(MANIFEST_PATH);
    const names = collectManifestFileNames(m.rootFileFolders.script);
    expect(names).to.include("main.ts");
    expect(names).to.include("importsForEvents.ts");
    expect(names.length).to.equal(2);
  });
});

describe("detectManifestDrift", () => {
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  it("R-C12: clean fixture reports inSync === true (ts-defs/ and uistate/ not flagged)", () => {
    const drift = detectManifestDrift(FIXTURE_DIR);
    expect(drift.inSync).to.equal(true);
    expect(drift.sections).to.deep.equal([]);
  });

  it("R-C13: phantom manifest entry produces a missing DriftEntry", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.layouts.items.push("Phantom Layout");
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const layoutsDrift = drift.sections.find((s: SectionDrift) => s.section === "layouts");
    expect(layoutsDrift).to.not.be.undefined;
    const missing = layoutsDrift!.entries.filter((e) => e.kind === "missing");
    expect(missing.length).to.equal(1);
    expect(missing[0].name).to.equal("Phantom Layout");
    expect(missing[0].manifestPath).to.deep.equal([]);
  });

  it("R-C14: clearing the whole layouts section surfaces all real files (incl. foldered ones) as untracked DriftEntries; no editor-local entries", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    // Clear both the root items AND the domain subfolders, so nothing is tracked for the
    // section at all — the nested-shape equivalent of the pre-fold "clear items" case, since
    // two of the three on-disk layouts now live under Gameplay/UI subfolders, not the root.
    clone.layouts.items = [];
    clone.layouts.subfolders = [];
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const layoutsDrift = drift.sections.find((s: SectionDrift) => s.section === "layouts");
    expect(layoutsDrift).to.not.be.undefined;
    const untracked = layoutsDrift!.entries.filter((e) => e.kind === "untracked");
    expect(untracked.length).to.equal(3);
    const names = untracked.map((e) => e.name).sort();
    expect(names).to.deep.equal(["Main Layout", "Second Layout", "Templates Layout"]);
    expect(untracked.every((e) => Array.isArray(e.diskPath))).to.equal(true);
    // each entry's diskPath reflects the domain subfolder it was actually found under —
    // this is what would fail if the fold were undone (all diskPaths would collapse to [])
    // or misparsed (a foldered layout landing under the wrong/no subfolder).
    expect(untracked.find((e) => e.name === "Main Layout")!.diskPath).to.deep.equal(["Gameplay"]);
    expect(untracked.find((e) => e.name === "Second Layout")!.diskPath).to.deep.equal(["UI"]);
    expect(untracked.find((e) => e.name === "Templates Layout")!.diskPath).to.deep.equal([]);
    // editor-local artifacts must not appear in any section's entries
    const allEntryNames = drift.sections.flatMap((s: SectionDrift) => s.entries.map((e) => e.name));
    expect(allEntryNames.some((n: string) => n.includes("instancesBar") || n === "uistate")).to.equal(false);
  });

  it("R-C15: clearing script items surfaces ts files as untracked DriftEntries; ts-defs/ and tsconfig.json not flagged", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.rootFileFolders.script.items = [];
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const scriptDrift = drift.sections.find((s: SectionDrift) => s.section === "rootFileFolders.script");
    expect(scriptDrift).to.not.be.undefined;
    const untracked = scriptDrift!.entries.filter((e) => e.kind === "untracked");
    expect(untracked.length).to.equal(2);
    const names = untracked.map((e) => e.name).sort();
    expect(names).to.deep.equal(["importsForEvents.ts", "main.ts"]);
    // ts-defs/ (undeclared dir) and tsconfig.json (editor-local) must not appear
    expect(untracked.some((e) => e.name.includes("ts-defs"))).to.equal(false);
    expect(untracked.some((e) => e.name === "tsconfig.json")).to.equal(false);
  });

  it("R-C20: clean fixture has no container drift (all members are declared object types)", () => {
    const drift = detectManifestDrift(FIXTURE_DIR);
    expect(drift.sections.find((s: SectionDrift) => s.section === "containers")).to.be.undefined;
  });

  it("R-C21: a container member naming a missing object type is a dangling-ref", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    // remove Sprite2 from the manifest's object types (it is a container member)
    clone.objectTypes.subfolders = clone.objectTypes.subfolders.map((sf) => ({
      ...sf,
      items: sf.items.filter((n) => n !== "Sprite2"),
    }));
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const containerDrift = drift.sections.find((s: SectionDrift) => s.section === "containers");
    expect(containerDrift).to.not.be.undefined;
    const dangling = containerDrift!.entries.filter((e) => e.kind === "dangling-ref");
    expect(dangling.length).to.equal(1);
    expect(dangling[0].name).to.equal("Sprite2");
    expect(dangling[0].manifestPath).to.deep.equal(["#0"]);
  });

  it("R-C22: clean fixture has no folder-level drift (objectTypes subfolders match disk)", () => {
    const drift = detectManifestDrift(FIXTURE_DIR);
    const folderKinds = drift.sections.flatMap((s) => s.entries.map((e) => e.kind));
    expect(folderKinds.includes("folder-missing")).to.equal(false);
    expect(folderKinds.includes("folder-untracked")).to.equal(false);
  });

  it("R-C23: a manifest subfolder with no on-disk directory is folder-missing", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.objectTypes.subfolders.push({ items: [], subfolders: [], name: "phantom" });
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    const objectTypesDrift = drift.sections.find((s: SectionDrift) => s.section === "objectTypes");
    expect(objectTypesDrift).to.not.be.undefined;
    const missing = objectTypesDrift!.entries.filter((e) => e.kind === "folder-missing");
    expect(missing.length).to.equal(1);
    expect(missing[0].name).to.equal("phantom");
    expect(missing[0].manifestPath).to.deep.equal(["phantom"]);
  });

  it("R-C24: an on-disk subdirectory with no manifest subfolder is folder-untracked", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    // drop the "tiles" subfolder from the manifest; the tiles/ directory still exists on disk
    clone.objectTypes.subfolders = clone.objectTypes.subfolders.filter((sf) => sf.name !== "tiles");
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    const objectTypesDrift = drift.sections.find((s: SectionDrift) => s.section === "objectTypes");
    expect(objectTypesDrift).to.not.be.undefined;
    const untrackedFolders = objectTypesDrift!.entries.filter((e) => e.kind === "folder-untracked");
    expect(untrackedFolders.map((e) => e.name)).to.include("tiles");
    expect(untrackedFolders.find((e) => e.name === "tiles")!.diskPath).to.deep.equal(["tiles"]);
  });

  it("R-C25: timeline with a transitions/ ('Eases') dir reports NO drift (unnamed subfolder maps cleanly)", () => {
    // The fixture's timelines/transitions/ is serialized as an unnamed subfolder; on a clean
    // tree this must NOT surface as moved items or folder-missing/untracked drift (#28).
    const drift = detectManifestDrift(FIXTURE_DIR);
    expect(drift.sections.find((s: SectionDrift) => s.section === "timelines")).to.be.undefined;
    expect(TIMELINE_TRANSITIONS_FOLDER).to.equal("transitions");
  });

  it("R-C26: a transition item declared at the timelines root (not in the unnamed subfolder) is moved", () => {
    // Confirms the transitions mapping is genuinely applied to the disk comparison: if the
    // manifest places "Matt's Ease" at the root instead of inside the unnamed transitions
    // container, drift reports it as moved (manifest [] vs disk ["transitions"]) — not clean.
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.timelines.items = [...clone.timelines.items, "Matt's Ease"];
    clone.timelines.subfolders[0].items = []; // remove it from the unnamed transitions subfolder
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    const timelinesDrift = drift.sections.find((s: SectionDrift) => s.section === "timelines");
    expect(timelinesDrift).to.not.be.undefined;
    const moved = timelinesDrift!.entries.filter((e) => e.kind === "moved");
    const mattsEase = moved.find((e) => e.name === "Matt's Ease");
    expect(mattsEase).to.not.be.undefined;
    expect(mattsEase!.manifestPath).to.deep.equal([]);
    expect(mattsEase!.diskPath).to.deep.equal(["transitions"]);
  });
});

describe("F1: path-walk primitives", () => {
  let m: C3ProjectManifest;

  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
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

  it("F1-3: walkManifestNameTree yields all 12 objectType items with correct paths", () => {
    const items = walkManifestNameTree(m.objectTypes);
    // root: Text, TextInput, Text2, NavButton
    expect(
      items
        .filter((e) => e.path.length === 0)
        .map((e) => e.name)
        .sort(),
    ).to.deep.equal(["NavButton", "Text", "Text2", "TextInput"]);
    // global subfolder
    expect(items.find((e) => e.name === "JSON")!.path).to.deep.equal(["global"]);
    // images subfolder: 9patch, Sprite, Sprite2, Sprite3
    const imageItems = items.filter((e) => e.path.length === 1 && e.path[0] === "images").map((e) => e.name);
    expect(imageItems.sort()).to.deep.equal(["9patch", "Sprite", "Sprite2", "Sprite3"]);
    // tiles subfolder
    const tileItems = items.filter((e) => e.path.length === 1 && e.path[0] === "tiles").map((e) => e.name);
    expect(tileItems.sort()).to.deep.equal(["JPEGTileBackground", "TiledBackground", "Tilemap"]);
    expect(items.length).to.equal(12);
  });

  it("F1-4: walkDiskNameTree yields the same 12 name/path pairs as manifest (section-root-relative)", () => {
    const diskItems = walkDiskNameTree(path.join(FIXTURE_DIR, "objectTypes"));
    expect(diskItems.length).to.equal(12);

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

  it("F1-7: walkManifestNameTree without unnamedSubfolderName leaves a nameless subfolder segment-less", () => {
    let items: Array<{ name: string; path: string[] }>;
    expect(() => {
      items = walkManifestNameTree(m.timelines);
    }).to.not.throw();
    // Timeline 1 is a root item → path []
    expect(items!.find((e) => e.name === "Timeline 1")!.path).to.deep.equal([]);
    // With no unnamedSubfolderName, the unnamed transitions subfolder contributes no segment,
    // so its item lands at root and its named child keeps only its own name.
    expect(items!.find((e) => e.name === "Matt's Ease")!.path).to.deep.equal([]);
    expect(items!.find((e) => e.name === "Matt's Ease2")!.path).to.deep.equal(["Others"]);
  });

  it("F1-8: walkManifestNameTree maps the unnamed timelines subfolder to TIMELINE_TRANSITIONS_FOLDER", () => {
    const items = walkManifestNameTree(m.timelines, [], TIMELINE_TRANSITIONS_FOLDER);
    // unnamed transitions subfolder now contributes the "transitions" segment...
    expect(items.find((e) => e.name === "Matt's Ease")!.path).to.deep.equal(["transitions"]);
    // ...and its named child nests beneath it.
    expect(items.find((e) => e.name === "Matt's Ease2")!.path).to.deep.equal(["transitions", "Others"]);
    // a real named sibling subfolder is unaffected; root items stay at root.
    expect(items.find((e) => e.name === "Timeline 2")!.path).to.deep.equal(["Mixing"]);
    expect(items.find((e) => e.name === "Timeline 1")!.path).to.deep.equal([]);
  });
});

describe("F4: image-derived drift", () => {
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  const readObjectType = (...segments: string[]): Record<string, unknown> => {
    const p = path.join(FIXTURE_DIR, "objectTypes", ...segments);
    return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
  };

  it("F4-1: deriveExpectedImageNames on 9patch.json → [9patch.png]; on Tilemap.json → [tilemap.png]", () => {
    const nineP = readObjectType("images", "9patch.json");
    expect(deriveExpectedImageNames(nineP)).to.deep.equal(["9patch.png"]);

    const tilemap = readObjectType("tiles", "Tilemap.json");
    expect(deriveExpectedImageNames(tilemap)).to.deep.equal(["tilemap.png"]);
  });

  it("F4-2: deriveExpectedImageNames on Sprite.json → 4 frame names with subfolder collapsed and frames padded", () => {
    const sprite = readObjectType("images", "Sprite.json");
    const names = deriveExpectedImageNames(sprite).sort();
    expect(names).to.deep.equal([
      "sprite-animation 1-000.png",
      "sprite-animation 2-000.png",
      "sprite-animation 2-001.png",
      "sprite-animation 3-000.png",
    ]);
  });

  it("F4-3: deriveExpectedImageNames on Text.json → [] (no image or animations field)", () => {
    const text = readObjectType("Text.json");
    expect(deriveExpectedImageNames(text)).to.deep.equal([]);
  });

  it("F4-4: detectImageDrift on clean fixture → not null, entries empty (all 10 names match 10 on-disk images: 9 png + jpegtilebackground.jpg)", () => {
    const result = detectImageDrift(FIXTURE_DIR);
    expect(result).to.not.be.null;
    expect(result!.section).to.equal("images");
    expect(result!.folder).to.equal("images");
    expect(result!.entries).to.deep.equal([]);
  });

  it("F4-5: detectManifestDrift inSync stays true on clean fixture with images wired in (R-C12 holds)", () => {
    const drift = detectManifestDrift(FIXTURE_DIR);
    expect(drift.inSync).to.equal(true);
    // images section is not appended when entries is empty
    const imagesSection = drift.sections.find((s: SectionDrift) => s.section === "images");
    expect(imagesSection).to.be.undefined;
  });

  it("F4-6: detectImageDrift returns null when images/ is absent; deriveExpectedImageNames({}) → [] (safe on minimal input)", () => {
    // No images/ directory: use a path that does not exist on disk
    const noImagesDir = path.join(FIXTURE_DIR, "__no_images_here__");
    const result = detectImageDrift(noImagesDir);
    expect(result).to.be.null;

    // Minimal object type with no image or animations fields → empty array, no throw
    expect(deriveExpectedImageNames({})).to.deep.equal([]);

    // Object type with animations but empty items/subfolders → no throw, empty result
    expect(deriveExpectedImageNames({ name: "Ghost", animations: { items: [], subfolders: [] } })).to.deep.equal([]);
  });

  it("F4-7: IMAGE_FILE_TYPE_EXTENSIONS exports png/jpeg/svg+xml/webp", () => {
    expect(IMAGE_FILE_TYPE_EXTENSIONS["image/png"]).to.equal(".png");
    expect(IMAGE_FILE_TYPE_EXTENSIONS["image/jpeg"]).to.equal(".jpg");
    expect(IMAGE_FILE_TYPE_EXTENSIONS["image/svg+xml"]).to.equal(".svg");
    expect(IMAGE_FILE_TYPE_EXTENSIONS["image/webp"]).to.equal(".webp");
  });

  it("F4-8: single-image branch resolves extension from fileType (jpeg→.jpg, svg→.svg, webp→.webp, png→.png)", () => {
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/jpeg" } })).to.deep.equal(["foo.jpg"]);
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/svg+xml" } })).to.deep.equal(["foo.svg"]);
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/webp" } })).to.deep.equal(["foo.webp"]);
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/png" } })).to.deep.equal(["foo.png"]);
  });

  it("F4-9: animation branch resolves extension per frame from its own fileType", () => {
    const ot = {
      name: "Bar",
      animations: {
        items: [{ name: "Run", frames: [{ fileType: "image/jpeg" }, { fileType: "image/webp" }] }],
        subfolders: [],
      },
    };
    const names = deriveExpectedImageNames(ot);
    expect(names).to.deep.equal(["bar-run-000.jpg", "bar-run-001.webp"]);
  });

  it("F4-10: absent fileType on single-image branch renders the labelled legacy default, no throw", () => {
    expect(deriveExpectedImageNames({ name: "Foo", image: {} })).to.deep.equal([`foo${C3_LEGACY_IMAGE_EXTENSION}`]);
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: null } })).to.deep.equal([
      `foo${C3_LEGACY_IMAGE_EXTENSION}`,
    ]);
  });

  it("F4-11: unknown MIME on single-image branch throws with 'unknown'", () => {
    expect(() => deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/gif" } })).to.throw(/unknown/i);
  });

  it("F4-12: absent fileType on animation frame renders the labelled legacy default, no throw", () => {
    const ot = {
      name: "Bar",
      animations: {
        items: [{ name: "Idle", frames: [{}] }],
        subfolders: [],
      },
    };
    expect(deriveExpectedImageNames(ot)).to.deep.equal([`bar-idle-000${C3_LEGACY_IMAGE_EXTENSION}`]);
  });

  it("F4-13: unknown MIME on animation frame throws with 'unknown'", () => {
    const ot = {
      name: "Bar",
      animations: {
        items: [{ name: "Idle", frames: [{ fileType: "image/bmp" }] }],
        subfolders: [],
      },
    };
    expect(() => deriveExpectedImageNames(ot)).to.throw(/unknown/i);
  });

  it("F4-1 and F4-2 still pass with real fixtures (all png → .png)", () => {
    const nineP = readObjectType("images", "9patch.json");
    expect(deriveExpectedImageNames(nineP)).to.deep.equal(["9patch.png"]);

    const tilemap = readObjectType("tiles", "Tilemap.json");
    expect(deriveExpectedImageNames(tilemap)).to.deep.equal(["tilemap.png"]);

    const sprite = readObjectType("images", "Sprite.json");
    const names = deriveExpectedImageNames(sprite).sort();
    expect(names).to.deep.equal([
      "sprite-animation 1-000.png",
      "sprite-animation 2-000.png",
      "sprite-animation 2-001.png",
      "sprite-animation 3-000.png",
    ]);
  });

  it("F4-14: JPEGTileBackground (image/jpeg) resolves to jpegtilebackground.jpg and detectImageDrift reports no drift", () => {
    // Real fixture: a TiledBg object declaring image/jpeg, backed by a genuine .jpg on disk.
    // This is the regression case from issue #29 where deriveExpectedImageNames always emitted
    // .png regardless of fileType, producing a false missing-.png / untracked-.jpg pair.
    const jpegBg = readObjectType("tiles", "JPEGTileBackground.json");
    expect(deriveExpectedImageNames(jpegBg)).to.deep.equal(["jpegtilebackground.jpg"]);

    // End-to-end: no false missing .png / untracked .jpg pair in the images folder
    const imageDrift = detectImageDrift(FIXTURE_DIR);
    expect(imageDrift).to.not.be.null;
    expect(imageDrift!.entries).to.deep.equal([]);

    // Manifest drift must still be clean (JPEGTileBackground + LevelMaps wired into project.c3proj)
    const manifestDrift = detectManifestDrift(FIXTURE_DIR);
    expect(manifestDrift.inSync).to.equal(true);
  });
});

describe("deriveExpectedImages (#68)", () => {
  it("single-image branch, mapped fileType → one ExpectedImage with the resolved ext", () => {
    const images = deriveExpectedImages({ name: "Foo", image: { fileType: "image/jpeg" } });
    expect(images).to.deep.equal([{ stem: "foo", ext: ".jpg", context: "Foo" }]);
  });

  it("single-image branch, absent fileType → one ExpectedImage with ext: undefined (pre-r402 legacy node)", () => {
    const images = deriveExpectedImages({ name: "Foo", image: {} });
    expect(images).to.deep.equal([{ stem: "foo", ext: undefined, context: "Foo" }]);

    const imagesNullFileType = deriveExpectedImages({ name: "Foo", image: { fileType: null } });
    expect(imagesNullFileType).to.deep.equal([{ stem: "foo", ext: undefined, context: "Foo" }]);
  });

  it("animation frame, mapped fileType → per-frame ExpectedImage with the resolved ext", () => {
    const ot = {
      name: "Bar",
      animations: {
        items: [{ name: "Run", frames: [{ fileType: "image/webp" }] }],
        subfolders: [],
      },
    };
    const images = deriveExpectedImages(ot);
    expect(images).to.deep.equal([{ stem: "bar-run-000", ext: ".webp", context: "Bar/Run#0" }]);
  });

  it("animation frame, absent fileType → per-frame ExpectedImage with ext: undefined (independent of the single-image branch)", () => {
    const ot = {
      name: "Bar",
      animations: {
        items: [{ name: "Run", frames: [{}] }],
        subfolders: [],
      },
    };
    const images = deriveExpectedImages(ot);
    expect(images).to.deep.equal([{ stem: "bar-run-000", ext: undefined, context: "Bar/Run#0" }]);
  });

  it("unmapped fileType still throws, on both the single-image and animation-frame branches", () => {
    expect(() => deriveExpectedImages({ name: "Foo", image: { fileType: "image/gif" } })).to.throw(/unknown/i);

    const ot = {
      name: "Bar",
      animations: {
        items: [{ name: "Run", frames: [{ fileType: "image/bmp" }] }],
        subfolders: [],
      },
    };
    expect(() => deriveExpectedImages(ot)).to.throw(/unknown/i);
  });

  it("C3_LEGACY_IMAGE_EXTENSION is the documented default extension ('.png')", () => {
    expect(C3_LEGACY_IMAGE_EXTENSION).to.equal(".png");
  });
});

describe("detectImageDrift: legacy (fileType-less) stem matching (#68)", () => {
  // A pre-r402-shaped object type: a single animation frame with no fileType field at all.
  const legacyObjectType = {
    name: "Bar",
    animations: {
      items: [{ name: "Idle", frames: [{}] }],
      subfolders: [],
    },
  };

  it("R8d: legacy end-to-end — fileType-less frame with the matching image present on disk → no drift, no throw", () => {
    // The on-disk file is .jpg, not the C3_LEGACY_IMAGE_EXTENSION default (.png): stem
    // matching, not an assumed extension, is what makes this resolve clean.
    const dir = makeTempImageProject([legacyObjectType], ["bar-idle-000.jpg"]);
    let result: SectionDrift | null = null;
    expect(() => {
      result = detectImageDrift(dir);
    }).to.not.throw();
    expect(result).to.not.be.null;
    expect(result!.entries).to.deep.equal([]);
  });

  it("R8e: stem matching doesn't hide real drift", () => {
    // Image absent entirely: no on-disk file shares the stem, so the comparison falls back
    // to the labelled legacy default and reports exactly one missing entry.
    const dirMissing = makeTempImageProject([legacyObjectType], []);
    const missingResult = detectImageDrift(dirMissing);
    expect(missingResult).to.not.be.null;
    const missing = missingResult!.entries.filter((e) => e.kind === "missing");
    expect(missingResult!.entries).to.deep.equal(missing);
    expect(missing.length).to.equal(1);
    expect(missing[0].name).to.equal(`bar-idle-000${C3_LEGACY_IMAGE_EXTENSION}`);

    // Image present but under an unexpected stem: stem matching must not treat "some file
    // exists somewhere" as satisfying the expectation — the expected stem is still missing,
    // and the unexpected file is untracked.
    const dirRenamed = makeTempImageProject([legacyObjectType], ["unexpected-stem.jpg"]);
    const renamedResult = detectImageDrift(dirRenamed);
    expect(renamedResult).to.not.be.null;
    expect(renamedResult!.entries.length).to.equal(2);
    const renamedMissing = renamedResult!.entries.filter((e) => e.kind === "missing");
    const renamedUntracked = renamedResult!.entries.filter((e) => e.kind === "untracked");
    expect(renamedMissing.length).to.equal(1);
    expect(renamedMissing[0].name).to.equal(`bar-idle-000${C3_LEGACY_IMAGE_EXTENSION}`);
    expect(renamedUntracked.length).to.equal(1);
    expect(renamedUntracked[0].name).to.equal("unexpected-stem.jpg");
  });
});

describe("detectManifestDrift: image degradation is reported, not swallowed (#68)", () => {
  // A valid MIME string that is deliberately NOT in IMAGE_FILE_TYPE_EXTENSIONS.
  const unmappedObjectType = {
    name: "Baz",
    image: { fileType: "image/tiff" },
  };

  it("R9a: an unmapped fileType degrades the images section instead of throwing, and reports why", () => {
    const dir = makeTempImageProject([unmappedObjectType], [], {
      name: "r9a-temp-project",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 49500,
    });
    const drift = detectManifestDrift(dir);

    expect(drift.degraded).to.not.be.undefined;
    expect(drift.degraded!.length).to.equal(1);
    expect(drift.degraded![0].section).to.equal("images");
    expect(drift.degraded![0].message).to.match(/image\/tiff/);

    const imagesSection = drift.sections.find((s) => s.section === "images");
    expect(imagesSection).to.be.undefined;
  });

  it("R9b: a clean run reports no degradation and stays in sync", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();

    const drift = detectManifestDrift(FIXTURE_DIR);
    expect(drift.degraded).to.be.undefined;
    expect(drift.inSync).to.equal(true);
  });

  it("R9c: a direct detectImageDrift call still throws on the same input, via both the free function and the C3Project handle", () => {
    const dir = makeTempImageProject([unmappedObjectType], []);
    expect(() => detectImageDrift(dir)).to.throw(/unknown/i);
    expect(() => openProject(dir).detectImageDrift()).to.throw(/unknown/i);
  });
});

describe("walkers tolerate a malformed manifest (#58)", () => {
  // A minimal well-formed skeleton so tests can override just the section under test.
  const emptyFolder = (): C3NameFolder => ({ items: [], subfolders: [] });
  const emptyFileFolder = (): C3FileFolder => ({ items: [], subfolders: [] });
  const rootFileFoldersSkeleton = (): C3ProjectManifest["rootFileFolders"] => ({
    script: emptyFileFolder(),
    sound: emptyFileFolder(),
    music: emptyFileFolder(),
    video: emptyFileFolder(),
    font: emptyFileFolder(),
    icon: emptyFileFolder(),
    general: emptyFileFolder(),
  });

  it("T13-1: collectManifestItemNames on a folder with non-array items/subfolders returns [] without throwing", () => {
    const malformed = { items: 123, subfolders: undefined } as unknown as C3NameFolder;
    expect(() => collectManifestItemNames(malformed)).to.not.throw();
    expect(collectManifestItemNames(malformed)).to.deep.equal([]);
  });

  it("T13-2: collectManifestFileNames on a folder with non-array items/subfolders returns [] without throwing", () => {
    const malformed = { items: 123, subfolders: undefined } as unknown as C3FileFolder;
    expect(() => collectManifestFileNames(malformed)).to.not.throw();
    expect(collectManifestFileNames(malformed)).to.deep.equal([]);
  });

  it("T13-3: detectManifestDrift tolerates a container with a non-array members field without throwing", () => {
    const manifest = {
      objectTypes: emptyFolder(),
      layouts: emptyFolder(),
      eventSheets: emptyFolder(),
      timelines: emptyFolder(),
      flowcharts: emptyFolder(),
      families: emptyFolder(),
      models3d: emptyFolder(),
      containers: [{ members: "not-an-array" }],
      rootFileFolders: rootFileFoldersSkeleton(),
    } as unknown as C3ProjectManifest;
    const projectDir = makeTempProject(manifest);
    let drift: ManifestDrift | undefined;
    expect(() => {
      drift = detectManifestDrift(projectDir, manifest);
    }).to.not.throw();
    expect(drift).to.be.an("object");
    expect(drift!.sections).to.be.an("array");
  });

  it("T13-4: detectManifestDrift tolerates a truthy non-object rootFileFolders category without throwing", () => {
    const manifest = {
      objectTypes: emptyFolder(),
      layouts: emptyFolder(),
      eventSheets: emptyFolder(),
      timelines: emptyFolder(),
      flowcharts: emptyFolder(),
      families: emptyFolder(),
      models3d: emptyFolder(),
      containers: [],
      rootFileFolders: { ...rootFileFoldersSkeleton(), script: "oops" },
    } as unknown as C3ProjectManifest;
    const projectDir = makeTempProject(manifest);
    let drift: ManifestDrift | undefined;
    expect(() => {
      drift = detectManifestDrift(projectDir, manifest);
    }).to.not.throw();
    expect(drift).to.be.an("object");
    expect(drift!.sections).to.be.an("array");
  });
});

describe("validateProjectManifest — shape validation (#58)", () => {
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  /** Every literal member of ManifestShapeRuleId, kept as a runtime value for T12's membership check. */
  const ALL_RULE_IDS: readonly ManifestShapeRuleId[] = [
    "top-level-object",
    "name-string",
    "runtime-string",
    "project-format-version-number",
    "saved-with-release-number",
    "name-folder-object",
    "name-folder-items",
    "name-folder-subfolders",
    "folder-name-string",
    "root-file-folders-object",
    "file-folder-object",
    "file-folder-items",
    "file-folder-subfolders",
    "file-entry-object",
    "file-entry-name",
    "file-entry-type",
    "file-entry-sid",
    "containers-array",
    "container-object",
    "container-members",
    "used-addons-array",
    "used-addon-object",
    "used-addon-type",
    "used-addon-id",
    "used-addon-name",
    "used-addon-author",
    "used-addon-bundled",
    "used-addon-version",
  ];

  /** T3 table: one entry per malformed clone. `mutate` mutates a fresh parse of the fixture in place. */
  const T3_CASES: Array<{ label: string; mutate: (bad: Record<string, any>) => void }> = [
    // Reused from the existing R-C9/R-C10/R-C18/R-C19 strict tests.
    { label: "R-C9 reuse: layouts.items not string[]", mutate: (bad) => (bad.layouts.items = [123]) },
    {
      label: "R-C10 reuse: a file entry's sid is not a number",
      mutate: (bad) => (bad.rootFileFolders.script.items[0].sid = "x"),
    },
    {
      label: "R-C18 reuse: a subfolder name is present but not a string",
      mutate: (bad) => (bad.objectTypes.subfolders[0].name = 123),
    },
    {
      label: "R-C19 reuse: a container's members are not all strings",
      mutate: (bad) => (bad.containers[0].members = ["ok", 7]),
    },
    // New: file-folder shape not yet covered by an existing strict test.
    { label: "rootFileFolders is not an object", mutate: (bad) => (bad.rootFileFolders = "oops") },
    { label: "rootFileFolders.script is not an object", mutate: (bad) => (bad.rootFileFolders.script = "oops") },
    {
      label: "rootFileFolders.script.items is not an array",
      mutate: (bad) => (bad.rootFileFolders.script.items = "oops"),
    },
    {
      label: "rootFileFolders.script.subfolders is not an array",
      mutate: (bad) => (bad.rootFileFolders.script.subfolders = "oops"),
    },
    {
      label: "a rootFileFolders.script file entry is not an object",
      mutate: (bad) => (bad.rootFileFolders.script.items[0] = "oops"),
    },
    // New: container shape.
    { label: "containers is not an array", mutate: (bad) => (bad.containers = "oops") },
    { label: "a containers entry is not an object", mutate: (bad) => (bad.containers[0] = "oops") },
    // New: used-addon shape.
    { label: "usedAddons is not an array", mutate: (bad) => (bad.usedAddons = "oops") },
    { label: "a usedAddons entry is not an object", mutate: (bad) => (bad.usedAddons[0] = "oops") },
    {
      label: "usedAddons[0].bundled is not a boolean",
      mutate: (bad) => (bad.usedAddons[0].bundled = "yes"),
    },
  ];

  it(`T3: ${T3_CASES.length} malformed clones — parseProjectManifest's throw message equals the prefix plus validateProjectManifest(bad)[0].message`, () => {
    expect(T3_CASES.length).to.be.at.least(12);
    for (const { label, mutate } of T3_CASES) {
      const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
      mutate(bad);
      const issues = validateProjectManifest(bad);
      expect(issues.length, label).to.be.greaterThan(0);
      let thrown: unknown;
      try {
        parseProjectManifest(bad);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, label).to.be.instanceOf(Error);
      expect((thrown as Error).message, label).to.equal(`invalid project.c3proj: ${issues[0].message}`);
    }
  });

  it("T4: two simultaneous violations emit issues in the pinned NAME_SECTIONS-before-usedAddons order", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    bad.layouts.items = [123]; // name-folder-items, via layouts (first NAME_SECTIONS entry)
    bad.usedAddons[0].bundled = "yes"; // used-addon-bundled, emitted last (usedAddons is checked last)

    const issues = validateProjectManifest(bad);
    expect(issues.map((i) => i.rule)).to.deep.equal(["name-folder-items", "used-addon-bundled"]);

    expect(() => parseProjectManifest(bad)).to.throw(/layouts\.items must be string\[\]/);
  });

  it("T12: every issue across every T3 case satisfies the path/message and rule-membership invariants", () => {
    const allIssues: ManifestValidationIssue[] = [];
    for (const { mutate } of T3_CASES) {
      const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
      mutate(bad);
      allIssues.push(...validateProjectManifest(bad));
    }
    expect(allIssues.length).to.be.greaterThan(0);
    for (const issue of allIssues) {
      expect(issue.path === "" || issue.message.startsWith(issue.path), JSON.stringify(issue)).to.equal(true);
      expect(ALL_RULE_IDS.includes(issue.rule), JSON.stringify(issue)).to.equal(true);
    }
  });
});

describe("dotted-extension convention (#73/#74)", () => {
  it("A5: SCRIPT_FILE_TYPE_EXTENSIONS maps both C3 script MIMEs to dotted extensions", () => {
    expect(SCRIPT_FILE_TYPE_EXTENSIONS["application/javascript"]).to.equal(".js");
    expect(SCRIPT_FILE_TYPE_EXTENSIONS["application/typescript"]).to.equal(".ts");
  });

  it("A6: every SCRIPT_FILE_TYPE_EXTENSIONS value starts with a leading dot", () => {
    for (const ext of Object.values(SCRIPT_FILE_TYPE_EXTENSIONS)) {
      expect(ext.startsWith("."), ext).to.equal(true);
    }
  });

  it("A8: IMAGE_FILE_TYPE_EXTENSIONS, C3_LEGACY_IMAGE_EXTENSION, and a derived ExpectedImage.ext all start with a leading dot", () => {
    for (const ext of Object.values(IMAGE_FILE_TYPE_EXTENSIONS)) {
      expect(ext.startsWith("."), ext).to.equal(true);
    }
    expect(C3_LEGACY_IMAGE_EXTENSION.startsWith(".")).to.equal(true);

    const images = deriveExpectedImages({ name: "Foo", image: { fileType: "image/jpeg" } });
    expect(typeof images[0].ext).to.equal("string");
    expect((images[0].ext as string).startsWith(".")).to.equal(true);
  });

  it("A9: deriveExpectedImageNames output is byte-identical to the pre-#74 filenames despite the dotted intermediate representation", () => {
    // Single top-level image, mapped fileType.
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/png" } })).to.deep.equal(["foo.png"]);

    // Animation with frames, mixed formats.
    const animOt = {
      name: "Bar",
      animations: {
        items: [{ name: "Run", frames: [{ fileType: "image/jpeg" }, { fileType: "image/webp" }] }],
        subfolders: [],
      },
    };
    expect(deriveExpectedImageNames(animOt)).to.deep.equal(["bar-run-000.jpg", "bar-run-001.webp"]);

    // Absent fileType (legacy fallback to C3_LEGACY_IMAGE_EXTENSION).
    expect(deriveExpectedImageNames({ name: "Foo", image: {} })).to.deep.equal(["foo.png"]);

    // Non-default (.jpg) case.
    expect(deriveExpectedImageNames({ name: "Foo", image: { fileType: "image/jpeg" } })).to.deep.equal(["foo.jpg"]);
  });
});
