import { expect } from "chai";
import { findLayer, findLayerEntry, type Layout } from "../src/c3source.js";

// A tree with a NESTED global layer (Gx) so the difference between the dotted
// global-resetting fullName and an ancestors-built display name is observable.
// Depth-first walk order: A, B, C, Gx, G.
function layout(): Layout {
  return {
    name: "L",
    layers: [
      {
        name: "A",
        subLayers: [{ name: "B", subLayers: [{ name: "C" }] }, { name: "Gx", global: true }],
      },
      { name: "G", global: true },
    ],
  };
}

describe("findLayerEntry / findLayer", () => {
  it("returns the first matching layer and stops walking (short-circuit)", () => {
    let calls = 0;
    const found = findLayer(layout().layers, (e) => {
      calls += 1;
      return e.name === "B";
    });
    expect(found?.name).to.equal("B");
    expect(calls).to.equal(2); // predicate ran for A, then B — never reached C/Gx/G
  });

  it("returns undefined when nothing matches", () => {
    expect(findLayer(layout().layers, (e) => e.name === "nope")).to.equal(undefined);
    expect(findLayerEntry(layout().layers, (e) => e.name === "nope")).to.equal(undefined);
  });

  it("exposes parent + index for in-place removal", () => {
    const root = layout().layers;
    const entry = findLayerEntry(root, (e) => e.name === "Gx");
    expect(entry?.index).to.equal(1);
    expect(entry?.parent).to.equal(root[0].subLayers); // the sibling array, by reference
    entry?.parent.splice(entry.index, 1);
    expect(root[0].subLayers?.map((l) => l.name)).to.deep.equal(["B"]); // Gx removed
  });

  it("ancestors build a >-separated, non-resetting display name even across a global layer", () => {
    const entry = findLayerEntry(layout().layers, (e) => e.name === "Gx");
    expect(entry?.fullName).to.equal("global.Gx"); // dotted name resets on global
    const display = [...(entry?.ancestors ?? []), entry?.layer]
      .map((l) => l?.name)
      .join(" > ");
    expect(display).to.equal("A > Gx"); // display name does NOT reset
  });

  it("ancestors is the root-first parent chain, empty at top level", () => {
    expect(findLayerEntry(layout().layers, (e) => e.name === "A")?.ancestors).to.deep.equal([]);
    const c = findLayerEntry(layout().layers, (e) => e.name === "C");
    expect(c?.ancestors.map((l) => l.name)).to.deep.equal(["A", "B"]);
  });
});
