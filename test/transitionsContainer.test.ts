import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  detectManifestDrift,
  resolveManifestFolders,
  walkManifestNameTree,
  writeC3JsonFile,
  type C3NameFolder,
  type DriftEntry,
} from "../src/c3source.js";
import { makeTempProject } from "./fixtureHelpers.js";

/** A name folder; `name` omitted makes it a nameless one. */
function folder(items: string[], subfolders: C3NameFolder[] = [], name?: string): C3NameFolder {
  return (name === undefined ? { items, subfolders } : { name, items, subfolders }) as C3NameFolder;
}

describe("resolveManifestFolders (manifest path -> declaring folders)", () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("RS-1: [] resolves the root then its transparent nameless folders, with origins", () => {
    const transparent = folder(["b"]);
    const nested = folder(["c"]);
    const named = folder(["d"], [], "Named");
    const root = folder(["a"], [transparent, named, nested]);
    const got = resolveManifestFolders(root, [], "layouts");
    expect(got.map((r) => r.origin)).to.deep.equal(["root", "transparent", "transparent"]);
    expect(got[0].folder).to.equal(root);
    expect(got[0].parent).to.equal(null);
    expect(got[1].folder).to.equal(transparent);
    expect(got[1].parent).to.equal(root);
    expect(got[2].folder).to.equal(nested);
  });

  it("RS-2: timelines [transitions] with a named folder and the container returns both, in manifest order", () => {
    const named = folder(["n"], [], "transitions");
    const container = folder(["c"]);
    const forward = resolveManifestFolders(folder([], [named, container]), ["transitions"], "timelines");
    expect(forward.map((r) => r.origin)).to.deep.equal(["named", "transitions-container"]);
    expect(forward.map((r) => r.folder)).to.deep.equal([named, container]);
    const reversed = resolveManifestFolders(folder([], [container, named]), ["transitions"], "timelines");
    expect(reversed.map((r) => r.origin)).to.deep.equal(["transitions-container", "named"]);
  });

  it("RS-3: timelines [transitions, Other] resolves one named folder whose parent is the container", () => {
    const other = folder(["o"], [], "Other");
    const container = folder(["c"], [other]);
    const named = folder([], [], "transitions");
    const got = resolveManifestFolders(folder([], [named, container]), ["transitions", "Other"], "timelines");
    expect(got).to.have.length(1);
    expect(got[0].origin).to.equal("named");
    expect(got[0].folder).to.equal(other);
    expect(got[0].parent).to.equal(container);
  });

  it("RS-4: a nameless direct child of layouts is transparent and [transitions] resolves nothing", () => {
    const child = folder(["x"]);
    const root = folder(["a"], [child]);
    expect(resolveManifestFolders(root, ["transitions"], "layouts")).to.deep.equal([]);
    const atRoot = resolveManifestFolders(root, [], "layouts");
    expect(atRoot.map((r) => r.origin)).to.deep.equal(["root", "transparent"]);
    // The same tree under timelines makes that child the container.
    const asTimelines = resolveManifestFolders(root, ["transitions"], "timelines");
    expect(asTimelines.map((r) => r.origin)).to.deep.equal(["transitions-container"]);
  });

  it("RS-5: every detected drift entry and every manifest item resolves to its declaring folder", () => {
    const manifest = {
      name: "rs5",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 1,
      objectTypes: { items: [], subfolders: [] },
      layouts: { items: ["L1"], subfolders: [{ items: ["L2"], subfolders: [] }] },
      eventSheets: { items: [], subfolders: [] },
      timelines: {
        items: ["tl-root", "tl-gone", "tl-moved"],
        subfolders: [
          { name: "Named", items: ["tl-named"], subfolders: [] },
          { name: "Absent", items: [], subfolders: [] },
          { items: ["ease1"], subfolders: [] },
        ],
      },
      flowcharts: { items: [], subfolders: [] },
      families: { items: [], subfolders: [] },
      models3d: { items: [], subfolders: [] },
      containers: [],
    };
    const dir = makeTempProject(manifest);
    tempRoots.push(dir);
    const put = (rel: string): void => {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeC3JsonFile(full, {});
    };
    put("layouts/L1.json");
    put("layouts/L2.json");
    put("timelines/tl-root.json");
    put("timelines/Named/tl-named.json");
    put("timelines/Named/tl-moved.json"); // declared at the root: moved
    put("timelines/tl-new.json"); // undeclared: untracked
    put("timelines/transitions/ease1.json"); // non-empty container directory
    // tl-gone: declared, no file -> missing; Absent: declared, no directory -> folder-missing

    const drift = detectManifestDrift(dir);
    const timelines = drift.sections.find((s) => s.section === "timelines");
    expect(timelines, "timelines section drifts").to.not.equal(undefined);
    const entries: DriftEntry[] = timelines!.entries;
    expect(entries.map((e) => e.kind).sort()).to.deep.equal(["folder-missing", "missing", "moved", "untracked"]);

    for (const section of drift.sections) {
      const sectionFolder = manifest[section.section as keyof typeof manifest] as C3NameFolder;
      for (const e of section.entries) {
        if (e.kind === "untracked") continue; // no declaring folder
        const resolved = resolveManifestFolders(sectionFolder, e.manifestPath ?? [], section.section);
        if (e.kind === "folder-missing") {
          expect(
            resolved.some((r) => r.origin === "named"),
            `${e.kind} ${e.name}`,
          ).to.equal(true);
        } else {
          // an item entry's manifestPath is its parent folder's path
          expect(
            resolved.some((r) => (r.folder.items as string[]).includes(e.name)),
            `${e.kind} ${e.name}`,
          ).to.equal(true);
        }
      }
    }

    for (const sectionName of ["layouts", "timelines"] as const) {
      const sectionFolder = manifest[sectionName] as C3NameFolder;
      const unnamed = sectionName === "timelines" ? "transitions" : undefined;
      for (const item of walkManifestNameTree(sectionFolder, [], unnamed)) {
        const resolved = resolveManifestFolders(sectionFolder, item.path, sectionName);
        expect(
          resolved.some((r) => (r.folder.items as string[]).includes(item.name)),
          `${sectionName}/${item.name}`,
        ).to.equal(true);
      }
    }
  });

  it("RS-6: a path no folder declares resolves to []", () => {
    const root = folder(["a"], [folder([], [], "Named")]);
    expect(resolveManifestFolders(root, ["Nope"], "layouts")).to.deep.equal([]);
    expect(resolveManifestFolders(root, ["Named", "Deeper"], "timelines")).to.deep.equal([]);
  });
});

describe("timelines transitions container drift (#97)", () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const empty = (): C3NameFolder => folder([]);

  /** Build a tmpdir project with the given timelines/layouts folders and on-disk files/dirs (rel paths; a trailing `/` is a directory). */
  function project(timelines: C3NameFolder, onDisk: string[], layouts: C3NameFolder = empty()): string {
    const dir = makeTempProject({
      name: "t97",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 1,
      objectTypes: empty(),
      layouts,
      eventSheets: empty(),
      timelines,
      flowcharts: empty(),
      families: empty(),
      models3d: empty(),
      containers: [],
    });
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

  const drift = (dir: string, manifest: C3NameFolder, layouts: C3NameFolder = empty()) =>
    detectManifestDrift(dir, {
      name: "t97",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 1,
      objectTypes: empty(),
      layouts,
      eventSheets: empty(),
      timelines: manifest,
      flowcharts: empty(),
      families: empty(),
      models3d: empty(),
      containers: [],
    } as never);

  const gcore = (): C3NameFolder => folder(["Timeline"], [folder([])]);

  it("T97-1: an empty container with no transitions directory is in sync", () => {
    const tl = gcore();
    const d = drift(project(tl, ["timelines/Timeline.json"]), tl);
    expect(d.sections).to.deep.equal([]);
  });

  it("T97-2: a container with no timelines directory at all reports no timelines section", () => {
    const tl = folder([], [folder([])]);
    const d = drift(project(tl, []), tl);
    expect(d.sections.find((s) => s.section === "timelines")).to.equal(undefined);
  });

  it("T97-3: a container listing Ease1 with no file reports only the missing item", () => {
    const tl = folder([], [folder(["Ease1"])]);
    const d = drift(project(tl, []), tl);
    expect(d.sections.find((s) => s.section === "timelines")!.entries).to.deep.equal([
      { kind: "missing", name: "Ease1", manifestPath: ["transitions"] },
    ]);
  });

  it("T97-4: a named folder under the container with no directories reports folder-missing for it only", () => {
    const tl = folder([], [folder([], [folder([], [], "Other")])]);
    const d = drift(project(tl, []), tl);
    expect(d.sections.find((s) => s.section === "timelines")!.entries).to.deep.equal([
      { kind: "folder-missing", name: "Other", manifestPath: ["transitions", "Other"] },
    ]);
  });

  it("T97-5: the gcore fragment plus an empty transitions directory is in sync", () => {
    const tl = gcore();
    const d = drift(project(tl, ["timelines/Timeline.json", "timelines/transitions/"]), tl);
    expect(d.inSync).to.equal(true);
  });

  it("T97-6: with no container, transitions on disk is untracked", () => {
    const tl = folder([]);
    const withFile = drift(project(tl, ["timelines/transitions/E.json"]), tl);
    expect(withFile.sections.find((s) => s.section === "timelines")!.entries).to.deep.equal([
      { kind: "untracked", name: "E", diskPath: ["transitions"] },
      { kind: "folder-untracked", name: "transitions", diskPath: ["transitions"] },
    ]);
    const emptyDir = drift(project(tl, ["timelines/transitions/"]), tl);
    expect(emptyDir.sections.find((s) => s.section === "timelines")!.entries).to.deep.equal([
      { kind: "folder-untracked", name: "transitions", diskPath: ["transitions"] },
    ]);
  });

  it("T97-7: a nameless subfolder under layouts is transparent and never drifts", () => {
    const tl = folder([]);
    const emptyChild = folder([], [folder([])]);
    expect(drift(project(tl, [], emptyChild), tl, emptyChild).inSync).to.equal(true);
    const holding = folder([], [folder(["L"])]);
    expect(drift(project(tl, ["layouts/L.json"], holding), tl, holding).inSync).to.equal(true);
  });

  it("T97-8: a user-named transitions folder with no directory is still folder-missing", () => {
    const tl = folder([], [folder([], [], "transitions")]);
    const d = drift(project(tl, []), tl);
    expect(d.sections.find((s) => s.section === "timelines")!.entries).to.deep.equal([
      { kind: "folder-missing", name: "transitions", manifestPath: ["transitions"] },
    ]);
  });

  it("T97-9: a named transitions folder plus the container reports exactly one folder-missing", () => {
    const tl = folder([], [folder([], [], "transitions"), folder([])]);
    const d = drift(project(tl, []), tl);
    expect(d.sections.find((s) => s.section === "timelines")!.entries).to.deep.equal([
      { kind: "folder-missing", name: "transitions", manifestPath: ["transitions"] },
    ]);
  });

  it("T97-10: two nameless direct children of timelines are in sync", () => {
    const tl = folder([], [folder([]), folder([])]);
    expect(drift(project(tl, []), tl).inSync).to.equal(true);
  });
});
