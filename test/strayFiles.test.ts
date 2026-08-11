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
  openProject,
  C3_SECTION_FOLDERS,
  type StrayFile,
  type C3ProjectManifest,
  type C3NameFolder,
  type C3FileFolder,
  type DriftKind,
} from "../src/c3source.js";
import { fixtureProjectPath, fixtureProjectExists, makeTempImageProject } from "./fixtureHelpers.js";

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

describe("detectManifestDrift: strays wiring (#76 Task 5)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("SF9 (R26): inSync stays keyed on sections only — a stray-only anomaly is inSync, and removing a stray never flips a drift-caused inSync", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r26-"));
    write(root, "layouts/Real.json", "{}");
    write(root, "layouts/notes.md", "stray");
    const declaredManifest = minimalManifest({ layouts: { items: ["Real"], subfolders: [] } });

    // A project whose only anomaly is a stray file: inSync stays true, sections stays [],
    // and the stray is still reported.
    const strayOnly = detectManifestDrift(root, declaredManifest);
    expect(strayOnly.inSync).to.equal(true);
    expect(strayOnly.sections).to.deep.equal([]);
    expect(strayOnly.strays).to.not.be.undefined;
    expect(strayOnly.strays!.length).to.equal(1);

    // Add real drift (an undeclared item) alongside the existing stray: inSync flips to false.
    write(root, "layouts/Undeclared.json", "{}");
    const driftAndStray = detectManifestDrift(root, declaredManifest);
    expect(driftAndStray.inSync).to.equal(false);
    expect(driftAndStray.strays).to.not.be.undefined;
    expect(driftAndStray.strays!.length).to.equal(1);

    // Removing the stray does not change inSync — it is still driven by the real drift.
    rmSync(path.join(root, "layouts", "notes.md"));
    const driftOnly = detectManifestDrift(root, declaredManifest);
    expect(driftOnly.inSync).to.equal(false);
    expect(driftOnly.strays).to.be.undefined;
  });

  it("SF10 (R27): strays is omitted when empty — canonical fixture's drift payload is byte-identical to a pre-2.0.0 clean result", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();

    const drift = detectManifestDrift(fixtureProjectPath());
    expect(Object.prototype.hasOwnProperty.call(drift, "strays"), "strays must not be an own property when empty").to
      .equal(false);
    expect(drift.strays).to.equal(undefined);
    // Whole-object equality: proves no OTHER surprise member snuck onto a clean result either.
    expect(drift).to.deep.equal({ sections: [], inSync: true });
  });

  it("SF11 (R31): degradation and strays are independent — an unmapped image fileType degrades images while a stray elsewhere is reported normally", () => {
    // A valid MIME deliberately absent from IMAGE_FILE_TYPE_EXTENSIONS — forces detectImageDrift to throw.
    const unmappedObjectType = { name: "Baz", image: { fileType: "image/tiff" } };
    root = makeTempImageProject([unmappedObjectType], [], {
      name: "r31-temp-project",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 49500,
    });
    write(root, "layouts/notes.md", "stray");

    const drift = detectManifestDrift(root);

    expect(drift.degraded).to.not.be.undefined;
    expect(drift.degraded!.length).to.equal(1);
    expect(drift.degraded![0].section).to.equal("images");
    const imagesSection = drift.sections.find((s) => s.section === "images");
    expect(imagesSection, "images section must be absent, not just empty").to.be.undefined;

    expect(drift.strays).to.not.be.undefined;
    expect(drift.strays).to.deep.equal([{ section: "layouts", folder: "layouts", name: "notes.md", diskPath: [] }]);

    // No declared item and no on-disk item under layouts/ other than the stray -> no drift entries.
    expect(drift.inSync).to.equal(drift.sections.length === 0);
    expect(drift.inSync).to.equal(true);
  });

  it("SF12 (R33): the three surfaces agree — free detectStrayFiles, C3Project.detectStrayFiles(), and detectManifestDrift().strays, deterministically ordered", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-strays-r33-"));
    const withStrays = path.join(root, "with-strays");
    const withoutStrays = path.join(root, "without-strays");

    for (const folder of Object.values(C3_SECTION_FOLDERS)) {
      write(withStrays, `${folder}/Real.json`, "{}");
      write(withStrays, `${folder}/notes.md`, "x");
      write(withStrays, `${folder}/sub/other.md`, "x");
      write(withoutStrays, `${folder}/Real.json`, "{}");
    }
    const fullManifest = (): C3ProjectManifest =>
      minimalManifest({
        layouts: { items: ["Real"], subfolders: [] },
        eventSheets: { items: ["Real"], subfolders: [] },
        objectTypes: { items: ["Real"], subfolders: [] },
        timelines: { items: ["Real"], subfolders: [] },
        flowcharts: { items: ["Real"], subfolders: [] },
        families: { items: ["Real"], subfolders: [] },
        models3d: { items: ["Real"], subfolders: [] },
      });
    writeC3JsonFile(path.join(withStrays, "project.c3proj"), fullManifest());
    writeC3JsonFile(path.join(withoutStrays, "project.c3proj"), fullManifest());

    // Free function vs. C3Project.detectStrayFiles().
    const directStrays = detectStrayFiles(withStrays);
    expect(directStrays.length).to.be.greaterThan(0);
    expect(openProject(withStrays).detectStrayFiles()).to.deep.equal(directStrays);

    // detectManifestDrift().strays agrees with the free function, both directly and via the handle.
    expect(detectManifestDrift(withStrays).strays).to.deep.equal(directStrays);
    expect(openProject(withStrays).detectManifestDrift().strays).to.deep.equal(directStrays);

    // Ordering is deterministic across two consecutive runs.
    expect(detectStrayFiles(withStrays)).to.deep.equal(detectStrayFiles(withStrays));

    // Empty case: all three surfaces agree strays is absent/undefined, not an empty array leaking through.
    expect(detectStrayFiles(withoutStrays)).to.deep.equal([]);
    expect(openProject(withoutStrays).detectStrayFiles()).to.deep.equal([]);
    expect(detectManifestDrift(withoutStrays).strays).to.equal(undefined);
    expect(openProject(withoutStrays).detectManifestDrift().strays).to.equal(undefined);
  });
});

// ─── R28: DriftKind must stay exhaustive at compile time ──────────────────────
//
// Purpose: this function is never called at runtime — it exists purely so
// `npm run typecheck` fails the moment a member is ever added to `DriftKind`.
// The `default` arm assigns the narrowed (impossible, once every case is listed)
// value to a `never`-typed binding; if a new DriftKind member appears without a
// matching `case`, the narrowed type in `default` stops being `never` and the
// assignment becomes a compile error. This function does not exercise runtime
// behaviour and MUST NOT be deleted just because it looks unused.
function assertDriftKindExhaustive_r28(kind: DriftKind): string {
  switch (kind) {
    case "missing":
      return "missing";
    case "untracked":
      return "untracked";
    case "moved":
      return "moved";
    case "folder-missing":
      return "folder-missing";
    case "folder-untracked":
      return "folder-untracked";
    case "dangling-ref":
      return "dangling-ref";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
void assertDriftKindExhaustive_r28;
