import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  detectImageDrift,
  detectManifestDrift,
  diffNameMaps,
  writeC3JsonFile,
  type C3FileFolder,
  type C3NameFolder,
  type DriftEntry,
  type DuplicateOccurrence,
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

  /** An expected duplicate occurrence; the folder defaults to the section name. */
  const occ = (section: string, name: string, p: string[], folder: string = section): DuplicateOccurrence => ({
    section,
    folder,
    name,
    path: p,
  });

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
      {
        scope: "layouts",
        key: "x",
        manifest: [occ("layouts", "X", ["a"]), occ("layouts", "X", ["b"])],
        disk: [occ("layouts", "X", ["a"]), occ("layouts", "X", ["b"])],
      },
    ]);
  });

  it("T101-6: the same layout name twice in one manifest folder is reported as a duplicate", () => {
    const dir = project(["layouts/a/X.json"]);
    const drift = detectManifestDrift(dir, manifestOf(nameFolder([], [a(["X", "X"])])));
    expect(drift.inSync).to.equal(true);
    expect(drift.duplicates).to.deep.equal([
      {
        scope: "layouts",
        key: "x",
        manifest: [occ("layouts", "X", ["a"]), occ("layouts", "X", ["a"])],
        disk: [occ("layouts", "X", ["a"])],
      },
    ]);
  });

  it("T101-9: the same script name twice in one folder is reported as a duplicate", () => {
    const scripts = fileFolder([], [fileFolder(["x.ts", "x.ts"], [], "a")]);
    const dir = project(["scripts/a/x.ts"]);
    const drift = detectManifestDrift(dir, manifestOf(empty(), scripts));
    expect(drift.duplicates).to.deep.equal([
      {
        scope: "rootFileFolders.script",
        key: "x.ts",
        manifest: [
          occ("rootFileFolders.script", "x.ts", ["a"], "scripts"),
          occ("rootFileFolders.script", "x.ts", ["a"], "scripts"),
        ],
        disk: [occ("rootFileFolders.script", "x.ts", ["a"], "scripts")],
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
      {
        scope: "images",
        key: "a-b-c-000.png",
        manifest: [occ("images", "a-b-c-000.png", []), occ("images", "a-b-c-000.png", [])],
        disk: [occ("images", "a-b-c-000.png", [])],
      },
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
      {
        scope: "layouts",
        key: "x",
        manifest: [occ("layouts", "X", ["a"])],
        disk: [occ("layouts", "X", ["a"]), occ("layouts", "X", ["b"])],
      },
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

describe("duplicate names follow the editor's per-section lookups (#125)", () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  type NameSection = "layouts" | "eventSheets" | "objectTypes" | "timelines" | "flowcharts" | "families" | "models3d";

  const nameFolder = (items: string[], subfolders: C3NameFolder[] = [], name?: string): C3NameFolder =>
    (name === undefined ? { items, subfolders } : { name, items, subfolders }) as C3NameFolder;

  const fileFolder = (names: string[], subfolders: C3FileFolder[] = [], name?: string): C3FileFolder =>
    ({
      ...(name === undefined ? {} : { name }),
      items: names.map((n, i) => ({ name: n, type: "text/javascript", sid: i + 1 })),
      subfolders,
    }) as C3FileFolder;

  /** A named folder holding `items`. */
  const f = (name: string, items: string[]): C3NameFolder => nameFolder(items, [], name);

  /** A section root with the given named folders below it. */
  const root = (...folders: C3NameFolder[]): C3NameFolder => nameFolder([], folders);

  /** A manifest with the given name sections and scripts folder; everything else empty. */
  const manifestWith = (parts: Partial<Record<NameSection, C3NameFolder>>, scripts: C3FileFolder = fileFolder([])) =>
    ({
      name: "t125",
      runtime: "c3",
      projectFormatVersion: 1,
      savedWithRelease: 1,
      objectTypes: parts.objectTypes ?? nameFolder([]),
      layouts: parts.layouts ?? nameFolder([]),
      eventSheets: parts.eventSheets ?? nameFolder([]),
      timelines: parts.timelines ?? nameFolder([]),
      flowcharts: parts.flowcharts ?? nameFolder([]),
      families: parts.families ?? nameFolder([]),
      models3d: parts.models3d ?? nameFolder([]),
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

  /** Build a tmpdir project holding the given files (rel paths). */
  function project(onDisk: string[]): string {
    const dir = makeTempProject({});
    tempRoots.push(dir);
    for (const rel of onDisk) {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeC3JsonFile(full, {});
    }
    return dir;
  }

  const occ = (section: string, name: string, p: string[], folder: string = section): DuplicateOccurrence => ({
    section,
    folder,
    name,
    path: p,
  });

  const dupsOf = (onDisk: string[], parts: Partial<Record<NameSection, C3NameFolder>>) =>
    detectManifestDrift(project(onDisk), manifestWith(parts)).duplicates;

  it("#125 D1: layouts A and a in different folders are one duplicate", () => {
    const dir = project(["layouts/a/A.json", "layouts/b/a.json"]);
    const drift = detectManifestDrift(dir, manifestWith({ layouts: root(f("a", ["A"]), f("b", ["a"])) }));
    expect(drift.inSync).to.equal(true);
    expect(drift.sections).to.deep.equal([]);
    expect(drift.duplicates).to.deep.equal([
      {
        scope: "layouts",
        key: "a",
        manifest: [occ("layouts", "A", ["a"]), occ("layouts", "a", ["b"])],
        disk: [occ("layouts", "A", ["a"]), occ("layouts", "a", ["b"])],
      },
    ]);
  });

  it("#125 D2: an object type and a family differing in case are one objectClasses duplicate", () => {
    const duplicates = dupsOf(["objectTypes/a/Player.json", "families/a/player.json"], {
      objectTypes: root(f("a", ["Player"])),
      families: root(f("a", ["player"])),
    });
    const both = [occ("objectTypes", "Player", ["a"]), occ("families", "player", ["a"])];
    expect(duplicates).to.deep.equal([{ scope: "objectClasses", key: "player", manifest: both, disk: both }]);
  });

  it("#125 D2b: an object type and a family with the same name are one objectClasses duplicate", () => {
    const duplicates = dupsOf(["objectTypes/a/Enemy.json", "families/a/Enemy.json"], {
      objectTypes: root(f("a", ["Enemy"])),
      families: root(f("a", ["Enemy"])),
    });
    const both = [occ("objectTypes", "Enemy", ["a"]), occ("families", "Enemy", ["a"])];
    expect(duplicates).to.deep.equal([{ scope: "objectClasses", key: "enemy", manifest: both, disk: both }]);
  });

  for (const [id, section] of [
    ["D3t", "timelines"],
    ["D3f", "flowcharts"],
    ["D3m", "models3d"],
  ] as const) {
    it(`#125 ${id}: ${section} compare exactly, so A and a are not a duplicate`, () => {
      const differ = dupsOf([`${section}/a/A.json`, `${section}/b/a.json`], {
        [section]: root(f("a", ["A"]), f("b", ["a"])),
      });
      expect(differ).to.equal(undefined);
      // control: the same name in two folders is still reported, so the scope is live
      const both = [occ(section, "A", ["a"]), occ(section, "A", ["b"])];
      const same = dupsOf([`${section}/a/A.json`, `${section}/b/A.json`], {
        [section]: root(f("a", ["A"]), f("b", ["A"])),
      });
      expect(same).to.deep.equal([{ scope: section, key: "A", manifest: both, disk: both }]);
    });
  }

  it("#125 D4: script names compare exactly within a folder", () => {
    const scripts = (names: string[]): C3FileFolder => fileFolder([], [fileFolder(names, [], "a")]);
    const differ = detectManifestDrift(project(["scripts/a/x.ts"]), manifestWith({}, scripts(["x.ts", "X.ts"])));
    expect(differ.duplicates).to.equal(undefined);
    const same = detectManifestDrift(project(["scripts/a/x.ts"]), manifestWith({}, scripts(["x.ts", "x.ts"])));
    expect(same.duplicates).to.have.length(1);
    expect(same.duplicates?.[0].scope).to.equal("rootFileFolders.script");
    expect(same.duplicates?.[0].key).to.equal("x.ts");
  });

  it("#125 D5: event sheets Main and main are one duplicate", () => {
    const duplicates = dupsOf([], { eventSheets: root(f("a", ["Main"]), f("b", ["main"])) });
    expect(duplicates).to.have.length(1);
    expect(duplicates?.[0].scope).to.equal("eventSheets");
    expect(duplicates?.[0].key).to.equal("main");
    expect(duplicates?.[0].manifest).to.deep.equal([
      occ("eventSheets", "Main", ["a"]),
      occ("eventSheets", "main", ["b"]),
    ]);
  });

  it("#125 D6: a precomposed layout name and its decomposed form are one duplicate", () => {
    // Built with fromCharCode so no raw non-ASCII character or escape lands in the source.
    const precomposed = "Caf" + String.fromCharCode(0xe9);
    const decomposed = "Cafe" + String.fromCharCode(0x301);
    expect(precomposed).to.not.equal(decomposed);
    // The disk side holds one file only (file systems may normalise names); the manifest repeats the key.
    const duplicates = dupsOf(["layouts/a/" + precomposed + ".json"], {
      layouts: root(f("a", [precomposed]), f("b", [decomposed])),
    });
    expect(duplicates).to.have.length(1);
    expect(duplicates?.[0].scope).to.equal("layouts");
    expect(duplicates?.[0].key).to.equal(precomposed.normalize().toLowerCase());
    expect(duplicates?.[0].manifest).to.deep.equal([
      occ("layouts", precomposed, ["a"]),
      occ("layouts", decomposed, ["b"]),
    ]);
  });

  it("#125 D7: drift matching stays exact, so A and a are missing and untracked", () => {
    expect(diffNameMaps([{ name: "A", path: [] }], [{ name: "a", path: [] }])).to.deep.equal([
      { kind: "missing", name: "A", manifestPath: [] },
      { kind: "untracked", name: "a", diskPath: [] },
    ]);
    const drift = detectManifestDrift(project(["layouts/a.json"]), manifestWith({ layouts: nameFolder(["A"]) }));
    const entries = drift.sections.find((s) => s.section === "layouts")?.entries;
    expect(entries).to.have.deep.members([
      { kind: "missing", name: "A", manifestPath: [] },
      { kind: "untracked", name: "a", diskPath: [] },
    ]);
    expect(entries).to.have.length(2);
    expect(drift.duplicates).to.equal(undefined);
  });

  it("#125 D8: each name section reports an exact repeat in its own scope", () => {
    const sections: NameSection[] = [
      "layouts",
      "eventSheets",
      "objectTypes",
      "timelines",
      "flowcharts",
      "families",
      "models3d",
    ];
    const parts: Partial<Record<NameSection, C3NameFolder>> = {};
    const files: string[] = [];
    for (const s of sections) {
      parts[s] = root(f("a", ["X"]), f("b", ["X"]));
      files.push(`${s}/a/X.json`, `${s}/b/X.json`);
    }
    const duplicates = dupsOf(files, parts) ?? [];
    expect(duplicates.map((d) => d.scope)).to.deep.equal([
      "layouts",
      "eventSheets",
      "objectClasses",
      "timelines",
      "flowcharts",
      "models3d",
    ]);
    const pair = (s: string): DuplicateOccurrence[] => [occ(s, "X", ["a"]), occ(s, "X", ["b"])];
    const expected = new Map<string, { key: string; sections: string[] }>([
      ["layouts", { key: "x", sections: ["layouts"] }],
      ["eventSheets", { key: "x", sections: ["eventSheets"] }],
      ["objectClasses", { key: "x", sections: ["objectTypes", "families"] }],
      ["timelines", { key: "X", sections: ["timelines"] }],
      ["flowcharts", { key: "X", sections: ["flowcharts"] }],
      ["models3d", { key: "X", sections: ["models3d"] }],
    ]);
    for (const d of duplicates) {
      const want = expected.get(d.scope);
      const occurrences = want?.sections.flatMap(pair);
      expect(d, d.scope).to.deep.equal({ scope: d.scope, key: want?.key, manifest: occurrences, disk: occurrences });
    }
  });

  it("#125 D9: duplicates are ordered by scope, then by key", () => {
    const duplicates = dupsOf([], {
      layouts: root(f("a", ["zed", "apple"]), f("b", ["zed", "apple"])),
      families: root(f("a", ["F"]), f("b", ["F"])),
      timelines: root(f("a", ["T"]), f("b", ["T"])),
    });
    expect(duplicates?.map((d) => `${d.scope}:${d.key}`)).to.deep.equal([
      "layouts:apple",
      "layouts:zed",
      "objectClasses:f",
      "timelines:T",
    ]);
    const scripts = fileFolder([], [fileFolder(["x.ts", "x.ts"], [], "a")]);
    const parts = { layouts: root(f("a", ["L"]), f("b", ["L"])), timelines: root(f("a", ["T"]), f("b", ["T"])) };
    const withScript = detectManifestDrift(project([]), manifestWith(parts, scripts)).duplicates;
    expect(withScript?.map((d) => d.scope)).to.deep.equal(["layouts", "timelines", "rootFileFolders.script"]);
  });

  it("#125 D10: a user object type named System alone is not a duplicate", () => {
    const alone = dupsOf(["objectTypes/a/System.json"], { objectTypes: root(f("a", ["System"])) });
    expect(alone).to.equal(undefined);
    const both = [occ("objectTypes", "System", ["a"]), occ("families", "system", ["a"])];
    const paired = dupsOf(["objectTypes/a/System.json", "families/a/system.json"], {
      objectTypes: root(f("a", ["System"])),
      families: root(f("a", ["system"])),
    });
    expect(paired).to.deep.equal([{ scope: "objectClasses", key: "system", manifest: both, disk: both }]);
  });

  it("#125 D11: a case-only repeat on disk alone is a duplicate", () => {
    const duplicates = dupsOf(["layouts/a/A.json", "layouts/b/a.json"], { layouts: root(f("a", ["A"]), f("b", [])) });
    expect(duplicates).to.deep.equal([
      {
        scope: "layouts",
        key: "a",
        manifest: [occ("layouts", "A", ["a"])],
        disk: [occ("layouts", "A", ["a"]), occ("layouts", "a", ["b"])],
      },
    ]);
  });
});
