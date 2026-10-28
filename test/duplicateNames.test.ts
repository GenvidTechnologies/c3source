import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  detectImageDrift,
  detectManifestDrift,
  writeC3JsonFile,
  type C3FileFolder,
  type C3NameFolder,
  type DriftEntry,
} from "../src/c3source.js";
import { makeTempImageProject, makeTempProject } from "./fixtureHelpers.js";

describe("same item name at more than one path (#101)", () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const nameFolder = (items: string[], subfolders: C3NameFolder[] = [], name?: string): C3NameFolder =>
    (name === undefined ? { items, subfolders } : { name, items, subfolders }) as C3NameFolder;

  const fileFolder = (names: string[], subfolders: C3FileFolder[] = [], name?: string): C3FileFolder =>
    ({
      ...(name === undefined ? {} : { name }),
      items: names.map((n, i) => ({ name: n, type: "text/javascript", sid: i + 1 })),
      subfolders,
    }) as C3FileFolder;

  const empty = (): C3NameFolder => nameFolder([]);

  /** A manifest with the given layouts and scripts folders; everything else empty. */
  const manifestOf = (layouts: C3NameFolder, scripts: C3FileFolder = fileFolder([])) =>
    ({
      name: "t101",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 1,
      objectTypes: empty(),
      layouts,
      eventSheets: empty(),
      timelines: empty(),
      flowcharts: empty(),
      families: empty(),
      models3d: empty(),
      containers: [],
      rootFileFolders: {
        script: scripts,
        sound: fileFolder([]),
        music: fileFolder([]),
        video: fileFolder([]),
        font: fileFolder([]),
        icon: fileFolder([]),
        general: fileFolder([]),
      },
    }) as never;

  /** Build a tmpdir project holding the given files (rel paths) and directories (trailing `/`). */
  function project(onDisk: string[]): string {
    const dir = makeTempProject({});
    tempRoots.push(dir);
    for (const rel of onDisk) {
      const full = path.join(dir, rel);
      if (rel.endsWith("/")) mkdirSync(full, { recursive: true });
      else {
        mkdirSync(path.dirname(full), { recursive: true });
        writeC3JsonFile(full, {});
      }
    }
    return dir;
  }

  const sectionEntries = (
    dir: string,
    manifest: unknown,
    section: string,
  ): { entries: DriftEntry[]; drift: ReturnType<typeof detectManifestDrift> } => {
    const drift = detectManifestDrift(dir, manifest as never);
    return { entries: drift.sections.find((s) => s.section === section)?.entries ?? [], drift };
  };

  const layoutsEntries = (onDisk: string[], layouts: C3NameFolder): DriftEntry[] =>
    sectionEntries(project(onDisk), manifestOf(layouts), "layouts").entries;

  const a = (items: string[]): C3NameFolder => nameFolder(items, [], "a");
  const b = (items: string[]): C3NameFolder => nameFolder(items, [], "b");

  it("T101-1: the same layout name in two folders, declared and on disk, is in sync and a duplicate", () => {
    const layouts = nameFolder([], [a(["X"]), b(["X"])]);
    const dir = project(["layouts/a/X.json", "layouts/b/X.json"]);
    const drift = detectManifestDrift(dir, manifestOf(layouts));
    expect(drift.inSync).to.equal(true);
    expect(drift.sections).to.deep.equal([]);
    expect(drift.duplicates).to.deep.equal([
      { section: "layouts", folder: "layouts", name: "X", manifestPaths: [["a"], ["b"]], diskPaths: [["a"], ["b"]] },
    ]);
  });

  it("T101-6: the same layout name twice in one manifest folder is reported as a duplicate", () => {
    const dir = project(["layouts/a/X.json"]);
    const drift = detectManifestDrift(dir, manifestOf(nameFolder([], [a(["X", "X"])])));
    expect(drift.inSync).to.equal(true);
    expect(drift.duplicates).to.deep.equal([
      { section: "layouts", folder: "layouts", name: "X", manifestPaths: [["a"], ["a"]], diskPaths: [["a"]] },
    ]);
  });

  it("T101-9: the same script name twice in one folder is reported as a duplicate", () => {
    const scripts = fileFolder([], [fileFolder(["x.ts", "x.ts"], [], "a")]);
    const dir = project(["scripts/a/x.ts"]);
    const drift = detectManifestDrift(dir, manifestOf(empty(), scripts));
    expect(drift.duplicates).to.deep.equal([
      {
        section: "rootFileFolders.script",
        folder: "scripts",
        name: "x.ts",
        manifestPaths: [["a"], ["a"]],
        diskPaths: [["a"]],
      },
    ]);
  });

  it("T101-11: two animation frames deriving one image name are reported as a duplicate, not as drift", () => {
    const png = { fileType: "image/png" };
    const anims = (name: string): Record<string, unknown> => ({
      items: [{ name, frames: [png] }],
      subfolders: [],
    });
    const objectTypes = [
      { name: "A-B", animations: anims("C") },
      { name: "A", animations: anims("B-C") },
    ];
    const present = makeTempImageProject(objectTypes, ["a-b-c-000.png"]);
    tempRoots.push(present);
    expect(detectImageDrift(present)?.entries).to.deep.equal([]);
    expect(detectManifestDrift(present, manifestOf(empty())).duplicates).to.deep.equal([
      { section: "images", folder: "images", name: "a-b-c-000.png", manifestPaths: [[], []], diskPaths: [[]] },
    ]);

    const absent = makeTempImageProject(objectTypes, []);
    tempRoots.push(absent);
    expect(detectImageDrift(absent)?.entries).to.deep.equal([
      { kind: "missing", name: "a-b-c-000.png", manifestPath: [] },
    ]);
  });

  it("T101-12: a project with no repeated names has no duplicates key", () => {
    const dir = project(["layouts/a/X.json", "layouts/b/Y.json"]);
    const drift = detectManifestDrift(dir, manifestOf(nameFolder([], [a(["X"]), b(["Y"])])));
    expect(drift.inSync).to.equal(true);
    expect("duplicates" in drift).to.equal(false);
  });

  it("T101-13: a name repeated only on disk is reported in duplicates", () => {
    const dir = project(["layouts/a/X.json", "layouts/b/X.json"]);
    const drift = detectManifestDrift(dir, manifestOf(nameFolder([], [a(["X"]), b([])])));
    expect(drift.duplicates).to.deep.equal([
      { section: "layouts", folder: "layouts", name: "X", manifestPaths: [["a"]], diskPaths: [["a"], ["b"]] },
    ]);
  });

  it("T101-2: a name declared at one path but on disk at two reports the extra one untracked", () => {
    expect(layoutsEntries(["layouts/a/X.json", "layouts/b/X.json"], nameFolder([], [a(["X"]), b([])]))).to.deep.equal([
      { kind: "untracked", name: "X", diskPath: ["b"] },
    ]);
    expect(layoutsEntries(["layouts/a/X.json", "layouts/b/X.json"], nameFolder([], [a([]), b(["X"])]))).to.deep.equal([
      { kind: "untracked", name: "X", diskPath: ["a"] },
    ]);
  });

  it("T101-3: a name declared at two paths but on disk at one reports the absent one missing", () => {
    expect(layoutsEntries(["layouts/a/X.json", "layouts/b/"], nameFolder([], [a(["X"]), b(["X"])]))).to.deep.equal([
      { kind: "missing", name: "X", manifestPath: ["b"] },
    ]);
    expect(layoutsEntries(["layouts/b/X.json", "layouts/a/"], nameFolder([], [a(["X"]), b(["X"])]))).to.deep.equal([
      { kind: "missing", name: "X", manifestPath: ["a"] },
    ]);
  });

  it("T101-4: a name at two paths on one side only reports both paths", () => {
    expect(layoutsEntries(["layouts/a/", "layouts/b/"], nameFolder([], [a(["X"]), b(["X"])]))).to.deep.equal([
      { kind: "missing", name: "X", manifestPath: ["a"] },
      { kind: "missing", name: "X", manifestPath: ["b"] },
    ]);
    expect(layoutsEntries(["layouts/a/X.json", "layouts/b/X.json"], nameFolder([], [a([]), b([])]))).to.deep.equal([
      { kind: "untracked", name: "X", diskPath: ["a"] },
      { kind: "untracked", name: "X", diskPath: ["b"] },
    ]);
  });

  it("T101-5: the result does not depend on the order the manifest declares its subfolders", () => {
    const onDisk = ["layouts/a/", "layouts/b/"];
    const forward = layoutsEntries(onDisk, nameFolder([], [a(["X"]), b(["X"])]));
    const reversed = layoutsEntries(onDisk, nameFolder([], [b(["X"]), a(["X"])]));
    expect(forward).to.have.length(2);
    expect(reversed).to.deep.equal(forward);
  });

  it("T101-7: a script declared at one path but on disk at two reports the extra one untracked", () => {
    const scripts = fileFolder([], [fileFolder(["x.ts"], [], "a"), fileFolder([], [], "b")]);
    const dir = project(["scripts/a/x.ts", "scripts/b/x.ts"]);
    const { entries, drift } = sectionEntries(dir, manifestOf(empty(), scripts), "rootFileFolders.script");
    expect(entries).to.deep.equal([{ kind: "untracked", name: "x.ts", diskPath: ["b"] }]);
    expect(drift).to.not.have.property("duplicates");
  });

  it("T101-8: the same script name in two folders, declared and on disk, is in sync", () => {
    const scripts = fileFolder([], [fileFolder(["x.ts"], [], "a"), fileFolder(["x.ts"], [], "b")]);
    const dir = project(["scripts/a/x.ts", "scripts/b/x.ts"]);
    const drift = detectManifestDrift(dir, manifestOf(empty(), scripts));
    expect(drift.sections).to.deep.equal([]);
    expect(drift.inSync).to.equal(true);
    expect(drift).to.not.have.property("duplicates");
  });

  it("T101-10: a unique name relocated to another folder is still moved", () => {
    expect(layoutsEntries(["layouts/b/X.json", "layouts/a/"], nameFolder([], [a(["X"]), b([])]))).to.deep.equal([
      { kind: "moved", name: "X", manifestPath: ["a"], diskPath: ["b"] },
    ]);
  });
});
