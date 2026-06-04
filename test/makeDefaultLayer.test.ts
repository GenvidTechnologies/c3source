import { expect } from "chai";
import { makeDefaultLayer, type Layer } from "../src/c3source.js";
import { fixtureExists, loadFixture } from "./fixtureHelpers.js";

const REQUIRED_KEYS = [
  "name",
  "overriden",
  "subLayers",
  "instances",
  "sid",
  "effectTypes",
  "isInitiallyVisible",
  "isInitiallyInteractive",
  "isHTMLElementsLayer",
  "color",
  "backgroundColor",
  "isTransparent",
  "sampling",
  "parallaxX",
  "parallaxY",
  "scaleRate",
  "forceOwnTexture",
  "renderingMode",
  "drawOrder",
  "useRenderCells",
  "blendMode",
  "zElevation",
  "global",
];

const FIXTURE_LAYOUT = "c3source-fixture/layouts/Main Layout.json";

describe("makeDefaultLayer", () => {
  it("sets the given name and empty instances/subLayers", () => {
    const layer = makeDefaultLayer("MyLayer");
    expect(layer.name).to.equal("MyLayer");
    expect(layer.instances).to.deep.equal([]);
    expect(layer.subLayers).to.deep.equal([]);
  });

  it("includes every required C3 layer field", () => {
    const layer = makeDefaultLayer("L");
    for (const key of REQUIRED_KEYS) {
      expect(layer, `missing key ${key}`).to.have.property(key);
    }
  });

  it("matches the key set of a real C3 layer (schema-drift guard)", function () {
    if (!fixtureExists(FIXTURE_LAYOUT)) return this.skip();
    const layout = JSON.parse(loadFixture(FIXTURE_LAYOUT)) as { layers: Layer[] };
    const real = layout.layers[0];
    expect(real, "fixture has a layer").to.exist;
    expect(Object.keys(makeDefaultLayer("L")).sort()).to.deep.equal(Object.keys(real).sort());
  });
});
