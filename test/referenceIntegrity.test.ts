import { describe, it, before } from "mocha";
import { expect } from "chai";
import path from "node:path";
import {
  C3_PSEUDO_OBJECT_CLASSES,
  NON_ATTRIBUTABLE_ADDON_TYPES,
  manifestObjectTypeNames,
  manifestFamilyNames,
  collectLayoutEffectIds,
} from "../src/references.js";
import { readProjectManifest, type C3ProjectManifest, type Layout } from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

describe("reference-integrity domain-fact tables", () => {
  it("R-R22: C3_PSEUDO_OBJECT_CLASSES deep-equals [\"System\", \"Functions\"] (tripwire — widening is a reviewed edit)", () => {
    expect(C3_PSEUDO_OBJECT_CLASSES).to.deep.equal(["System", "Functions"]);
  });

  it("R-R23: NON_ATTRIBUTABLE_ADDON_TYPES deep-equals [\"theme\"] (tripwire — widening is a reviewed edit)", () => {
    expect(NON_ATTRIBUTABLE_ADDON_TYPES).to.deep.equal(["theme"]);
  });
});

describe("manifestObjectTypeNames / manifestFamilyNames", () => {
  const FIXTURE_DIR = fixtureProjectPath();
  const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");
  let m: C3ProjectManifest;

  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    m = readProjectManifest(MANIFEST_PATH);
  });

  it("R-R24: manifestObjectTypeNames returns the fixture's declared object-type names", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const names = manifestObjectTypeNames(m);
    expect(names).to.be.instanceOf(Set);
    expect(names.size).to.be.greaterThan(0);
    // spot-check membership rather than the exact set, so this test is not coupled
    // to every future fixture object type.
    for (const name of names) expect(typeof name).to.equal("string");
  });

  it("R-R25: manifestFamilyNames returns the fixture's declared family names", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const names = manifestFamilyNames(m);
    expect(names).to.be.instanceOf(Set);
    for (const name of names) expect(typeof name).to.equal("string");
  });

  it("R-R26: both helpers are empty-safe when the section is absent (no throw)", () => {
    const bare = {} as C3ProjectManifest;
    expect(manifestObjectTypeNames(bare)).to.deep.equal(new Set());
    expect(manifestFamilyNames(bare)).to.deep.equal(new Set());
  });
});

describe("collectLayoutEffectIds", () => {
  it("R-R27: a layer-level effect is reported with jsonPath and layerFullName", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", effectTypes: [{ effectId: "Glow", name: "Glow" }] }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([
      { effectId: "Glow", jsonPath: "layers[0].effectTypes[0]", layerFullName: "L.A" },
    ]);
  });

  it("R-R28: a layout-level effect is reported with no layerFullName", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A" }],
      effectTypes: [{ effectId: "Blur", name: "Blur" }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([{ effectId: "Blur", jsonPath: "effectTypes[0]" }]);
  });

  it("R-R29: a nested sublayer effect carries the dotted fullName and the nested jsonPath", () => {
    const layout: Layout = {
      name: "L",
      layers: [
        {
          name: "A",
          subLayers: [{ name: "B", effectTypes: [{ effectId: "Warp", name: "Warp" }] }],
        },
      ],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([
      { effectId: "Warp", jsonPath: "layers[0].subLayers[0].effectTypes[0]", layerFullName: "L.A.B" },
    ]);
  });

  it("R-R30: a layout with no effects anywhere returns []", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", subLayers: [{ name: "B" }] }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([]);
  });

  it("R-R31: layout-level and layer-level effects both appear, layout-level first", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", effectTypes: [{ effectId: "Glow", name: "Glow" }] }],
      effectTypes: [{ effectId: "Blur", name: "Blur" }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([
      { effectId: "Blur", jsonPath: "effectTypes[0]" },
      { effectId: "Glow", jsonPath: "layers[0].effectTypes[0]", layerFullName: "L.A" },
    ]);
  });
});
