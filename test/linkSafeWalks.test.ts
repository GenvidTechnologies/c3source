import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectManifestDrift } from "../src/c3source.js";
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
});
