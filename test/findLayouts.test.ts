import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  visit_layers_in_layouts,
  find_all_layouts_path,
  find_all_objectTypes_path,
  find_all_eventsheets_path,
} from "../src/c3source.js";

describe("uistate subfolders (C3 r487)", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores uistate/ subfolders and their contents instead of choking on them", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-uistate-"));
    const layouts = path.join(root, "layouts");
    mkdirSync(layouts, { recursive: true });

    // A real layout file the traversal must visit.
    writeFileSync(
      path.join(layouts, "Level1.json"),
      JSON.stringify({ name: "Level1", layers: [{ name: "Background" }] }),
    );

    // C3 r487 drops a `uistate/` subfolder full of .json files that are NOT
    // named `.uistate.json`. They are not layouts; parsing them as such chokes.
    const uistate = path.join(layouts, "uistate");
    mkdirSync(uistate, { recursive: true });
    writeFileSync(path.join(uistate, "Level1.json"), "this is not valid json {");

    const visited: string[] = [];
    const changed = visit_layers_in_layouts(layouts, (layer) => {
      visited.push(layer.name);
      return 0;
    });

    expect(changed).to.equal(0);
    expect(visited).to.deep.equal(["Background"]);
  });

  it("every find_all_*_path collector skips uistate/ folders but still recurses into real subfolders", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-collectors-"));

    // A nested real file + a sibling uistate/ folder, for each collector.
    const make = (dir: string) => {
      mkdirSync(path.join(root, dir, "sub"), { recursive: true });
      mkdirSync(path.join(root, dir, "uistate"), { recursive: true });
      writeFileSync(path.join(root, dir, "Top.json"), "{}");
      writeFileSync(path.join(root, dir, "sub", "Nested.json"), "{}");
      writeFileSync(path.join(root, dir, "uistate", "Top.json"), "{}");
    };
    make("layouts");
    make("objectTypes");
    make("eventSheets");

    // Each collector finds the top-level and the nested file (proving recursion),
    // and never the uistate/ copy (proving the skip applies to all three).
    const rel = (paths: string[]) => paths.map((p) => path.relative(root, p).replace(/\\/g, "/")).sort();

    expect(rel(find_all_layouts_path(path.join(root, "layouts")))).to.deep.equal([
      "layouts/Top.json",
      "layouts/sub/Nested.json",
    ]);
    expect(rel(find_all_objectTypes_path(path.join(root, "objectTypes")))).to.deep.equal([
      "objectTypes/Top.json",
      "objectTypes/sub/Nested.json",
    ]);
    expect(rel(find_all_eventsheets_path(path.join(root, "eventSheets")))).to.deep.equal([
      "eventSheets/Top.json",
      "eventSheets/sub/Nested.json",
    ]);
  });

  it("find_all_eventsheets_path only collects .json files, unlike the layout/objectType collectors", () => {
    root = mkdtempSync(path.join(tmpdir(), "c3source-ext-"));
    const dir = path.join(root, "eventSheets");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "Sheet.json"), "{}");
    writeFileSync(path.join(dir, "notes.txt"), "ignored");

    const found = find_all_eventsheets_path(dir).map((p) => path.relative(root, p).replace(/\\/g, "/"));
    expect(found).to.deep.equal(["eventSheets/Sheet.json"]);
  });
});
