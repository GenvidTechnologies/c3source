import { expect } from "chai";
import type {
  BlockEvent,
  Condition,
  Family,
  FunctionBlockEvent,
  Layer,
  Layout,
  ObjectType,
} from "../src/c3source.js";

// These tests are primarily compile-time: if the optional fields were not
// declared, `satisfies` would fail typecheck. The runtime assertions just
// confirm the values round-trip.
describe("§1 optional type fields", () => {
  it("Layer accepts overriden", () => {
    const layer = { name: "L", overriden: 1 } satisfies Layer;
    expect(layer.overriden).to.equal(1);
  });

  it("Layout accepts eventSheet/width/height", () => {
    const layout = {
      name: "Layout 1",
      layers: [],
      eventSheet: "Event sheet 1",
      width: 960,
      height: 1280,
    } satisfies Layout;
    expect(layout.width).to.equal(960);
    expect(layout.height).to.equal(1280);
    expect(layout.eventSheet).to.equal("Event sheet 1");
  });

  it("Condition accepts disabled", () => {
    const cond = { id: "is-visible", objectClass: "Sprite", sid: 1, disabled: true } satisfies Condition;
    expect(cond.disabled).to.equal(true);
  });

  it("BlockEvent accepts disabled and isOrBlock", () => {
    const block = {
      eventType: "block",
      conditions: [],
      actions: [],
      sid: 1,
      disabled: true,
      isOrBlock: true,
    } satisfies BlockEvent;
    expect(block.disabled).to.equal(true);
    expect(block.isOrBlock).to.equal(true);
  });

  it("FunctionBlockEvent accepts disabled", () => {
    const fn = {
      eventType: "function-block",
      functionName: "MyFn",
      functionReturnType: "none",
      functionCopyPicked: false,
      functionIsAsync: false,
      functionParameters: [],
      conditions: [],
      actions: [],
      sid: 1,
      disabled: true,
    } satisfies FunctionBlockEvent;
    expect(fn.disabled).to.equal(true);
  });

  it("all new fields are optional (objects omitting them still typecheck)", () => {
    const layer: Layer = { name: "L" };
    const cond: Condition = { id: "x", objectClass: "Y", sid: 1 };
    expect(layer.overriden).to.equal(undefined);
    expect(cond.disabled).to.equal(undefined);
  });

  it("ObjectType accepts behaviorTypes and effectTypes", () => {
    const objectType = {
      name: "Sprite",
      "plugin-id": "Sprite",
      behaviorTypes: [{ behaviorId: "Sin", name: "Sine", sid: 1 }],
      effectTypes: [{ effectId: "Glow", name: "Glow" }],
    } satisfies ObjectType;
    expect(objectType.behaviorTypes?.[0].behaviorId).to.equal("Sin");
    expect(objectType.effectTypes?.[0].effectId).to.equal("Glow");
  });

  it("Family accepts name, plugin-id, members, and optional behaviorTypes/effectTypes", () => {
    const family = {
      name: "Enemies",
      "plugin-id": "Family",
      members: ["Sprite", "Sprite2"],
      behaviorTypes: [{ behaviorId: "Sin", name: "Sine" }],
      effectTypes: [{ effectId: "Glow", name: "Glow" }],
    } satisfies Family;
    expect(family.members).to.deep.equal(["Sprite", "Sprite2"]);
  });

  it("ObjectType and Family typecheck without behaviorTypes/effectTypes", () => {
    const objectType: ObjectType = { name: "Sprite", "plugin-id": "Sprite" };
    const family: Family = { name: "Enemies", "plugin-id": "Family", members: [] };
    expect(objectType.behaviorTypes).to.equal(undefined);
    expect(family.effectTypes).to.equal(undefined);
  });
});
