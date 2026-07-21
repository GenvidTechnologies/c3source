import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAddonPackage, stripBom } from "../src/c3source.js";
import { fixtureExists, fixturePath, sdkFixtureExists, sdkPath, zipDirToC3addon } from "./fixtureHelpers.js";

const ADDON_SAMPLE_DIR = fixturePath("addon-sample");

describe("stripBom", () => {
  it("drops a single leading BOM character", () => {
    expect(stripBom("﻿{}")).to.equal("{}");
  });

  it("leaves BOM-less text unchanged", () => {
    expect(stripBom("{}")).to.equal("{}");
  });
});

describe("readAddonPackage (directory mode, test/fixtures/addon-sample)", () => {
  it("detects kind:'directory'", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const pkg = readAddonPackage(ADDON_SAMPLE_DIR);
    expect(pkg.kind).to.equal("directory");
  });

  it("readJson('addon.json') parses the manifest with the expected id", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const pkg = readAddonPackage(ADDON_SAMPLE_DIR);
    const manifest = pkg.readJson("addon.json") as { id: string };
    expect(manifest.id).to.equal("TestCompany_SamplePlugin");
  });

  it("hasEntry/entryNames see both addon.json and aces.json", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const pkg = readAddonPackage(ADDON_SAMPLE_DIR);
    expect(pkg.hasEntry("aces.json")).to.equal(true);
    const names = pkg.entryNames();
    expect(names).to.include("addon.json");
    expect(names).to.include("aces.json");
  });

  it("readText strips the BOM known to be present on aces.json", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const pkg = readAddonPackage(ADDON_SAMPLE_DIR);
    const text = pkg.readText("aces.json");
    expect(text.charAt(0)).to.not.equal("﻿");
  });

  it("readJson('aces.json') parses without throwing despite the BOM", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const pkg = readAddonPackage(ADDON_SAMPLE_DIR);
    expect(() => pkg.readJson("aces.json")).to.not.throw();
  });
});

describe("readAddonPackage (zip mode, synthesized from addon-sample)", () => {
  let tmpDir: string;
  let zipPath: string;

  before(function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-addon-reader-"));
    zipPath = path.join(tmpDir, "sample.c3addon");
    zipDirToC3addon(ADDON_SAMPLE_DIR, zipPath);
  });

  after(function () {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects kind:'zip'", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const pkg = readAddonPackage(zipPath);
    expect(pkg.kind).to.equal("zip");
  });

  it("matches directory-mode readJson/entryNames/hasEntry", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const dirPkg = readAddonPackage(ADDON_SAMPLE_DIR);
    const zipPkg = readAddonPackage(zipPath);
    expect(zipPkg.readJson("addon.json")).to.deep.equal(dirPkg.readJson("addon.json"));
    expect(zipPkg.readJson("aces.json")).to.deep.equal(dirPkg.readJson("aces.json"));
    expect(zipPkg.entryNames().sort()).to.deep.equal(dirPkg.entryNames().sort());
    expect(zipPkg.hasEntry("addon.json")).to.equal(dirPkg.hasEntry("addon.json"));
  });
});

describe("readAddonPackage errors", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-addon-reader-err-"));
  });

  after(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws for a nonexistent source", () => {
    expect(() => readAddonPackage(path.join(tmpDir, "does-not-exist"))).to.throw();
  });

  it("readJson throws with an 'invalid <name>:' prefix on malformed JSON", () => {
    writeFileSync(path.join(tmpDir, "bad.json"), "{ not valid json");
    const pkg = readAddonPackage(tmpDir);
    expect(() => pkg.readJson("bad.json")).to.throw(/^invalid bad\.json:/);
  });
});

describe("readAddonPackage (SDK-gated, plugin-sdk/customImporterPlugin)", () => {
  const SDK_SAMPLE = "plugin-sdk/customImporterPlugin";
  let tmpDir: string;
  let zipPath: string;

  before(function () {
    if (!sdkFixtureExists(`${SDK_SAMPLE}/aces.json`)) return this.skip();
    tmpDir = mkdtempSync(path.join(tmpdir(), "c3source-addon-reader-sdk-"));
    zipPath = path.join(tmpDir, "customImporterPlugin.c3addon");
    zipDirToC3addon(sdkPath(SDK_SAMPLE), zipPath);
  });

  after(function () {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("readJson('addon.json') parses the manifest with the expected id (directory mode)", function () {
    if (!sdkFixtureExists(`${SDK_SAMPLE}/aces.json`)) return this.skip();
    const pkg = readAddonPackage(sdkPath(SDK_SAMPLE));
    const manifest = pkg.readJson("addon.json") as { id: string };
    expect(manifest.id).to.equal("MyCompany_CustomImporter");
  });

  it("readText('aces.json') is BOM-stripped", function () {
    if (!sdkFixtureExists(`${SDK_SAMPLE}/aces.json`)) return this.skip();
    const pkg = readAddonPackage(sdkPath(SDK_SAMPLE));
    expect(pkg.readText("aces.json").charAt(0)).to.not.equal("﻿");
  });

  it("zip mode matches directory mode (parity)", function () {
    if (!sdkFixtureExists(`${SDK_SAMPLE}/aces.json`)) return this.skip();
    const dirPkg = readAddonPackage(sdkPath(SDK_SAMPLE));
    const zipPkg = readAddonPackage(zipPath);
    expect(zipPkg.kind).to.equal("zip");
    expect(zipPkg.readJson("addon.json")).to.deep.equal(dirPkg.readJson("addon.json"));
    expect(zipPkg.readJson("aces.json")).to.deep.equal(dirPkg.readJson("aces.json"));
  });
});
