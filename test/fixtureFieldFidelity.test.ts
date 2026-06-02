import { expect } from "chai";
import type { EventSheet, Layout } from "../src/c3source.js";
import { fixtureExists, loadFixture } from "./fixtureHelpers.js";

const LAYOUT = "sample-project/layouts/Main Layout.json";
const SHEET = "sample-project/eventSheets/Event sheet 1.json";

// Ground-truth checks against a real C3 export: confirm the §1 optional
// fields are spelled and shaped exactly as C3 serializes them. Each block
// self-skips if the relevant fixture/capability is not present, so the
// suite stays green as the sample project grows (v1 -> v2 -> v3).
describe("§1 field fidelity (real C3 export)", () => {
  it("Layout carries eventSheet/width/height", function () {
    if (!fixtureExists(LAYOUT)) return this.skip();
    const layout = JSON.parse(loadFixture(LAYOUT)) as Layout;
    expect(layout.eventSheet, "eventSheet").to.be.a("string");
    expect(layout.width, "width").to.be.a("number");
    expect(layout.height, "height").to.be.a("number");
  });

  it("Layer carries overriden as 0 or 1", function () {
    if (!fixtureExists(LAYOUT)) return this.skip();
    const layout = JSON.parse(loadFixture(LAYOUT)) as Layout;
    const layers = layout.layers ?? [];
    expect(layers.length, "fixture has at least one layer").to.be.greaterThan(0);
    for (const layer of layers) {
      if (layer.overriden !== undefined) {
        expect(layer.overriden, `layer ${layer.name} overriden`).to.be.oneOf([0, 1]);
      }
    }
  });

  it("Condition.disabled, when present, is boolean (v2 capability)", function () {
    if (!fixtureExists(SHEET)) return this.skip();
    const sheet = JSON.parse(loadFixture(SHEET)) as EventSheet;
    const conditions: Array<{ disabled?: unknown }> = [];
    for (const event of sheet.events) {
      if ("conditions" in event && Array.isArray(event.conditions)) {
        conditions.push(...event.conditions);
      }
    }
    if (conditions.length === 0) return this.skip();
    for (const cond of conditions) {
      if (cond.disabled !== undefined) {
        expect(cond.disabled).to.be.a("boolean");
      }
    }
  });
});
