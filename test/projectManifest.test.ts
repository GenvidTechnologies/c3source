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
    expect(scriptDrift!.untracked.sort()).to.deep.equal(["importsForEvents.js", "main.js"]);
    // ts-defs/ is a directory and must not appear
    expect(scriptDrift!.untracked.some((u: string) => u.includes("ts-defs"))).to.equal(false);
  });
});
