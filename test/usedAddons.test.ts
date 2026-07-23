import { describe, it, before } from "mocha";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseProjectManifest,
  readProjectManifest,
  getUsedAddons,
  type C3ProjectManifest,
  type C3UsedAddon,
} from "../src/c3source.js";
import { fixtureProjectPath } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixtureProjectPath();
const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");

describe("usedAddons / getUsedAddons", () => {
  let m: C3ProjectManifest;

  before(() => {
    m = readProjectManifest(MANIFEST_PATH);
  });

  it("returns all 7 declared addons from the fixture, with the NinePatch entry bundled", () => {
    const addons = getUsedAddons(m);
    expect(addons.length).to.equal(7);
    const ninePatch = addons.find((a) => a.id === "NinePatch");
    expect(ninePatch).to.not.be.undefined;
    expect(ninePatch!.bundled).to.equal(true);
  });

  it("typechecks a synthetic addon with the optional version field set", () => {
    const addon = {
      type: "plugin",
      id: "Custom",
      name: "Custom addon",
      author: "Someone",
      bundled: true,
      version: "1.2.3",
    } satisfies C3UsedAddon;
    expect(addon.version).to.equal("1.2.3");
  });

  it("returns [] when usedAddons is absent", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    delete clone.usedAddons;
    expect(getUsedAddons(clone)).to.deep.equal([]);
  });

  it("throws with the invalid project.c3proj prefix on a malformed usedAddons entry (missing id)", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    delete bad.usedAddons[0].id;
    expect(() => parseProjectManifest(bad)).to.throw(/invalid project\.c3proj: usedAddons\[0\]\.id must be a string/);
  });

  it("throws with the invalid project.c3proj prefix on a malformed usedAddons entry (bundled not boolean)", () => {
    const bad = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    bad.usedAddons[0].bundled = "yes";
    expect(() => parseProjectManifest(bad)).to.throw(
      /invalid project\.c3proj: usedAddons\[0\]\.bundled must be a boolean/,
    );
  });
});
