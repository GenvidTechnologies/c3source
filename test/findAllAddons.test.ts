import { describe, it, before } from "mocha";
import { expect } from "chai";
import { findAllAddons, openProject, type C3Project } from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixtureProjectPath();
const ADDONS_DIR = fixtureProjectPath("addons");

describe("findAllAddons (free function)", () => {
  it("finds both a flat and a nested .c3addon file, proving recursion", function () {
    if (!fixtureProjectExists("addons")) return this.skip();
    const found = findAllAddons(ADDONS_DIR).map((p) => p.replace(/\\/g, "/"));
    expect(found.some((p) => p.endsWith("addons/SomeAddon.c3addon"))).to.equal(true);
    expect(found.some((p) => p.endsWith("addons/nested/OtherAddon.c3addon"))).to.equal(true);
  });

  it("excludes non-.c3addon files", function () {
    if (!fixtureProjectExists("addons")) return this.skip();
    const found = findAllAddons(ADDONS_DIR);
    expect(found.every((p) => p.endsWith(".c3addon"))).to.equal(true);
  });
});

describe("C3Project#findAllAddons", () => {
  let proj: C3Project;

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
  });

  it("finds both the flat and nested .c3addon files under the addons/ subdirectory", function () {
    if (!fixtureProjectExists("addons")) return this.skip();
    const found = proj.findAllAddons("addons").map((p) => p.replace(/\\/g, "/"));
    expect(found.some((p) => p.endsWith("addons/SomeAddon.c3addon"))).to.equal(true);
    expect(found.some((p) => p.endsWith("addons/nested/OtherAddon.c3addon"))).to.equal(true);
  });

  it("returns [] for a missing subdirectory (graceful-empty)", function () {
    if (!fixtureProjectExists()) return this.skip();
    expect(proj.findAllAddons("no-such-subdir")).to.deep.equal([]);
  });
});
