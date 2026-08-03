import { expect } from "chai";
import { walkLayerEntries, type Layer, type LayerEntryWithPath } from "../src/c3source.js";

// Mirrors the real fixture's "Second Layout" shape: a 3-deep nested layer under
// two intervening sibling layers, so index [2] is exercised (not just [0]).
// Depth-first walk order: A, B, C, D (D nested 3 deep under C).
function layers(): Layer[] {
  return [
    { name: "A" },
    { name: "B" },
    {
      name: "C",
      subLayers: [{ name: "D", subLayers: [{ name: "E" }] }],
    },
  ];
}

function collect(): LayerEntryWithPath[] {
  return [...walkLayerEntries(layers(), "", [])];
}

describe("walkLayerEntries jsonPath", () => {
  it("gives a top-level layer at index 0 the path layers[0]", () => {
    const entries = collect();
    const a = entries.find((e) => e.name === "A");
    expect(a?.jsonPath).to.equal("layers[0]");
  });

  it("gives a top-level layer a non-zero index its own path", () => {
    const entries = collect();
    const c = entries.find((e) => e.name === "C");
    expect(c?.index).to.equal(2);
    expect(c?.jsonPath).to.equal("layers[2]");
  });

  it("builds the full chain for a 3-deep nested layer", () => {
    const entries = collect();
    const e = entries.find((entry) => entry.name === "E");
    expect(e?.jsonPath).to.equal("layers[2].subLayers[0].subLayers[0]");
  });

  it("jsonPath is consistent with index and the ancestors chain", () => {
    const entries = collect();
    const e = entries.find((entry) => entry.name === "E");
    expect(e?.index).to.equal(0);
    expect(e?.ancestors.map((l) => l.name)).to.deep.equal(["C", "D"]);
  });

  it("leaves the existing LayerEntry fields unchanged in value", () => {
    const ls = layers();
    const entries = [...walkLayerEntries(ls, "", [])];
    const d = entries.find((entry) => entry.name === "D");
    expect(d?.name).to.equal("D");
    expect(d?.fullName).to.equal("C.D");
    expect(d?.ancestors.map((l) => l.name)).to.deep.equal(["C"]);
    expect(d?.parent).to.equal(ls[2].subLayers);
    expect(d?.index).to.equal(0);
  });
});
