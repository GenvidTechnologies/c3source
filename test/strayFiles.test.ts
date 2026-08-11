import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  detectStrayFiles,
  detectManifestDrift,
  find_all_section_items_path,
  find_all_files_path,
  isEditorLocalPath,
  writeC3JsonFile,
  C3_SECTION_FOLDERS,
  type StrayFile,
  type C3ProjectManifest,
  type C3NameFolder,
  type C3FileFolder,
} from "../src/c3source.js";

/** Write `content` at `root`/`rel`, creating any intermediate directories. */
function write(root: string, rel: string, content = ""): void {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const emptyFolder = (): C3NameFolder => ({ items: [], subfolders: [] });
const emptyFileFolder = (): C3FileFolder => ({ items: [], subfolders: [] });

/** A minimal, well-formed C3ProjectManifest skeleton so tests need only override the section under test. */
function minimalManifest(overrides: Partial<C3ProjectManifest> = {}): C3ProjectManifest {
  return {
    projectFormatVersion: 1,
    savedWithRelease: 49500,
    name: "sf-temp-project",
    runtime: "c3",
    objectTypes: emptyFolder(),
    layouts: emptyFolder(),
    eventSheets: emptyFolder(),
    timelines: emptyFolder(),
    flowcharts: emptyFolder(),
    families: emptyFolder(),
    models3d: emptyFolder(),
    containers: [],
    rootFileFolders: {
      script: emptyFileFolder(),
      sound: emptyFileFolder(),
      music: emptyFileFolder(),
      video: emptyFileFolder(),
      font: emptyFileFolder(),
      icon: emptyFileFolder(),
      general: emptyFileFolder(),
    },
    properties: {},
    ...overrides,
  };
}

describe("detectStrayFiles (#76 Task 3)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("SF1 (R21): table-driven over the seven C3_SECTION_FOLDERS keys — exactly notes.md and sub/Level1.dsl.txt per section", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r21-"));
    for (const folder of Object.values(C3_SECTION_FOLDERS)) {
      write(root, `${folder}/Real.json`, "{}");
      write(root, `${folder}/notes.md`, "ignored");
      write(root, `${folder}/sub/Nested.json`, "{}");
      write(root, `${folder}/sub/Level1.dsl.txt`, "dsl");
    }

    const strays = detectStrayFiles(root);
    for (const [section, folder] of Object.entries(C3_SECTION_FOLDERS)) {
      const sectionStrays = strays
        .filter((s) => s.section === section)
        .map((s) => ({ folder: s.folder, name: s.name, diskPath: s.diskPath }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect(sectionStrays, section).to.deep.equal([
        { folder, name: "Level1.dsl.txt", diskPath: ["sub"] },
        { folder, name: "notes.md", diskPath: [] },
      ]);
    }
  });

  it("SF2 (R22): a stray in an undeclared subtree is still found; detectManifestDrift separately reports folder-untracked; no stray for the directory itself", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r22-"));
    write(root, "layouts/generated/Foo.dsl.txt", "dsl");

    const strays = detectStrayFiles(root);
    expect(strays).to.deep.equal([{ section: "layouts", folder: "layouts", name: "Foo.dsl.txt", diskPath: ["generated"] }]);
    // No stray entry for the "generated" directory itself — strays are files, never directories.
    expect(strays.some((s) => s.name === "generated")).to.equal(false);

    const drift = detectManifestDrift(root, minimalManifest());
    const layoutsDrift = drift.sections.find((s) => s.section === "layouts");
    expect(layoutsDrift, "detectManifestDrift should still report the undeclared subfolder").to.not.be.undefined;
    expect(
      layoutsDrift!.entries.some((e) => e.kind === "folder-untracked" && e.name === "generated"),
      JSON.stringify(layoutsDrift!.entries),
    ).to.equal(true);
  });

  it("SF3 (R23): editor-local files (uistate/, *.uistate.json, tsconfig.json, ts-defs/*.d.ts) are never strays", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r23-"));
    write(root, "layouts/uistate/x.json", "{}");
    write(root, "layouts/Main.uistate.json", "{}");
    write(root, "layouts/tsconfig.json", "{}");
    write(root, "objectTypes/ts-defs/x.d.ts", "declare const x: unknown;");

    expect(detectStrayFiles(root)).to.deep.equal([]);
  });

  it("SF4 (R24): tri-partition invariant — items and strays are disjoint, and their union is every non-editor-local file", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r24-"));
    for (const folder of Object.values(C3_SECTION_FOLDERS)) {
      write(root, `${folder}/A.json`, "{}");
      write(root, `${folder}/readme.md`, "x");
      write(root, `${folder}/sub/B.json`, "{}");
      write(root, `${folder}/sub/notes.txt`, "x");
      write(root, `${folder}/uistate/Hidden.json`, "{}");
      write(root, `${folder}/C.uistate.json`, "{}");
    }

    const strays = detectStrayFiles(root);
    const relOf = (dir: string, abs: string): string => path.relative(dir, abs).split(path.sep).join("/");

    for (const [section, folder] of Object.entries(C3_SECTION_FOLDERS)) {
      const dir = path.join(root, folder);
      const itemBasenames = find_all_section_items_path(dir)
        .map((p) => relOf(dir, p))
        .sort();
      const strayBasenames = strays
        .filter((s) => s.section === section)
        .map((s) => [...s.diskPath, s.name].join("/"))
        .sort();
      const allBasenames = find_all_files_path(dir, (f) => !isEditorLocalPath(f))
        .map((p) => relOf(dir, p))
        .sort();

      // Disjoint — set equality, not counts.
      const overlap = itemBasenames.filter((b) => strayBasenames.includes(b));
      expect(overlap, `${section}: items/strays overlap`).to.deep.equal([]);
      // Union equals every non-editor-local file.
      expect([...itemBasenames, ...strayBasenames].sort(), section).to.deep.equal(allBasenames);
    }
  });

  it("SF5 (R25): an undeclared .json file is drift (untracked), never a stray — categories never overlap", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r25-"));
    write(root, "layouts/Undeclared.json", "{}");

    const drift = detectManifestDrift(root, minimalManifest());
    const layoutsDrift = drift.sections.find((s) => s.section === "layouts");
    expect(layoutsDrift).to.not.be.undefined;
    const untracked = layoutsDrift!.entries.filter((e) => e.kind === "untracked");
    expect(untracked.map((e) => e.name)).to.deep.equal(["Undeclared"]);

    expect(detectStrayFiles(root).filter((s) => s.section === "layouts")).to.deep.equal([]);
  });

  it("SF6 (R29): timelines/transitions/ ('Eases') yields exactly one stray, independent of any manifest shape", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r29-"));
    write(root, "timelines/T1.json", "{}");
    write(root, "timelines/transitions/Ease1.json", "{}");
    write(root, "timelines/transitions/notes.md", "x");

    const strays = detectStrayFiles(root);
    expect(strays).to.deep.equal([
      { section: "timelines", folder: "timelines", name: "notes.md", diskPath: ["transitions"] },
    ]);

    // Stray detection never consults the manifest: writing a real project.c3proj that models the
    // transitions container as C3's unnamed subfolder (the timelines exception) must not change
    // the result at all.
    const manifestWithTransitions = minimalManifest({
      timelines: { items: ["T1"], subfolders: [{ items: ["Ease1"], subfolders: [] }] },
    });
    writeC3JsonFile(path.join(root, "project.c3proj"), manifestWithTransitions);
    expect(detectStrayFiles(root)).to.deep.equal(strays);
  });

  it("SF7 (R30): manifest-independent — no project.c3proj, and a malformed one, neither throws nor changes the result", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r30-"));
    write(root, "layouts/Real.json", "{}");
    write(root, "layouts/notes.md", "x");

    let strays: StrayFile[] = [];
    expect(() => {
      strays = detectStrayFiles(root!);
    }).to.not.throw();
    expect(strays).to.deep.equal([{ section: "layouts", folder: "layouts", name: "notes.md", diskPath: [] }]);

    write(root, "project.c3proj", "{ this is not valid JSON ");
    let straysWithMalformedManifest: StrayFile[] = [];
    expect(() => {
      straysWithMalformedManifest = detectStrayFiles(root!);
    }).to.not.throw();
    expect(straysWithMalformedManifest).to.deep.equal(strays);
  });

  it("SF8 (R32): root file folders and images/ are out of scope — never reported as strays", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r32-"));
    write(root, "scripts/notes.md", "x");
    write(root, "sounds/readme.txt", "x");
    write(root, "images/readme.txt", "x");

    expect(detectStrayFiles(root)).to.deep.equal([]);
  });
});
