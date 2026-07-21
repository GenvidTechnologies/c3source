import { describe, it, before } from "mocha";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  parseAcesModel,
  parseAddonMetadata,
  findAce,
  findExpression,
  stripBom,
  type AcesModel,
} from "../src/c3source.js";
import { fixtureExists, fixturePath, sdkFixtureExists, sdkPath } from "./fixtureHelpers.js";

function readJsonFixture(absPath: string): unknown {
  return JSON.parse(stripBom(readFileSync(absPath, "utf-8")));
}

const ADDON_SAMPLE_DIR = fixturePath("addon-sample");

describe("parseAcesModel / parseAddonMetadata (test/fixtures/addon-sample)", () => {
  it("parseAcesModel flattens the single 'custom' category into action/condition/expression", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const model = parseAcesModel(readJsonFixture(`${ADDON_SAMPLE_DIR}/aces.json`));

    expect(model.actions).to.have.lengthOf(1);
    expect(model.actions[0]).to.include({ kind: "action", category: "custom", id: "do-thing", scriptName: "DoThing" });
    expect(model.actions[0].params).to.deep.equal([{ id: "amount", type: "number" }]);

    expect(model.conditions).to.have.lengthOf(1);
    expect(model.conditions[0]).to.include({
      kind: "condition",
      category: "custom",
      id: "is-ready",
      scriptName: "IsReady",
    });
    expect(model.conditions[0].params).to.deep.equal([]);

    expect(model.expressions).to.have.lengthOf(1);
    expect(model.expressions[0]).to.include({
      kind: "expression",
      category: "custom",
      id: "current-value",
      expressionName: "CurrentValue",
      returnType: "number",
    });
    expect(model.expressions[0].params).to.deep.equal([]);
  });

  it("findAce resolves by (kind, id); kind is part of identity", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const model = parseAcesModel(readJsonFixture(`${ADDON_SAMPLE_DIR}/aces.json`));
    expect(findAce(model, "action", "do-thing")).to.not.equal(undefined);
    expect(findAce(model, "condition", "do-thing")).to.equal(undefined);
  });

  it("findExpression resolves by expressionName, not by id", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const model = parseAcesModel(readJsonFixture(`${ADDON_SAMPLE_DIR}/aces.json`));
    expect(findExpression(model, "CurrentValue")).to.not.equal(undefined);
    expect(findExpression(model, "current-value")).to.equal(undefined);
  });

  it("parseAddonMetadata parses addon.json's id/type/version", function () {
    if (!fixtureExists("addon-sample")) return this.skip();
    const metadata = parseAddonMetadata(readJsonFixture(`${ADDON_SAMPLE_DIR}/addon.json`));
    expect(metadata.id).to.equal("TestCompany_SamplePlugin");
    expect(metadata.type).to.equal("plugin");
    expect(metadata.version).to.equal("1.0.0.0");
  });

  it("is lenient: an unknown extra flag on an ACE passes through", () => {
    const model = parseAcesModel({
      custom: {
        actions: [{ id: "do-thing", scriptName: "DoThing", highlight: true, isAsync: true }],
      },
    });
    expect(model.actions[0]).to.include({ highlight: true, isAsync: true });
  });

  it("is lenient: an action with no 'params' key defaults to []", () => {
    const model = parseAcesModel({
      custom: { actions: [{ id: "do-alert", scriptName: "Alert" }] },
    });
    expect(model.actions[0].params).to.deep.equal([]);
  });

  it("parseAcesModel throws 'invalid aces.json:' when an ACE is missing 'id'", () => {
    expect(() =>
      parseAcesModel({
        custom: { actions: [{ scriptName: "DoThing" }] },
      }),
    ).to.throw(/^invalid aces\.json:/);
  });

  it("parseAddonMetadata throws 'invalid addon.json:' when 'id' is missing", () => {
    expect(() =>
      parseAddonMetadata({ type: "plugin", name: "Sample", version: "1.0.0.0", author: "Test Author" }),
    ).to.throw(/^invalid addon\.json:/);
  });
});

describe("parseAcesModel (SDK-gated, plugin-sdk/customImporterPlugin/aces.json)", () => {
  const SDK_ACES = "plugin-sdk/customImporterPlugin/aces.json";
  let model: AcesModel;

  before(function () {
    if (!sdkFixtureExists(SDK_ACES)) return this.skip();
    model = parseAcesModel(readJsonFixture(sdkPath(SDK_ACES)));
  });

  it("parses the 'custom' category's action 'do-alert' with no params -> []", function () {
    if (!sdkFixtureExists(SDK_ACES)) return this.skip();
    const doAlert = findAce(model, "action", "do-alert");
    expect(doAlert).to.not.equal(undefined);
    expect(doAlert).to.include({ scriptName: "Alert", category: "custom" });
    expect(doAlert!.params).to.deep.equal([]);
  });

  it("parses the condition 'is-large-number'", function () {
    if (!sdkFixtureExists(SDK_ACES)) return this.skip();
    const isLargeNumber = findAce(model, "condition", "is-large-number");
    expect(isLargeNumber).to.not.equal(undefined);
    expect(isLargeNumber).to.include({ scriptName: "IsLargeNumber", category: "custom" });
  });

  it("parses the expression 'double'/'Double'; findExpression resolves by expressionName", function () {
    if (!sdkFixtureExists(SDK_ACES)) return this.skip();
    const double = findAce(model, "expression", "double");
    expect(double).to.not.equal(undefined);
    expect(findExpression(model, "Double")).to.deep.equal(double);
  });
});
