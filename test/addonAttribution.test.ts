import { describe, it, before } from "mocha";
import { expect } from "chai";
import {
  attributeObjectType,
  attributeFamily,
  collectAddonAttribution,
  openProject,
  type AddonAttribution,
  type C3Project,
  type Family,
  type ObjectType,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixtureProjectPath();

describe("attributeObjectType / attributeFamily (inline literals)", () => {
  it("attributeObjectType derives name/source/pluginId/behaviorIds/effectIds", () => {
    const ot: ObjectType = {
      name: "Sprite2",
      "plugin-id": "Sprite",
      behaviorTypes: [{ behaviorId: "Fade", name: "Fade", sid: 123 }],
      effectTypes: [{ effectId: "Grayscale", name: "Grayscale" }],
    };
    expect(attributeObjectType(ot)).to.deep.equal({
      name: "Sprite2",
      source: "objectType",
      pluginId: "Sprite",
      behaviorIds: ["Fade"],
      effectIds: ["Grayscale"],
    });
  });

  it("attributeObjectType treats absent behaviorTypes/effectTypes as empty arrays", () => {
    const ot: ObjectType = { name: "Bare", "plugin-id": "Sprite" };
    const attribution = attributeObjectType(ot);
    expect(attribution.behaviorIds).to.deep.equal([]);
    expect(attribution.effectIds).to.deep.equal([]);
  });

  it("attributeFamily derives name/source/pluginId/behaviorIds/effectIds", () => {
    const f: Family = {
      name: "TextFamily",
      "plugin-id": "Text",
      members: ["Text", "Text2"],
      behaviorTypes: [{ behaviorId: "Timer", name: "Timer", sid: 456 }],
      effectTypes: [{ effectId: "Tint", name: "Tint" }],
    };
    expect(attributeFamily(f)).to.deep.equal({
      name: "TextFamily",
      source: "family",
      pluginId: "Text",
      behaviorIds: ["Timer"],
      effectIds: ["Tint"],
    });
  });

  it("attributeFamily treats absent behaviorTypes/effectTypes as empty arrays", () => {
    const f: Family = { name: "Bare", "plugin-id": "Text", members: [] };
    const attribution = attributeFamily(f);
    expect(attribution.behaviorIds).to.deep.equal([]);
    expect(attribution.effectIds).to.deep.equal([]);
  });
});

describe("collectAddonAttribution (free function, inline arrays)", () => {
  it("concatenates object-type attributions before family attributions, preserving order", () => {
    const objectTypes: ObjectType[] = [
      { name: "A", "plugin-id": "Sprite" },
      { name: "B", "plugin-id": "Text" },
    ];
    const families: Family[] = [{ name: "C", "plugin-id": "Sprite", members: [] }];
    const result = collectAddonAttribution(objectTypes, families);
    expect(result.map((r) => r.name)).to.deep.equal(["A", "B", "C"]);
    expect(result.map((r) => r.source)).to.deep.equal(["objectType", "objectType", "family"]);
  });

  it("returns [] for empty inputs", () => {
    expect(collectAddonAttribution([], [])).to.deep.equal([]);
  });
});

describe("C3Project#collectAddonAttribution (fixture end-to-end)", () => {
  let proj: C3Project;
  let attributions: AddonAttribution[];

  before(function () {
    if (!fixtureProjectExists()) return this.skip();
    proj = openProject(FIXTURE_DIR);
    attributions = proj.collectAddonAttribution();
  });

  it("covers both object types and families", function () {
    if (!fixtureProjectExists()) return this.skip();
    expect(attributions.some((a) => a.source === "objectType")).to.equal(true);
    expect(attributions.some((a) => a.source === "family")).to.equal(true);
  });

  it("the enriched Sprite2 object type appears with pluginId/behaviorIds/effectIds", function () {
    if (!fixtureProjectExists()) return this.skip();
    const sprite2 = attributions.find((a) => a.source === "objectType" && a.name === "Sprite2");
    expect(sprite2, "Sprite2 attribution present").to.exist;
    expect(sprite2!.pluginId).to.equal("Sprite");
    expect(sprite2!.behaviorIds).to.deep.equal(["Fade"]);
    expect(sprite2!.effectIds).to.deep.equal(["Grayscale"]);
  });

  it("the enriched TextFamily appears with pluginId/behaviorIds/effectIds", function () {
    if (!fixtureProjectExists()) return this.skip();
    const textFamily = attributions.find((a) => a.source === "family" && a.name === "TextFamily");
    expect(textFamily, "TextFamily attribution present").to.exist;
    expect(textFamily!.pluginId).to.equal("Text");
    expect(textFamily!.behaviorIds).to.deep.equal(["Timer"]);
    expect(textFamily!.effectIds).to.deep.equal(["Tint"]);
  });
});
