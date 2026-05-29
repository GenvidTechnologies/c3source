import { expect } from "chai";
import { visitInstances, visitLayers, visitLayout, type Instance, type Layout } from "../src/c3source.js";

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
