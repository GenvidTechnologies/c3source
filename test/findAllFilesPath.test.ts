import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { find_all_files_path } from "../src/c3source.js";

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
});
