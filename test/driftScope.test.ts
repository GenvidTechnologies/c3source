import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectManifestDrift, openProject, type C3ProjectManifest, type ManifestDrift } from "../src/c3source.js";

// Scoped drift detection (#119): `skipFileSections` drops the seven rootFileFolders.<cat> sections.
// The trees are built under a mkdtemp root of this file, so the junctions never point at real data.
// A "junction" link needs no privilege on Windows; elsewhere the type is ignored.

const tmpRoots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "c3source-scope-"));
  tmpRoots.push(root);
  return root;
}

function put(root: string, rel: string, text = "x"): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function junction(root: string, target: string, link: string): void {
  mkdirSync(path.join(root, target), { recursive: true });
  symlinkSync(path.join(root, target), path.join(root, link), "junction");
}

const emptyFolder = () => ({ items: [] as any[], subfolders: [] as any[] });

function entry(name: string, sid: number): any {
  return { name, type: "text/plain", sid };
}

/** A caller manifest with every name section and file category empty. */
function baseManifest(): C3ProjectManifest {
  return {
    projectFormatVersion: 1,
    savedWithRelease: 1,
    name: "scope",
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
      script: emptyFolder(),
      sound: emptyFolder(),
      music: emptyFolder(),
      video: emptyFolder(),
      font: emptyFolder(),
      icon: emptyFolder(),
      general: emptyFolder(),
    },
    properties: {},
  } as C3ProjectManifest;
}

/** The "rich tree": name-section and file-section drift, a stray, duplicates, links and a container. */
function richTree(): { root: string; manifest: C3ProjectManifest } {
  const root = makeRoot();
  put(root, "layouts/Main.json", "{}");
  put(root, "layouts/notes.txt");
  junction(root, "layouts", "layouts/loop");
  put(root, "scripts/a.js");
  put(root, "files/x.txt");
  junction(root, "sounds", "sounds/loop");
  const manifest = baseManifest();
  manifest.rootFileFolders.general.items = [entry("x.txt", 1), entry("x.txt", 2)];
  manifest.containers = [{ members: ["Ghost"] }];
  return { root, manifest };
}

const isFile = (section: string) => section.startsWith("rootFileFolders.");

/** The no-option result minus every `rootFileFolders.*` entry, with emptied keys dropped. */
function withoutFileSections(full: ManifestDrift): ManifestDrift {
  const sections = full.sections.filter((s) => !isFile(s.section));
  const out: ManifestDrift = { sections, inSync: sections.length === 0 };
  if (full.degraded) out.degraded = full.degraded;
  if (full.strays) out.strays = full.strays;
  const duplicates = (full.duplicates ?? []).filter((d) => !isFile(d.section));
  if (duplicates.length) out.duplicates = duplicates;
  const links = (full.links ?? []).filter((l) => !isFile(l.section));
  if (links.length) out.links = links;
  return out;
}

function thrown(fn: () => unknown): any {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe("detectManifestDrift options (#119)", () => {
  afterEach(() => {
    for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("#119 S1 skipFileSections removes every rootFileFolders entry from sections, duplicates and links", () => {
    const { root, manifest } = richTree();
    const full = detectManifestDrift(root, manifest);
    expect(full.sections.some((s) => isFile(s.section))).to.equal(true);
    expect((full.duplicates ?? []).some((d) => isFile(d.section))).to.equal(true);
    expect((full.links ?? []).some((l) => isFile(l.section))).to.equal(true);
    const skipped = detectManifestDrift(root, manifest, { skipFileSections: true });
    expect(skipped.sections.some((s) => isFile(s.section))).to.equal(false);
    expect((skipped.duplicates ?? []).some((d) => isFile(d.section))).to.equal(false);
    expect((skipped.links ?? []).some((l) => isFile(l.section))).to.equal(false);
  });

  it("#119 S2 the skip changes only the file sections: strays, containers and layouts entries survive", () => {
    const { root, manifest } = richTree();
    const full = detectManifestDrift(root, manifest);
    const skipped = detectManifestDrift(root, manifest, { skipFileSections: true });
    expect(skipped).to.deep.equal(withoutFileSections(full));
    expect(skipped.sections.some((s) => s.section === "layouts")).to.equal(true);
    expect(skipped.sections.some((s) => s.section === "containers")).to.equal(true);
    expect(skipped.strays).to.be.an("array").that.is.not.empty;
    expect((skipped.links ?? []).some((l) => l.section === "layouts")).to.equal(true);
    expect(skipped.degraded).to.equal(undefined);
  });

  it("#119 S3 the skip equals a call with a copy of the manifest stripped of rootFileFolders", () => {
    const { root, manifest } = richTree();
    const before = structuredClone(manifest);
    const stripped: Record<string, unknown> = { ...structuredClone(manifest) };
    delete stripped.rootFileFolders;
    const skipped = detectManifestDrift(root, manifest, { skipFileSections: true });
    expect(skipped).to.deep.equal(detectManifestDrift(root, stripped as unknown as C3ProjectManifest));
    expect(manifest).to.deep.equal(before);
    expect(manifest.rootFileFolders).to.not.equal(undefined);
  });

  it("#119 S4 a regular file named scripts throws ENOTDIR only when the file sections are walked", () => {
    const root = makeRoot();
    put(root, "scripts", "not a directory");
    const manifest = baseManifest();
    expect(thrown(() => detectManifestDrift(root, manifest))?.code).to.equal("ENOTDIR");
    expect(thrown(() => detectManifestDrift(root, manifest, { skipFileSections: true }))).to.equal(undefined);
  });

  it("#119 S5 the skipped manifest walk does not run: a null item raises TypeError only without the option", () => {
    const root = makeRoot();
    const manifest = baseManifest();
    manifest.rootFileFolders.general = { items: [null as any], subfolders: [] };
    expect(thrown(() => detectManifestDrift(root, manifest))).to.be.instanceOf(TypeError);
    expect(thrown(() => detectManifestDrift(root, manifest, { skipFileSections: true }))).to.equal(undefined);
  });

  it("#119 S6 undefined, {} and skipFileSections false equal the no-option call, in the same key order", () => {
    const { root, manifest } = richTree();
    const base = detectManifestDrift(root, manifest);
    for (const options of [undefined, {}, { skipFileSections: false }]) {
      const got = detectManifestDrift(root, manifest, options);
      expect(got).to.deep.equal(base);
      expect(Object.keys(got)).to.deep.equal(Object.keys(base));
    }
  });

  it("#119 S7 rootFileFolders absent is not walked and {} is walked; the skip drops both", () => {
    const root = makeRoot();
    put(root, "scripts/a.js");
    const absent: Record<string, unknown> = { ...baseManifest() };
    delete absent.rootFileFolders;
    const absentManifest = absent as unknown as C3ProjectManifest;
    const plain = detectManifestDrift(root, absentManifest);
    expect(plain.sections.some((s) => isFile(s.section))).to.equal(false);
    expect(detectManifestDrift(root, absentManifest, { skipFileSections: true })).to.deep.equal(plain);

    const empty = { ...baseManifest(), rootFileFolders: {} } as unknown as C3ProjectManifest;
    const walked = detectManifestDrift(root, empty);
    const script = walked.sections.find((s) => s.section === "rootFileFolders.script");
    expect(script?.entries.map((e) => e.kind)).to.deep.equal(["untracked"]);
    const skipped = detectManifestDrift(root, empty, { skipFileSections: true });
    expect(skipped.sections.some((s) => isFile(s.section))).to.equal(false);
  });

  it("#119 H1 the C3Project handle forwards the option to the free function", () => {
    const root = makeRoot();
    put(root, "scripts", "not a directory");
    put(root, "project.c3proj", JSON.stringify(baseManifest()));
    expect(thrown(() => openProject(root).detectManifestDrift())?.code).to.equal("ENOTDIR");
    expect(openProject(root).detectManifestDrift({ skipFileSections: true })).to.deep.equal(
      detectManifestDrift(root, undefined, { skipFileSections: true }),
    );
  });
});
