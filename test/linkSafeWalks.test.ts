import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  C3_ROOT_FILE_FOLDERS,
  C3_SECTION_FOLDERS,
  detectImageDrift,
  detectManifestDrift,
  detectReferenceIntegrity,
  detectStrayFiles,
  find_all_files_path,
  find_all_section_items_path,
  openProject,
  walkDiskFileTree,
  walkDiskNameTree,
} from "../src/c3source.js";
import { fixtureProjectPath } from "./fixtureHelpers.js";

// Link-safe disk walks (#114). Every link below targets an absolute path inside a mkdtemp tree
// created by this file, so cleanup can never reach real data. On Windows a "junction" link needs
// no privilege; elsewhere the type is ignored and a plain symlink is created.

const tmpRoots: string[] = [];

/** Create a fresh temp root, remembered for cleanup. */
function makeRoot(): string {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "c3source-links-"));
  tmpRoots.push(root);
  return root;
}

/** Remove every temp root. `rmSync` removes a link without following it, and every link target is inside a root. */
function cleanRoots(): void {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** A directory link (junction on Windows) at `link` pointing at the absolute directory `target`. */
function dirLink(target: string, link: string): void {
  symlinkSync(path.resolve(target), link, "junction");
}

/** Seed a loop: `link` is a directory link to its own ancestor `ancestor`. */
function seedLoop(ancestor: string, link: string): void {
  dirLink(ancestor, link);
}

/** Seed a dangling link: `link` points at a directory that is created and then removed. */
function seedDangling(scratch: string, link: string): void {
  const gone = path.join(scratch, "gone");
  mkdirSync(gone, { recursive: true });
  dirLink(gone, link);
  rmSync(gone, { recursive: true, force: true });
}

/** Seed an outside directory link: `link` points at a directory holding one JSON file, outside the project. */
function seedOutsideDir(outsideDir: string, link: string): void {
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(path.join(outsideDir, "Outside.json"), "{}");
  dirLink(outsideDir, link);
}

/** Seed an outside file symlink: `link` points at a file outside the project. */
function seedOutsideFile(outsideFile: string, link: string): void {
  mkdirSync(path.dirname(outsideFile), { recursive: true });
  writeFileSync(outsideFile, "{}");
  symlinkSync(path.resolve(outsideFile), link, "file");
}

/** True when `child` is inside `parent` (both already real paths). */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Write a manifest with empty sections, plus `overrides`, into `dir`. */
function writeManifest(dir: string, overrides: Record<string, unknown> = {}): void {
  const empty = { items: [], subfolders: [] };
  const manifest = {
    name: "LinkProject",
    runtime: "c3runtime",
    projectFormatVersion: 1,
    savedWithRelease: 1,
    objectTypes: empty,
    layouts: empty,
    eventSheets: empty,
    timelines: empty,
    flowcharts: empty,
    families: empty,
    models3d: empty,
    containers: [],
    ...overrides,
  };
  writeFileSync(path.join(dir, "project.c3proj"), JSON.stringify(manifest));
}

const LINK_KINDS = ["loop", "dangling"] as const;
const LINK_PLACES = ["at root", "below root"] as const;

/** The advisory `links` records, read through a local type so this file does not depend on the new export. */
interface LinkRecord {
  section: string;
  folder: string;
  name: string;
  diskPath: string[];
}

function linksOf(result: unknown): LinkRecord[] | undefined {
  return (result as { links?: LinkRecord[] }).links;
}

/** All seven rootFileFolders categories, each empty. */
function emptyFileFolders(): Record<string, unknown> {
  return Object.fromEntries(Object.keys(C3_ROOT_FILE_FOLDERS).map((cat) => [cat, { items: [], subfolders: [] }]));
}

/** A fresh temp root holding a project dir and its manifest (`overrides` as in {@link writeManifest}). */
function newProject(overrides: Record<string, unknown> = {}): { root: string; project: string } {
  const root = makeRoot();
  const project = path.join(root, "project");
  mkdirSync(project, { recursive: true });
  writeManifest(project, overrides);
  return { root, project };
}

/**
 * Seed one loop or dangling link directly in `folder` ("at root") or in its `sub` subfolder ("below root"),
 * and assert the positive control: it is a link and carries the hazard.
 */
function seedLinkCase(
  project: string,
  root: string,
  folder: string,
  kind: (typeof LINK_KINDS)[number],
  where: (typeof LINK_PLACES)[number],
): string {
  const dir = where === "at root" ? path.join(project, folder) : path.join(project, folder, "sub");
  mkdirSync(dir, { recursive: true });
  const link = path.join(dir, "Lnk");
  if (kind === "loop") seedLoop(project, link);
  else seedDangling(path.join(root, "scratch"), link);
  expect(lstatSync(link).isSymbolicLink()).to.equal(true);
  if (kind === "loop") expect(realpathSync(link)).to.equal(realpathSync(project));
  else expect(() => statSync(link)).to.throw().with.property("code", "ENOENT");
  return link;
}

describe("#114 link-safe disk walks", function () {
  before(cleanRoots);
  after(cleanRoots);

  describe("seed helpers", function () {
    it("#114 control loop: junction to an ancestor resolves to it", function () {
      const root = makeRoot();
      const ancestor = path.join(root, "project");
      mkdirSync(path.join(ancestor, "layouts"), { recursive: true });
      const link = path.join(ancestor, "layouts", "loop");
      seedLoop(ancestor, link);

      expect(lstatSync(link).isSymbolicLink()).to.equal(true);
      expect(realpathSync(link)).to.equal(realpathSync(ancestor));
    });

    it("#114 control dangling: link target is gone so stat throws ENOENT", function () {
      const root = makeRoot();
      const dir = path.join(root, "project", "layouts");
      mkdirSync(dir, { recursive: true });
      const link = path.join(dir, "dangling");
      seedDangling(path.join(root, "scratch"), link);

      expect(lstatSync(link).isSymbolicLink()).to.equal(true);
      expect(() => statSync(link)).to.throw().with.property("code", "ENOENT");
    });

    it("#114 control outside dir: directory link resolves outside the project", function () {
      const root = makeRoot();
      const project = path.join(root, "project");
      mkdirSync(path.join(project, "layouts"), { recursive: true });
      const link = path.join(project, "layouts", "outside");
      seedOutsideDir(path.join(root, "elsewhere"), link);

      expect(lstatSync(link).isSymbolicLink()).to.equal(true);
      expect(isInside(realpathSync(project), realpathSync(link))).to.equal(false);
      expect(realpathSync(link)).to.equal(realpathSync(path.join(root, "elsewhere")));
    });

    it("#114 control outside file: file symlink resolves outside the project", function () {
      const root = makeRoot();
      const project = path.join(root, "project");
      mkdirSync(path.join(project, "layouts"), { recursive: true });
      const link = path.join(project, "layouts", "Outside.json");
      seedOutsideFile(path.join(root, "elsewhere", "Target.json"), link);

      expect(lstatSync(link).isSymbolicLink()).to.equal(true);
      expect(isInside(realpathSync(project), realpathSync(link))).to.equal(false);
      expect(realpathSync(link)).to.equal(realpathSync(path.join(root, "elsewhere", "Target.json")));
    });
  });

  describe("survival: behaviour that holds before and after the fix", function () {
    it("#114 R4 canonical fixture drift result has no links key", function () {
      const drift = detectManifestDrift(fixtureProjectPath());
      expect(Object.prototype.hasOwnProperty.call(drift, "links")).to.equal(false);
    });

    it("#114 R4 link-free tmp project drift result has no links key", function () {
      const project = path.join(makeRoot(), "project");
      mkdirSync(path.join(project, "layouts"), { recursive: true });
      writeFileSync(path.join(project, "layouts", "Main.json"), "{}");
      writeManifest(project, { layouts: { items: ["Main"], subfolders: [] } });

      const drift = detectManifestDrift(project);
      expect(drift.inSync).to.equal(true);
      expect(Object.prototype.hasOwnProperty.call(drift, "links")).to.equal(false);
    });

    it("#114 R6 a section root that is a regular file still throws ENOTDIR", function () {
      const project = path.join(makeRoot(), "project");
      mkdirSync(project, { recursive: true });
      writeFileSync(path.join(project, "eventSheets"), "not a directory");
      writeManifest(project, { eventSheets: { items: ["Sheet"], subfolders: [] } });

      expect(() => detectManifestDrift(project)).to.throw().with.property("code", "ENOTDIR");
    });

    it("#114 D3 a section root that is a junction is followed with no links entry", function () {
      const root = makeRoot();
      const project = path.join(root, "project");
      const realLayouts = path.join(root, "realLayouts");
      mkdirSync(project, { recursive: true });
      mkdirSync(realLayouts, { recursive: true });
      writeFileSync(path.join(realLayouts, "Main.json"), "{}");
      const link = path.join(project, "layouts");
      dirLink(realLayouts, link);
      writeManifest(project, { layouts: { items: ["Main"], subfolders: [] } });

      expect(lstatSync(link).isSymbolicLink()).to.equal(true);
      const drift = detectManifestDrift(project);
      expect(JSON.stringify(drift.sections)).to.not.contain("missing");
      expect(drift.inSync).to.equal(true);
      expect(Object.prototype.hasOwnProperty.call(drift, "links")).to.equal(false);
    });

    it("#114 D3 a project dir that is a junction gives the same result as the real path", function () {
      const root = makeRoot();
      const project = path.join(root, "project");
      mkdirSync(path.join(project, "layouts"), { recursive: true });
      writeFileSync(path.join(project, "layouts", "Main.json"), "{}");
      writeManifest(project, { layouts: { items: ["Main"], subfolders: [] } });
      const link = path.join(root, "projectLink");
      dirLink(project, link);

      expect(lstatSync(link).isSymbolicLink()).to.equal(true);
      const viaLink = detectManifestDrift(link);
      const viaReal = detectManifestDrift(project);
      expect(viaLink).to.deep.equal(viaReal);
      expect(viaLink.inSync).to.equal(true);
      expect(Object.prototype.hasOwnProperty.call(viaLink, "links")).to.equal(false);
    });
  });

  describe("expected behaviour after the fix", function () {
    describe("R1: a link below a walk root never makes drift throw", function () {
      for (const [section, folder] of Object.entries(C3_SECTION_FOLDERS)) {
        for (const kind of LINK_KINDS) {
          for (const where of LINK_PLACES) {
            it(`#114 R1 name ${folder}: ${kind} ${where}`, function () {
              const { root, project } = newProject();
              seedLinkCase(project, root, folder, kind, where);
              expect(() => detectManifestDrift(project), section).to.not.throw();
            });
          }
        }
      }

      for (const [cat, folder] of Object.entries(C3_ROOT_FILE_FOLDERS)) {
        for (const kind of LINK_KINDS) {
          for (const where of LINK_PLACES) {
            it(`#114 R1 file ${folder}: ${kind} ${where}`, function () {
              const { root, project } = newProject({ rootFileFolders: emptyFileFolders() });
              seedLinkCase(project, root, folder, kind, where);
              expect(() => detectManifestDrift(project), cat).to.not.throw();
            });
          }
        }
      }

      it("#114 R1 file no rootFileFolders: a loop under a file folder is not walked", function () {
        const { root, project } = newProject();
        seedLinkCase(project, root, "scripts", "loop", "below root");
        expect(() => detectManifestDrift(project)).to.not.throw();
      });
    });

    describe("R2: detectStrayFiles called directly", function () {
      it("#114 R2 a loop under a name section does not throw", function () {
        const { root, project } = newProject();
        seedLinkCase(project, root, "layouts", "loop", "below root");
        expect(() => detectStrayFiles(project)).to.not.throw();
      });

      it("#114 R2 a dangling link under a name section does not throw", function () {
        const { root, project } = newProject();
        seedLinkCase(project, root, "layouts", "dangling", "at root");
        expect(() => detectStrayFiles(project)).to.not.throw();
      });
    });

    describe("R3: a link to something outside the project is not followed", function () {
      const OUTSIDE_NAMES = ["Outside", "Target", "Linked"];

      function expectNoOutsideNames(project: string): void {
        const drift = detectManifestDrift(project);
        const seen = JSON.stringify({
          sections: drift.sections,
          strays: drift.strays,
          duplicates: drift.duplicates,
        });
        for (const name of OUTSIDE_NAMES) expect(seen, name).to.not.contain(name);
      }

      for (const [label, folder, rff] of [
        ["name section", "layouts", false],
        ["file section", "scripts", true],
      ] as const) {
        it(`#114 R3 outside directory link under a ${label}`, function () {
          const { root, project } = newProject(rff ? { rootFileFolders: emptyFileFolders() } : {});
          mkdirSync(path.join(project, folder), { recursive: true });
          const link = path.join(project, folder, "Linked");
          seedOutsideDir(path.join(root, "elsewhere"), link);
          expect(lstatSync(link).isSymbolicLink()).to.equal(true);
          expect(isInside(realpathSync(project), realpathSync(link))).to.equal(false);
          expectNoOutsideNames(project);
        });

        it(`#114 R3 outside file symlink under a ${label}`, function () {
          const { root, project } = newProject(rff ? { rootFileFolders: emptyFileFolders() } : {});
          mkdirSync(path.join(project, folder), { recursive: true });
          const link = path.join(project, folder, "Linked.json");
          seedOutsideFile(path.join(root, "elsewhere", "Target.json"), link);
          expect(lstatSync(link).isSymbolicLink()).to.equal(true);
          expect(isInside(realpathSync(project), realpathSync(link))).to.equal(false);
          expectNoOutsideNames(project);
        });
      }
    });

    describe("R5: items and strays partition the regular files", function () {
      /** A project with regular files, editor-local files, a loop, a dangling link and an inside file symlink. */
      function seedPartitionTree(): string {
        const { root, project } = newProject();
        const layouts = path.join(project, "layouts");
        mkdirSync(path.join(layouts, "sub"), { recursive: true });
        mkdirSync(path.join(project, "eventSheets"), { recursive: true });
        writeFileSync(path.join(layouts, "Main.json"), "{}");
        writeFileSync(path.join(layouts, "Main.uistate.json"), "{}");
        writeFileSync(path.join(layouts, "Notes.txt"), "notes");
        writeFileSync(path.join(layouts, "sub", "Deep.json"), "{}");
        writeFileSync(path.join(layouts, "sub", "deep.dsl.txt"), "dsl");
        writeFileSync(path.join(project, "eventSheets", "Sheet.json"), "{}");

        const loop = path.join(layouts, "sub", "loop");
        seedLoop(project, loop);
        const dangling = path.join(layouts, "dang");
        seedDangling(path.join(root, "scratch"), dangling);
        const alias = path.join(layouts, "Alias.json");
        symlinkSync(path.join(layouts, "Main.json"), alias, "file");

        for (const link of [loop, dangling, alias]) expect(lstatSync(link).isSymbolicLink()).to.equal(true);
        expect(realpathSync(loop)).to.equal(realpathSync(project));
        expect(() => statSync(dangling)).to.throw().with.property("code", "ENOENT");
        expect(statSync(alias).isFile()).to.equal(true);
        return project;
      }

      /** Independent oracle: regular, non-editor-local files found with `lstat`, never following a link. */
      function regularFiles(dir: string, rel: string[]): string[] {
        const out: string[] = [];
        for (const entry of readdirSync(dir).sort()) {
          const full = path.join(dir, entry);
          const st = lstatSync(full);
          if (st.isSymbolicLink()) continue;
          if (st.isDirectory()) {
            if (entry === "uistate" || entry === "ts-defs") continue;
            out.push(...regularFiles(full, [...rel, entry]));
          } else if (st.isFile() && !entry.endsWith(".uistate.json")) {
            out.push([...rel, entry].join("/"));
          }
        }
        return out;
      }

      it("#114 R5 items and strays are disjoint and together are the regular non-editor-local files", function () {
        const project = seedPartitionTree();
        const expected: string[] = [];
        const items: string[] = [];
        for (const folder of ["layouts", "eventSheets"]) {
          expected.push(...regularFiles(path.join(project, folder), [folder]));
          for (const abs of find_all_section_items_path(path.join(project, folder))) {
            items.push(path.relative(project, abs).split(path.sep).join("/"));
          }
        }
        const strays = detectStrayFiles(project)
          .filter((s) => s.folder === "layouts" || s.folder === "eventSheets")
          .map((s) => [s.folder, ...s.diskPath, s.name].join("/"));

        const union = [...items, ...strays];
        expect(new Set(union).size, "disjoint").to.equal(union.length);
        expect(union.sort()).to.deep.equal(expected.sort());
      });

      it("#114 R5 walkDiskNameTree names equal the find_all_section_items_path stems", function () {
        const project = seedPartitionTree();
        const layouts = path.join(project, "layouts");
        const walked = walkDiskNameTree(layouts)
          .map((e) => e.name)
          .sort();
        const found = find_all_section_items_path(layouts)
          .map((f) => path.basename(f, ".json"))
          .sort();
        expect(walked).to.deep.equal(found);
        expect(walked).to.deep.equal(["Deep", "Main"]);
      });
    });

    describe("D1: images/", function () {
      function seedImagesDangling(): string {
        const { root, project } = newProject();
        mkdirSync(path.join(project, "images"), { recursive: true });
        writeFileSync(path.join(project, "images", "real.png"), "png");
        const link = path.join(project, "images", "dangling.png");
        seedDangling(path.join(root, "scratch"), link);
        expect(lstatSync(link).isSymbolicLink()).to.equal(true);
        expect(() => statSync(link)).to.throw().with.property("code", "ENOENT");
        return project;
      }

      it("#114 D1 detectImageDrift does not throw on a dangling link", function () {
        const project = seedImagesDangling();
        expect(() => detectImageDrift(project)).to.not.throw();
      });

      it("#114 D1 detectManifestDrift reports no degraded entry for a dangling link", function () {
        const project = seedImagesDangling();
        const drift = detectManifestDrift(project);
        expect(Object.prototype.hasOwnProperty.call(drift, "degraded")).to.equal(false);
      });
    });

    describe("D2: file symlinks inside the project", function () {
      it("#114 D2 an inside file symlink is not an item and not a stray, and is listed in links", function () {
        const { project } = newProject({ layouts: { items: ["Main"], subfolders: [] } });
        const layouts = path.join(project, "layouts");
        mkdirSync(layouts, { recursive: true });
        writeFileSync(path.join(layouts, "Main.json"), "{}");
        const alias = path.join(layouts, "Alias.json");
        symlinkSync(path.join(layouts, "Main.json"), alias, "file");
        expect(lstatSync(alias).isSymbolicLink()).to.equal(true);
        expect(statSync(alias).isFile()).to.equal(true);

        expect(find_all_section_items_path(layouts).map((f) => path.basename(f))).to.deep.equal(["Main.json"]);
        expect(detectStrayFiles(project).map((s) => s.name)).to.not.contain("Alias.json");
        const drift = detectManifestDrift(project);
        expect(JSON.stringify(drift.sections)).to.not.contain("Alias");
        expect(linksOf(drift)).to.deep.equal([
          { section: "layouts", folder: "layouts", name: "Alias.json", diskPath: [] },
        ]);
      });
    });

    describe("D4: the links field", function () {
      it("#114 D4 links lists each skipped link in walk order across name, file and images sections", function () {
        const { root, project } = newProject({ rootFileFolders: emptyFileFolders() });
        // Seeded in reverse of the expected order so the result order cannot come from creation order.
        mkdirSync(path.join(project, "images"), { recursive: true });
        const imageLink = path.join(project, "images", "dangImage");
        seedDangling(path.join(root, "scratchImages"), imageLink);
        mkdirSync(path.join(project, "scripts"), { recursive: true });
        const scriptLink = path.join(project, "scripts", "dangScript");
        seedDangling(path.join(root, "scratchScripts"), scriptLink);
        mkdirSync(path.join(project, "layouts", "sub"), { recursive: true });
        const layoutLink = path.join(project, "layouts", "sub", "loopLayout");
        seedLoop(project, layoutLink);
        for (const link of [imageLink, scriptLink, layoutLink]) {
          expect(lstatSync(link).isSymbolicLink()).to.equal(true);
        }

        const drift = detectManifestDrift(project);
        expect(linksOf(drift)).to.deep.equal([
          { section: "layouts", folder: "layouts", name: "loopLayout", diskPath: ["sub"] },
          { section: "rootFileFolders.script", folder: "scripts", name: "dangScript", diskPath: [] },
          { section: "images", folder: "images", name: "dangImage", diskPath: [] },
        ]);
      });

      it("#114 D4 a project whose only finding is a link is in sync", function () {
        const { root, project } = newProject({ layouts: { items: ["Main"], subfolders: [] } });
        const layouts = path.join(project, "layouts");
        mkdirSync(layouts, { recursive: true });
        writeFileSync(path.join(layouts, "Main.json"), "{}");
        const link = path.join(layouts, "Linked");
        seedOutsideDir(path.join(root, "elsewhere"), link);
        expect(lstatSync(link).isSymbolicLink()).to.equal(true);

        const drift = detectManifestDrift(project);
        expect(drift.inSync).to.equal(true);
        expect(linksOf(drift)?.length).to.equal(1);
      });
    });

    describe("D5: direct callers never follow or return link contents", function () {
      const GHOST_LAYOUT = JSON.stringify({
        name: "OutsideLayout",
        layers: [],
        "nonworld-instances": [{ type: "GhostType" }],
      });
      const LEAKED = ["Outside", "Target", "LinkedDir", "LinkedFile", "GhostType"];

      /** A project whose layouts/ holds a real layout, a directory link and a file symlink, both to outside files. */
      function seedOutsideLinks(): string {
        const { root, project } = newProject();
        const layouts = path.join(project, "layouts");
        mkdirSync(layouts, { recursive: true });
        writeFileSync(path.join(layouts, "Main.json"), JSON.stringify({ name: "Main", layers: [] }));
        const dirLinkPath = path.join(layouts, "LinkedDir");
        seedOutsideDir(path.join(root, "elsewhere"), dirLinkPath);
        writeFileSync(path.join(root, "elsewhere", "Outside.json"), GHOST_LAYOUT);
        const fileLinkPath = path.join(layouts, "LinkedFile.json");
        seedOutsideFile(path.join(root, "other", "Target.json"), fileLinkPath);
        writeFileSync(path.join(root, "other", "Target.json"), GHOST_LAYOUT);
        for (const link of [dirLinkPath, fileLinkPath]) {
          expect(lstatSync(link).isSymbolicLink()).to.equal(true);
          expect(isInside(realpathSync(project), realpathSync(link))).to.equal(false);
        }
        return project;
      }

      function expectNoLeak(result: unknown): void {
        const seen = JSON.stringify(result);
        for (const name of LEAKED) expect(seen, name).to.not.contain(name);
      }

      it("#114 D5 find_all_files_path", function () {
        const project = seedOutsideLinks();
        expectNoLeak(find_all_files_path(path.join(project, "layouts"), () => true));
      });

      it("#114 D5 find_all_section_items_path", function () {
        const project = seedOutsideLinks();
        expectNoLeak(find_all_section_items_path(path.join(project, "layouts")));
      });

      it("#114 D5 walkDiskNameTree", function () {
        const project = seedOutsideLinks();
        expectNoLeak(walkDiskNameTree(path.join(project, "layouts")));
      });

      it("#114 D5 walkDiskFileTree default", function () {
        const project = seedOutsideLinks();
        expectNoLeak(walkDiskFileTree(path.join(project, "layouts"), []));
      });

      it("#114 D5 walkDiskFileTree walkUndeclared", function () {
        const project = seedOutsideLinks();
        expectNoLeak(walkDiskFileTree(path.join(project, "layouts"), [], [], { walkUndeclared: true }));
      });

      it("#114 D5 openProject findAllLayouts", function () {
        const project = seedOutsideLinks();
        expectNoLeak(openProject(project).findAllLayouts());
      });

      it("#114 D5 detectReferenceIntegrity", function () {
        const project = seedOutsideLinks();
        expectNoLeak(detectReferenceIntegrity(project));
      });
    });
  });
});
