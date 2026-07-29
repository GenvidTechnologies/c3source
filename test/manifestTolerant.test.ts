import { describe, it, before } from "mocha";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  parseProjectManifestTolerant,
  serializeProjectManifest,
  getUsedAddons,
  type C3ProjectManifest,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";
import path from "node:path";

const FIXTURE_DIR = fixtureProjectPath();
const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");

describe("parseProjectManifestTolerant / readProjectManifestTolerant (#58)", () => {
  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  it("T2: returns the exact same object reference passed in, and reproduces the original bytes on serialize", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    const parsedRaw = JSON.parse(raw);
    const result = parseProjectManifestTolerant(parsedRaw);
    expect(result.manifest).to.equal(parsedRaw); // reference equality, NOT deep.equal — pins byte-fidelity
    expect(result.issues).to.deep.equal([]);
    expect(serializeProjectManifest(result.manifest)).to.equal(raw);
  });

  it("T10: a missing savedWithRelease is tolerated — reports the rule, does not throw, other fields intact", () => {
    const base = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    const bad = JSON.parse(JSON.stringify(base));
    delete bad.savedWithRelease;

    let result: { manifest: C3ProjectManifest; issues: { rule: string }[] } | undefined;
    expect(() => {
      result = parseProjectManifestTolerant(bad);
    }).to.not.throw();

    expect(result!.manifest).to.equal(bad);
    expect(result!.issues.map((i) => i.rule)).to.include("saved-with-release-number");
    expect(result!.manifest.name).to.equal(base.name);
    expect(result!.manifest.layouts.items).to.deep.equal(base.layouts.items);
    expect(getUsedAddons(result!.manifest)).to.deep.equal(base.usedAddons ?? []);
  });

  it("T10: a missing usedAddons[0].author is tolerated — reports the rule, does not throw, getUsedAddons still works", () => {
    const base = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    expect(Array.isArray(base.usedAddons) && base.usedAddons.length).to.be.greaterThan(0);
    const bad = JSON.parse(JSON.stringify(base));
    delete bad.usedAddons[0].author;

    let result: { manifest: C3ProjectManifest; issues: { rule: string }[] } | undefined;
    expect(() => {
      result = parseProjectManifestTolerant(bad);
    }).to.not.throw();

    expect(result!.manifest).to.equal(bad);
    expect(result!.issues.map((i) => i.rule)).to.include("used-addon-author");
    expect(result!.manifest.savedWithRelease).to.equal(base.savedWithRelease);
    expect(result!.manifest.name).to.equal(base.name);
    const addons = getUsedAddons(result!.manifest);
    expect(addons.length).to.equal(base.usedAddons.length);
    expect(addons[0].id).to.equal(base.usedAddons[0].id);
    expect(addons[0].author).to.equal(undefined);
  });
});

describe("parseProjectManifestTolerant — the one documented throw (#58)", () => {
  it("T11: a non-object top-level value throws 'top-level value must be an object' (needs no fixture)", () => {
    expect(() => parseProjectManifestTolerant(42)).to.throw(/invalid project\.c3proj: top-level value must be an object/);
    expect(() => parseProjectManifestTolerant(null)).to.throw(
      /invalid project\.c3proj: top-level value must be an object/,
    );
    expect(() => parseProjectManifestTolerant([])).to.throw(
      /invalid project\.c3proj: top-level value must be an object/,
    );
  });
});
