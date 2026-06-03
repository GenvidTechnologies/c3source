import { expect } from "chai";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  visitInstances,
  visitLayers,
  visitLayout,
  visit_layers_in_layouts,
  type Instance,
  type Layout,
} from "../src/c3source.js";
import { fixtureExists, fixturePath } from "./fixtureHelpers.js";

function layout(): Layout {
  return {
    name: "L",
    layers: [
      {
        name: "A",
        subLayers: [{ name: "B", subLayers: [{ name: "C" }] }],
        instances: [{ type: "Sprite", properties: {}, uid: 1 }],
      },
      { name: "G", global: true, instances: [{ type: "Text", properties: {}, uid: 2 }] },
    ],
  };
}

describe("visitLayout / visitLayers", () => {
  it("visits every layer depth-first with dotted names, global reset, layout-qualified root", () => {
    const names: string[] = [];
    visitLayout(layout(), (layer) => {
      names.push(`${layer.name}`);
      return 0;
    });
    expect(names).to.deep.equal(["A", "B", "C", "G"]);
  });

  it("builds the dotted fullLayerName and resets the prefix to 'global'", () => {
    const full: string[] = [];
    visitLayout(layout(), (_layer, fullLayerName) => {
      full.push(fullLayerName);
      return 0;
    });
    expect(full).to.deep.equal(["L.A", "L.A.B", "L.A.B.C", "global.G"]);
  });

  it("sums the LayerVisitor count over the whole tree", () => {
    const count = visitLayout(layout(), () => 1);
    expect(count).to.equal(4); // A, B, C, G
  });

  it("visitLayers without a prefix yields bare names", () => {
    const full: string[] = [];
    visitLayers(layout().layers, (_l, name) => {
      full.push(name);
      return 0;
    });
    expect(full).to.deep.equal(["A", "A.B", "A.B.C", "global.G"]);
  });
});

describe("visitInstances", () => {
  it("visits every instance across layers and counts changes", () => {
    const seen: Array<{ uid: number; layer: string }> = [];
    const count = visitInstances(layout(), (inst: Instance, _i, _layer, fullLayerName) => {
      seen.push({ uid: inst.uid, layer: fullLayerName });
      return true; // mark changed
    });
    expect(count).to.equal(2);
    expect(seen).to.deep.equal([
      { uid: 1, layer: "L.A" },
      { uid: 2, layer: "global.G" },
    ]);
  });

  it("only counts instances the visitor marks changed", () => {
    const count = visitInstances(layout(), (inst) => inst.uid === 1);
    expect(count).to.equal(1);
  });
});

describe("visit_layers_in_layouts (file walker)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "c3src-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not rewrite the file when the visitor reports no change", () => {
    const file = path.join(dir, "Layout 1.json");
    const original = '{"loose":"json","name":"L","layers":[{"name":"A"}]}';
    writeFileSync(file, original);
    const count = visit_layers_in_layouts(dir, () => 0);
    expect(count).to.equal(0);
    expect(readFileSync(file, "utf-8")).to.equal(original); // untouched, no reserialization
  });

  it("rewrites with tab indentation when the visitor reports a change", () => {
    const file = path.join(dir, "Layout 1.json");
    writeFileSync(file, '{"name":"L","layers":[{"name":"A"}]}');
    const count = visit_layers_in_layouts(dir, () => 1);
    expect(count).to.equal(1);
    const rewritten = readFileSync(file, "utf-8");
    expect(rewritten).to.include('\t"name": "L"'); // tab-indented, matching C3
  });

  it("skips .uistate.json files during discovery", () => {
    writeFileSync(path.join(dir, "Layout 1.json"), '{"name":"L","layers":[{"name":"A"}]}');
    writeFileSync(path.join(dir, "Layout 1.uistate.json"), '{"should":"be skipped"}');
    const names: string[] = [];
    visit_layers_in_layouts(dir, (layer) => {
      names.push(layer.name);
      return 0;
    });
    expect(names).to.deep.equal(["A"]); // uistate file never parsed/visited
  });

  it("discovers the real fixture layout and qualifies its layer name", function () {
    const layoutsDir = fixturePath("c3source-fixture/layouts");
    if (!fixtureExists("c3source-fixture/layouts/Main Layout.json")) return this.skip();
    const found: string[] = [];
    visit_layers_in_layouts(layoutsDir, (layer, fullLayerName) => {
      if (layer.name) found.push(fullLayerName);
      return 0; // read-only: never write to the fixture
    });
    expect(found).to.include("Main Layout.layer 0");
  });
});
