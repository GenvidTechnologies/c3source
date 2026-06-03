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
  deriveExpectedImageNames,
  detectImageDrift,
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
    expect(m.savedWithRelease).to.equal(48702);
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

  it("R-C14: clearing layouts.items surfaces real files as untracked DriftEntries; no editor-local entries", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    clone.layouts.items = [];
    const drift = detectManifestDrift(FIXTURE_DIR, clone);
    expect(drift.inSync).to.equal(false);
    const layoutsDrift = drift.sections.find((s: SectionDrift) => s.section === "layouts");
    expect(layoutsDrift).to.not.be.undefined;
    const untracked = layoutsDrift!.entries.filter((e) => e.kind === "untracked");
    expect(untracked.length).to.equal(3);
    const names = untracked.map((e) => e.name).sort();
    expect(names).to.deep.equal(["Main Layout", "Second Layout", "Templates Layout"]);
    expect(untracked.every((e) => Array.isArray(e.diskPath))).to.equal(true);
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

describe("F4: image-derived drift", () => {
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

  it("F4-4: detectImageDrift on clean fixture → not null, entries empty (all 9 names match 9 on-disk pngs)", () => {
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
});
