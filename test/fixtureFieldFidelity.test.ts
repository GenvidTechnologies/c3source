import { expect } from "chai";
import {
  hasActions,
  hasConditions,
  visitEvents,
  type EventSheet,
  type Layout,
  type ObjectType,
} from "../src/c3source.js";
import { fixtureProjectAvailable, loadFixtureProject } from "./fixtureHelpers.js";

const LAYOUT = "layouts/Gameplay/Main Layout.json";
const SHEET = "eventSheets/Gameplay/Event sheet 1.json";
const SPRITE2 = "objectTypes/images/Sprite2.json";

// Ground-truth checks against a real C3 export: confirm the §1 optional
// fields are spelled and shaped exactly as C3 serializes them. Each block
// self-skips if the relevant fixture/capability is not present, so the
// suite stays green as the sample project grows (v1 -> v2 -> v3).
describe("§1 field fidelity (real C3 export)", () => {
  it("Layout carries eventSheet/width/height", function () {
    if (!fixtureProjectAvailable(LAYOUT)) return this.skip();
    const layout = JSON.parse(loadFixtureProject(LAYOUT)) as Layout;
    expect(layout.eventSheet, "eventSheet").to.be.a("string");
    expect(layout.width, "width").to.be.a("number");
    expect(layout.height, "height").to.be.a("number");
  });

  it("Layer carries overriden as 0 or 1", function () {
    if (!fixtureProjectAvailable(LAYOUT)) return this.skip();
    const layout = JSON.parse(loadFixtureProject(LAYOUT)) as Layout;
    const layers = layout.layers ?? [];
    expect(layers.length, "fixture has at least one layer").to.be.greaterThan(0);
    for (const layer of layers) {
      if (layer.overriden !== undefined) {
        expect(layer.overriden, `layer ${layer.name} overriden`).to.be.oneOf([0, 1]);
      }
    }
  });

  it("visitEvents reaches every condition (incl. group.children) and every observed .disabled is boolean", function () {
    if (!fixtureProjectAvailable(SHEET)) return this.skip();
    const sheet = JSON.parse(loadFixtureProject(SHEET)) as EventSheet;

    let conditionsSeen = 0;
    const disabledObservations: Array<{ path: string; value: unknown }> = [];

    visitEvents(sheet.events, (event, ctx) => {
      if ("disabled" in event && event.disabled !== undefined) {
        disabledObservations.push({ path: ctx.jsonPath, value: event.disabled });
      }
      if (hasConditions(event)) {
        event.conditions.forEach((cond, i) => {
          conditionsSeen++;
          if (cond.disabled !== undefined) {
            disabledObservations.push({ path: `${ctx.jsonPath}.conditions[${i}]`, value: cond.disabled });
          }
        });
      }
      if (hasActions(event)) {
        event.actions.forEach((action, i) => {
          const disabled = (action as { disabled?: unknown }).disabled;
          if (disabled !== undefined) {
            disabledObservations.push({ path: `${ctx.jsonPath}.actions[${i}]`, value: disabled });
          }
        });
      }
    });

    // Floor 1: proves the walk actually reaches ACE level via the canonical
    // visitEvents traversal (which recurses into group.children) rather than
    // silently seeing zero conditions -- the old hand-rolled top-level-only
    // walk is exactly how this test came to miss the group nesting and skip
    // permanently.
    expect(conditionsSeen, "conditions observed during the walk").to.be.greaterThan(0);

    // Floor 2: `disabled` is C3's enable/disable flag. It appears on events
    // (groups always carry it, blocks/function-blocks carry it optionally)
    // and on individual conditions/actions when an author disables just one
    // ACE. The golden fixture currently only disables at the group level
    // (one disabled group per sheet, no disabled condition/action anywhere)
    // -- so without this floor, the boolean assertion below would silently
    // check nothing and this test would revert to the same green-but-vacuous
    // state issue #82 exists to fix.
    expect(disabledObservations.length, "observed .disabled fields").to.be.greaterThan(0);

    for (const { path, value } of disabledObservations) {
      expect(value, `${path}.disabled`).to.be.a("boolean");
    }
  });

  it("Sprite2 carries a behaviorTypes/effectTypes entry (addon attribution ground truth)", function () {
    if (!fixtureProjectAvailable(SPRITE2)) return this.skip();
    const ot = JSON.parse(loadFixtureProject(SPRITE2)) as ObjectType;
    expect(ot.behaviorTypes?.[0]?.behaviorId, "behaviorTypes[0].behaviorId").to.equal("MyCompany_MyBehavior");
    expect(ot.effectTypes?.[0]?.effectId, "effectTypes[0].effectId").to.equal("burn");
  });
});
