import { describe, it } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  openProject,
  readProjectManifest,
  writeC3JsonFile,
  C3_SECTION_FOLDERS,
  C3_ROOT_FILE_FOLDERS,
  PROJECT_MANIFEST_FILE,
  IMAGES_FOLDER,
  find_all_eventsheets_path,
  find_all_layouts_path,
  find_all_objectTypes_path,
  visit_layers_in_layouts,
  detectManifestDrift,
  detectImageDrift,
  detectReferenceIntegrity,
  type C3Project,
  type C3ProjectManifest,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath, makeTempProject } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixtureProjectPath();

describe("openProject — path fields", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
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
  it("OP-8: manifest() deep-equals readProjectManifest(manifestPath)", function () {
    if (!fixtureProjectExists()) return this.skip();
    const proj = openProject(FIXTURE_DIR);
    const expected = readProjectManifest(path.join(FIXTURE_DIR, PROJECT_MANIFEST_FILE));
    expect(proj.manifest()).to.deep.equal(expected);
  });

  it("OP-9: manifest() returns the same cached object on repeated calls (referential equality)", function () {
    if (!fixtureProjectExists()) return this.skip();
    const proj = openProject(FIXTURE_DIR);
    const first = proj.manifest();
    const second = proj.manifest();
    expect(first).to.equal(second);
  });
});

describe("openProject — has*() methods on the fixture", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
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

describe("openProject — findAll*() finders", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-22: findAllEventSheets() equals find_all_eventsheets_path on the fixture eventSheets dir", () => {
    const expected = find_all_eventsheets_path(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.eventSheets));
    expect(proj.findAllEventSheets()).to.deep.equal(expected);
  });

  it("OP-23: findAllLayouts() equals find_all_layouts_path on the fixture layouts dir", () => {
    const expected = find_all_layouts_path(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.layouts));
    expect(proj.findAllLayouts()).to.deep.equal(expected);
  });

  it("OP-24: findAllObjectTypes() equals find_all_objectTypes_path on the fixture objectTypes dir", () => {
    const expected = find_all_objectTypes_path(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.objectTypes));
    expect(proj.findAllObjectTypes()).to.deep.equal(expected);
  });

  it("OP-25: findAllObjectTypes('tiles') returns a non-empty strict subset of findAllObjectTypes()", () => {
    const all = proj.findAllObjectTypes();
    const sub = proj.findAllObjectTypes("tiles");
    expect(sub.length).to.be.greaterThan(0);
    expect(sub.length).to.be.lessThan(all.length);
    for (const p of sub) {
      expect(all).to.include(p);
    }
  });

  it("OP-26: findAllObjectTypes('tiles') — every path contains the 'tiles' segment", () => {
    const sub = proj.findAllObjectTypes("tiles");
    for (const p of sub) {
      // Use path.sep-agnostic check: split and look for the segment
      const segments = p.split(/[\\/]/);
      expect(segments).to.include("tiles");
    }
  });

  it("OP-27: findAllEventSheets('does-not-exist') returns []", () => {
    expect(proj.findAllEventSheets("does-not-exist")).to.deep.equal([]);
  });

  it("OP-28: findAllLayouts() on a temp dir with no layouts subfolder returns [] (does not throw)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-nolayouts-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllLayouts()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("OP-29: findAllFamilies() returns exactly {LevelMaps.json, TextFamily.json} by basename", () => {
    const families = proj.findAllFamilies();
    const basenames = families.map((p) => path.basename(p)).sort();
    expect(basenames).to.deep.equal(["LevelMaps.json", "TextFamily.json"]);
  });

  it("OP-30: findAllScripts() returns exactly {importsForEvents.ts, main.ts} by basename (source scripts only)", () => {
    const scripts = proj.findAllScripts();
    const basenames = scripts.map((p) => path.basename(p)).sort();
    expect(basenames).to.deep.equal(["importsForEvents.ts", "main.ts"]);
  });

  it("OP-31: findAllScripts() returns no .d.ts files (ts-defs/ excluded by predicate)", () => {
    const scripts = proj.findAllScripts();
    for (const p of scripts) {
      expect(p).to.not.match(/\.d\.ts$/);
    }
  });

  it("OP-32: findAllScripts() returns no path containing a 'ts-defs' segment", () => {
    const scripts = proj.findAllScripts();
    for (const p of scripts) {
      const segments = p.split(/[\\/]/);
      expect(segments).to.not.include("ts-defs");
    }
  });

  it("OP-33: findAllFamilies('does-not-exist') returns []", () => {
    expect(proj.findAllFamilies("does-not-exist")).to.deep.equal([]);
  });

  it("OP-34: findAllScripts('does-not-exist') returns []", () => {
    expect(proj.findAllScripts("does-not-exist")).to.deep.equal([]);
  });

  it("OP-35: findAllFamilies() on a temp dir with no families subfolder returns [] (does not throw)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-nofamilies-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllFamilies()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("OP-36: findAllScripts() on a temp dir with no scripts subfolder returns [] (does not throw)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-noscripts-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllScripts()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });
});

describe("openProject — detectManifestDrift() and detectImageDrift() delegators", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-37: detectManifestDrift() deep-equals standalone detectManifestDrift(FIXTURE_DIR) and inSync is true", () => {
    const fromHandle = proj.detectManifestDrift();
    const standalone = detectManifestDrift(FIXTURE_DIR);
    expect(fromHandle).to.deep.equal(standalone);
    expect(fromHandle.inSync).to.equal(true);
  });

  it("OP-38: detectImageDrift() deep-equals standalone detectImageDrift(FIXTURE_DIR)", () => {
    const fromHandle = proj.detectImageDrift();
    const standalone = detectImageDrift(FIXTURE_DIR);
    expect(fromHandle).to.deep.equal(standalone);
  });

  it("OP-39: detectManifestDrift() reuses the cached manifest (same manifest object as manifest())", () => {
    // Calling manifest() first caches the manifest; detectManifestDrift() should pass
    // that cached instance to the free function. We verify indirectly: the result must
    // match the standalone call (no infinite recursion or double-read failure).
    const cachedManifest = proj.manifest();
    const fromHandle = proj.detectManifestDrift();
    const direct = detectManifestDrift(FIXTURE_DIR, cachedManifest);
    expect(fromHandle).to.deep.equal(direct);
  });
});

describe("openProject — new *Dir path fields (OP-40 to OP-49)", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-40: timelinesDir is derived from C3_SECTION_FOLDERS.timelines", () => {
    expect(proj.timelinesDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.timelines));
  });

  it("OP-41: flowchartsDir is derived from C3_SECTION_FOLDERS.flowcharts", () => {
    expect(proj.flowchartsDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.flowcharts));
  });

  it("OP-42: models3dDir is derived from C3_SECTION_FOLDERS.models3d", () => {
    expect(proj.models3dDir).to.equal(path.join(FIXTURE_DIR, C3_SECTION_FOLDERS.models3d));
  });

  it("OP-43: imagesDir is derived from IMAGES_FOLDER", () => {
    expect(proj.imagesDir).to.equal(path.join(FIXTURE_DIR, IMAGES_FOLDER));
  });

  it("OP-44: soundsDir is derived from C3_ROOT_FILE_FOLDERS.sound", () => {
    expect(proj.soundsDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.sound));
  });

  it("OP-45: musicDir is derived from C3_ROOT_FILE_FOLDERS.music", () => {
    expect(proj.musicDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.music));
  });

  it("OP-46: videosDir is derived from C3_ROOT_FILE_FOLDERS.video", () => {
    expect(proj.videosDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.video));
  });

  it("OP-47: fontsDir is derived from C3_ROOT_FILE_FOLDERS.font", () => {
    expect(proj.fontsDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.font));
  });

  it("OP-48: iconsDir is derived from C3_ROOT_FILE_FOLDERS.icon", () => {
    expect(proj.iconsDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.icon));
  });

  it("OP-49: filesDir is derived from C3_ROOT_FILE_FOLDERS.general", () => {
    expect(proj.filesDir).to.equal(path.join(FIXTURE_DIR, C3_ROOT_FILE_FOLDERS.general));
  });
});

describe("openProject — new has*() methods on empty temp dir (OP-50 to OP-59)", () => {
  let tmpDir: string;
  let proj: C3Project;

  before(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-newdirs-"));
    proj = openProject(tmpDir);
  });

  after(() => {
    rmdirSync(tmpDir);
  });

  it("OP-50: hasTimelines() is false for an empty dir", () => {
    expect(proj.hasTimelines()).to.equal(false);
  });

  it("OP-51: hasFlowcharts() is false for an empty dir", () => {
    expect(proj.hasFlowcharts()).to.equal(false);
  });

  it("OP-52: hasModels3d() is false for an empty dir", () => {
    expect(proj.hasModels3d()).to.equal(false);
  });

  it("OP-53: hasImages() is false for an empty dir", () => {
    expect(proj.hasImages()).to.equal(false);
  });

  it("OP-54: hasSounds() is false for an empty dir", () => {
    expect(proj.hasSounds()).to.equal(false);
  });

  it("OP-55: hasMusic() is false for an empty dir", () => {
    expect(proj.hasMusic()).to.equal(false);
  });

  it("OP-56: hasVideos() is false for an empty dir", () => {
    expect(proj.hasVideos()).to.equal(false);
  });

  it("OP-57: hasFonts() is false for an empty dir", () => {
    expect(proj.hasFonts()).to.equal(false);
  });

  it("OP-58: hasIcons() is false for an empty dir", () => {
    expect(proj.hasIcons()).to.equal(false);
  });

  it("OP-59: hasFiles() is false for an empty dir", () => {
    expect(proj.hasFiles()).to.equal(false);
  });
});

describe("openProject — new has*() methods on the fixture (OP-60 to OP-63)", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  // fixture has: timelines/, flowcharts/, images/, icons/
  // fixture does NOT have: models3d/, sounds/, music/, videos/, fonts/, files/

  it("OP-60: hasTimelines() is true for the fixture", () => {
    expect(proj.hasTimelines()).to.equal(true);
  });

  it("OP-61: hasFlowcharts() is true for the fixture", () => {
    expect(proj.hasFlowcharts()).to.equal(true);
  });

  it("OP-62: hasImages() is true for the fixture", () => {
    expect(proj.hasImages()).to.equal(true);
  });

  it("OP-63: hasIcons() is true for the fixture", () => {
    expect(proj.hasIcons()).to.equal(true);
  });
});

describe("openProject — new findAll*() methods (OP-64 to OP-72)", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-64: findAllTimelines('does-not-exist') returns []", () => {
    expect(proj.findAllTimelines("does-not-exist")).to.deep.equal([]);
  });

  it("OP-65: findAllFlowcharts('does-not-exist') returns []", () => {
    expect(proj.findAllFlowcharts("does-not-exist")).to.deep.equal([]);
  });

  it("OP-66: findAllModels3d('does-not-exist') returns []", () => {
    expect(proj.findAllModels3d("does-not-exist")).to.deep.equal([]);
  });

  it("OP-67: findAllTimelines() on empty temp dir returns [] (does not throw)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-notimelines-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllTimelines()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("OP-68: findAllFlowcharts() on empty temp dir returns [] (does not throw)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-noflowcharts-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllFlowcharts()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("OP-69: findAllModels3d() on empty temp dir returns [] (does not throw)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-nomodels3d-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllModels3d()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("OP-70: findAllTimelines() on fixture returns a non-empty list of .json paths", () => {
    const timelines = proj.findAllTimelines();
    expect(timelines.length).to.be.greaterThan(0);
    for (const p of timelines) {
      expect(p).to.match(/\.json$/);
    }
  });

  it("OP-71: findAllFlowcharts() on fixture returns a non-empty list of .json paths", () => {
    const flowcharts = proj.findAllFlowcharts();
    expect(flowcharts.length).to.be.greaterThan(0);
    for (const p of flowcharts) {
      expect(p).to.match(/\.json$/);
    }
  });

  it("OP-72: IMAGES_FOLDER is exported as a string with value 'images'", () => {
    expect(typeof IMAGES_FOLDER).to.equal("string");
    expect(IMAGES_FOLDER).to.equal("images");
  });
});

describe("openProject — findAllScripts() excludes a stray .d.ts outside ts-defs/ (OP-73)", () => {
  it("OP-73: a hand-authored scripts/foo.d.ts sitting directly under scriptsDir is still excluded", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-strand3ts-"));
    try {
      const scriptsDir = path.join(tmpDir, C3_ROOT_FILE_FOLDERS.script);
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(path.join(scriptsDir, "foo.d.ts"), "export {};");
      writeFileSync(path.join(scriptsDir, "main.ts"), "export {};");

      const proj = openProject(tmpDir);
      const basenames = proj.findAllScripts().map((p) => path.basename(p));
      // The stray .d.ts is directly under scriptsDir, NOT inside ts-defs/, so the
      // uistate/ts-defs directory-skip rule in find_all_files_path never sees it —
      // it is the findAllScripts predicate's own `!file.endsWith(".d.ts")` clause
      // that must exclude it (see the comment on findAllScripts in src/project.ts).
      expect(basenames).to.deep.equal(["main.ts"]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── F4: writeManifest / manifestTolerant / reloadManifest (T14-T19) ─────────
//
// All of these write real bytes, so they use makeTempProject (P4) rather than the
// gitignored, upstream-owned test/fixtures/canonical/ — never write malformed or
// throwaway manifests there.

/** A minimal manifest satisfying every collectManifestIssues-required top-level field. */
function minimalManifest(name: string): C3ProjectManifest {
  return {
    name,
    runtime: "c3",
    projectFormatVersion: 1,
    savedWithRelease: 187,
  } as unknown as C3ProjectManifest;
}

describe("openProject — write surface exists and construction stays I/O-free (T14)", () => {
  it("T14: openProject on a non-existent path does not throw; all three new methods exist; construction touches no disk", () => {
    const missingRoot = path.join(tmpdir(), `c3source-missing-${Date.now()}`);
    let proj: C3Project | undefined;
    expect(() => {
      proj = openProject(missingRoot);
    }).to.not.throw();
    expect(proj!.writeManifest).to.be.a("function");
    expect(proj!.manifestTolerant).to.be.a("function");
    expect(proj!.reloadManifest).to.be.a("function");
  });
});

describe("openProject — writeManifest() write-through cache (T15, T16, T17)", () => {
  it("T15: writeManifest() with no argument writes the cached manifest in place; a fresh handle sees the change; original handle keeps referential identity", () => {
    const root = makeTempProject(minimalManifest("Original"));
    const proj = openProject(root);
    const m = proj.manifest();
    m.name = "Mutated";
    proj.writeManifest();

    const fresh = openProject(root).manifest();
    expect(fresh.name).to.equal("Mutated");

    // The original handle's manifest() still returns the exact same object by reference.
    expect(proj.manifest()).to.equal(m);
  });

  it("T16: writeManifest(m2) with a different object makes manifest() return m2 by reference", () => {
    const root = makeTempProject(minimalManifest("First"));
    const proj = openProject(root);
    proj.manifest(); // populates the cache with the original parsed object

    const m2 = minimalManifest("Second");
    proj.writeManifest(m2);

    expect(proj.manifest()).to.equal(m2);
  });

  it("T17: a failing write (circular reference) throws, and manifest() afterward still returns the pre-write object", () => {
    const root = makeTempProject(minimalManifest("Stable"));
    const proj = openProject(root);
    const original = proj.manifest();

    const circular: Record<string, unknown> = { ...minimalManifest("Circular") };
    circular.self = circular; // makes JSON.stringify throw during serialization

    expect(() => proj.writeManifest(circular as unknown as C3ProjectManifest)).to.throw();
    expect(proj.manifest()).to.equal(original);
  });
});

describe("openProject — manifestTolerant() cannot poison the strict cache (T18)", () => {
  it("T18: manifestTolerant() succeeds on a manifest missing savedWithRelease, but manifest() still throws afterward", () => {
    const bad = { name: "Bad", runtime: "c3", projectFormatVersion: 1 } as unknown as C3ProjectManifest;
    const root = makeTempProject(bad);
    const proj = openProject(root);

    let result: ReturnType<C3Project["manifestTolerant"]> | undefined;
    expect(() => {
      result = proj.manifestTolerant();
    }).to.not.throw();
    expect(result!.issues.map((i) => i.rule)).to.include("saved-with-release-number");

    // The tolerant read must never have populated the strict cache — this call still throws.
    expect(() => proj.manifest()).to.throw(/invalid project\.c3proj/);
  });
});

describe("openProject — reloadManifest() (T19)", () => {
  it("T19: reloadManifest() picks up an out-of-band rewrite of project.c3proj", () => {
    const root = makeTempProject(minimalManifest("Before"));
    const proj = openProject(root);
    proj.manifest(); // populates the cache with the old value

    // Bypass the handle entirely — simulates an external editor/tool rewriting the file.
    writeC3JsonFile(path.join(root, PROJECT_MANIFEST_FILE), minimalManifest("After"));

    const reloaded = proj.reloadManifest();
    expect(reloaded.name).to.equal("After");
    expect(proj.manifest()).to.equal(reloaded);
  });
});

// ─── F1: detectReferenceIntegrity() delegator + the pre-existing crash fix (OP-74 to OP-76) ─

describe("openProject — detectReferenceIntegrity() delegator (OP-74, OP-75)", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  it("OP-74: detectReferenceIntegrity() deep-equals standalone detectReferenceIntegrity(FIXTURE_DIR)", () => {
    const fromHandle = proj.detectReferenceIntegrity();
    const standalone = detectReferenceIntegrity(FIXTURE_DIR);
    expect(fromHandle).to.deep.equal(standalone);
  });

  it("OP-75: detectReferenceIntegrity() reuses the cached manifest — a mutation to it is reflected without a disk re-read", () => {
    const cachedManifest = proj.manifest();
    const before = proj.detectReferenceIntegrity();
    expect(before.ok).to.equal(true);

    // Mutate the cached manifest in place (same object detectManifestDrift/detectReferenceIntegrity
    // is handed) so every family-member and instance-type reference in the project now dangles.
    // If the handle instead re-read project.c3proj from disk, this mutation would have no effect
    // and `after.ok` would still be true.
    const originalObjectTypes = cachedManifest.objectTypes;
    cachedManifest.objectTypes = { items: [], subfolders: [] };
    try {
      const after = proj.detectReferenceIntegrity();
      expect(after.ok).to.equal(false);
      expect(after.issues.length).to.be.greaterThan(0);
    } finally {
      cachedManifest.objectTypes = originalObjectTypes;
    }
  });
});

describe("openProject — crash fix: non-.json files under objectTypes/ and layouts/ (OP-76)", () => {
  it("OP-76: a stray README.md under objectTypes/ does not crash collectAddonAttribution(), and one under layouts/ does not crash visit_layers_in_layouts", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-strayfiles-"));
    try {
      const objectTypesDir = path.join(tmpDir, C3_SECTION_FOLDERS.objectTypes);
      const layoutsDir = path.join(tmpDir, C3_SECTION_FOLDERS.layouts);
      mkdirSync(objectTypesDir, { recursive: true });
      mkdirSync(layoutsDir, { recursive: true });

      // As of 2.0.0, find_all_objectTypes_path / find_all_layouts_path delegate to
      // find_all_section_items_path and so already exclude a stray non-.json file like
      // README.md at the source — neither finder ever hands it to JSON.parse in the first
      // place. See ADR 0025. R9 below asserts that directly; the rest of this test keeps
      // its original "does not throw" shape as a behavioural regression guard.
      writeFileSync(path.join(objectTypesDir, "README.md"), "not json");
      writeFileSync(path.join(objectTypesDir, "Foo.json"), JSON.stringify({ name: "Foo" }));

      writeFileSync(path.join(layoutsDir, "README.md"), "not json");
      writeC3JsonFile(path.join(layoutsDir, "Main Layout.json"), { name: "Main Layout", layers: [] });

      // R9: the finders themselves never return the stray README.md.
      expect(find_all_objectTypes_path(objectTypesDir)).to.not.include(path.join(objectTypesDir, "README.md"));
      expect(find_all_layouts_path(layoutsDir)).to.not.include(path.join(layoutsDir, "README.md"));

      const proj = openProject(tmpDir);

      expect(() => proj.collectAddonAttribution()).to.not.throw();
      const attribution = proj.collectAddonAttribution();
      expect(attribution.map((a) => a.name)).to.deep.equal(["Foo"]);

      expect(() => visit_layers_in_layouts(layoutsDir, () => 0)).to.not.throw();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── F5: findAllScripts() authored vs. generated .js (T4, #73) ──────────────

describe("openProject — findAllScripts() selects .js/.ts source and drops generated .js output", () => {
  it("OP-77: returns main.ts, unpaired standalone.js, legacy.ts (not legacy.js), and sub/helper.js; excludes objects.d.ts and ts-defs/generated.d.ts", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-scriptexts-"));
    try {
      const scriptsDir = path.join(tmpDir, C3_ROOT_FILE_FOLDERS.script);
      const subDir = path.join(scriptsDir, "sub");
      const tsDefsDir = path.join(scriptsDir, "ts-defs");
      mkdirSync(subDir, { recursive: true });
      mkdirSync(tsDefsDir, { recursive: true });

      // Authored .ts — always returned.
      writeFileSync(path.join(scriptsDir, "main.ts"), "export {};");
      // Authored .js with no same-basename .ts beside it — genuinely authored, now returned
      // (the behaviour change: findAllScripts previously omitted this incorrectly).
      writeFileSync(path.join(scriptsDir, "standalone.js"), "export {};");
      // A .js/.ts pair — the .js is compiled output and must be dropped; the .ts is kept.
      writeFileSync(path.join(scriptsDir, "legacy.js"), "export {};");
      writeFileSync(path.join(scriptsDir, "legacy.ts"), "export {};");
      // A stray hand-authored .d.ts sitting loose directly under scriptsDir — excluded.
      writeFileSync(path.join(scriptsDir, "objects.d.ts"), "export {};");
      // A generated .d.ts under ts-defs/ — the directory is pruned, never even reached.
      writeFileSync(path.join(tsDefsDir, "generated.d.ts"), "export {};");
      // A nested subfolder with its own unpaired .js — proves the per-directory grouping
      // holds through recursion: this helper.js must NOT be cancelled by legacy.ts's sibling
      // .js in a different directory, nor cancel out with any .ts of the same basename
      // elsewhere.
      writeFileSync(path.join(subDir, "helper.js"), "export {};");

      const proj = openProject(tmpDir);
      const basenames = proj.findAllScripts().map((p) => path.basename(p)).sort();

      expect(basenames).to.deep.equal(["helper.js", "legacy.ts", "main.ts", "standalone.js"]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("OP-78: findAllScripts() on a temp dir with no scripts subfolder returns [] (graceful-empty)", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-noscripts2-"));
    try {
      const emptyProj = openProject(tmpDir);
      expect(emptyProj.findAllScripts()).to.deep.equal([]);
    } finally {
      rmdirSync(tmpDir);
    }
  });
});
