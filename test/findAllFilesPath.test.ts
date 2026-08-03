import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { find_all_files_path, isEditorLocalPath, C3_TS_DEFS_FOLDER } from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

describe("find_all_files_path (generic predicate-driven walker)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const rel = (paths: string[]) => paths.map((p) => path.relative(root, p).replace(/\\/g, "/"));

  it("collects arbitrary-extension files by predicate, not bound to source filenames", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    writeFileSync(path.join(root, "Level1.dsl.txt"), "dsl");
    writeFileSync(path.join(root, "Level1.json"), "{}");
    writeFileSync(path.join(root, "notes.txt"), "ignored");

    const found = rel(find_all_files_path(root, (name) => name.endsWith(".dsl.txt")));
    expect(found).to.deep.equal(["Level1.dsl.txt"]);
  });

  it("recurses into real subfolders", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "sub", "deeper"), { recursive: true });
    writeFileSync(path.join(root, "Top.dsl.txt"), "dsl");
    writeFileSync(path.join(root, "sub", "Mid.dsl.txt"), "dsl");
    writeFileSync(path.join(root, "sub", "deeper", "Deep.dsl.txt"), "dsl");

    const found = rel(find_all_files_path(root, (name) => name.endsWith(".dsl.txt"))).sort();
    expect(found).to.deep.equal(["Top.dsl.txt", "sub/Mid.dsl.txt", "sub/deeper/Deep.dsl.txt"]);
  });

  it("skips uistate/ subfolders so it cannot drift from the named collectors", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "uistate"), { recursive: true });
    writeFileSync(path.join(root, "Real.dsl.txt"), "dsl");
    writeFileSync(path.join(root, "uistate", "Editor.dsl.txt"), "dsl");

    const found = rel(find_all_files_path(root, (name) => name.endsWith(".dsl.txt")));
    expect(found).to.deep.equal(["Real.dsl.txt"]);
  });

  it("returns a deterministic, per-level sorted order", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "b"), { recursive: true });
    writeFileSync(path.join(root, "b", "2.txt"), "x");
    writeFileSync(path.join(root, "b", "1.txt"), "x");
    writeFileSync(path.join(root, "a.txt"), "x");
    writeFileSync(path.join(root, "c.txt"), "x");

    const found = rel(find_all_files_path(root, () => true));
    expect(found).to.deep.equal(["a.txt", "b/1.txt", "b/2.txt", "c.txt"]);
  });

  it("R-D1: default descent unchanged — still prunes ts-defs/ when descend is omitted", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "ts-defs"), { recursive: true });
    writeFileSync(path.join(root, "Real.txt"), "real");
    writeFileSync(path.join(root, "ts-defs", "x.d.ts"), "declare const x: number;");

    const found = rel(find_all_files_path(root, () => true));
    expect(found).to.deep.equal(["Real.txt"]);
  });

  it("R-D2: an explicit descend reaches inside ts-defs/", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "ts-defs"), { recursive: true });
    writeFileSync(path.join(root, "Real.txt"), "real");
    writeFileSync(path.join(root, "ts-defs", "x.d.ts"), "declare const x: number;");

    const found = rel(
      find_all_files_path(
        root,
        () => true,
        () => true,
      ),
    ).sort();
    expect(found).to.deep.equal(["Real.txt", "ts-defs/x.d.ts"]);
  });

  it("R-D3: descend is applied recursively at every level, not just the top", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "a", "ts-defs", "b"), { recursive: true });
    writeFileSync(path.join(root, "a", "ts-defs", "b", "deep.d.ts"), "declare const deep: number;");

    const found = rel(
      find_all_files_path(
        root,
        () => true,
        () => true,
      ),
    );
    expect(found).to.deep.equal(["a/ts-defs/b/deep.d.ts"]);
  });

  it("R-D4: overriding for ts-defs does not implicitly unprune uistate/", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, "ts-defs"), { recursive: true });
    mkdirSync(path.join(root, "uistate"), { recursive: true });
    writeFileSync(path.join(root, "ts-defs", "x.d.ts"), "declare const x: number;");
    writeFileSync(path.join(root, "uistate", "Editor.json"), "{}");

    const found = rel(
      find_all_files_path(
        root,
        () => true,
        (d) => d === C3_TS_DEFS_FOLDER || !isEditorLocalPath(d),
      ),
    );
    expect(found).to.deep.equal(["ts-defs/x.d.ts"]);
  });

  it("R-D7: the ts-defs literal is not duplicated out of sync with EDITOR_LOCAL_EXCLUSIONS", () => {
    expect(C3_TS_DEFS_FOLDER).to.equal("ts-defs");
  });
});

// R-D6 (#63, ADR 0020): executable lock on the orthogonality this change relies
// on. isEditorLocalPath's classification of "ts-defs" as editor-local is
// UNCHANGED — ADR 0006 still holds, ts-defs/ is not project source — but that
// classification no longer implies the walk cannot reach it: a caller that
// passes an opt-in `descend` can still enter ts-defs/ to read its generated
// declarations (issue #63). If a future change tried to "fix" this by making
// find_all_files_path's default descend ignore overrides, or by flipping
// isEditorLocalPath("ts-defs") to false to unblock the walk, this test would
// catch it — the two halves (classification vs. reachability) must both keep
// holding at once.
describe("find_all_files_path / isEditorLocalPath: ts-defs classification vs. reachability (R-D6)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ts-defs/ is still classified editor-local (ADR 0006) AND still reachable with an opt-in descend (ADR 0020)", () => {
    expect(isEditorLocalPath(C3_TS_DEFS_FOLDER)).to.equal(true);

    root = mkdtempSync(path.join(tmpdir(), "c3source-files-"));
    mkdirSync(path.join(root, C3_TS_DEFS_FOLDER), { recursive: true });
    writeFileSync(path.join(root, C3_TS_DEFS_FOLDER, "x.d.ts"), "declare const x: number;");

    const found = find_all_files_path(
      root,
      () => true,
      () => true,
    );
    expect(found).to.have.lengthOf(1);
    expect(path.basename(found[0])).to.equal("x.d.ts");
  });
});

describe("find_all_files_path: canonical fixture scripts/ts-defs corpus (R-D5)", () => {
  it("R-D5: every file reachable under scripts/ts-defs with an opt-in descend is a .d.ts", function () {
    if (!fixtureProjectExists("scripts/ts-defs")) return this.skip();

    const tsDefsDir = fixtureProjectPath("scripts/ts-defs");
    const found = find_all_files_path(
      tsDefsDir,
      () => true,
      () => true,
    );
    expect(found.length).to.be.greaterThan(0);

    const offenders = found.filter((p) => !p.endsWith(".d.ts"));
    expect(offenders, `non-.d.ts files under scripts/ts-defs: ${offenders.join(", ")}`).to.deep.equal([]);
  });
});
