import { expect } from "chai";
import {
  canHaveChildren,
  hasActions,
  hasChildren,
  hasConditions,
  isScriptAction,
  walkScriptActions,
  type EventSheet,
  type EventSheetEvent,
} from "../src/c3source.js";

const block: EventSheetEvent = {
  eventType: "block",
  conditions: [],
  actions: [{ type: "script", language: "typescript", script: ["a()"] }],
  sid: 1,
  children: [],
};
const comment: EventSheetEvent = { eventType: "comment", text: "x" };

// A block with no `children` key at all — the disambiguating case between the
// presence predicate (false) and the capability predicate (true).
const childlessBlock: EventSheetEvent = {
  eventType: "block",
  conditions: [],
  actions: [],
  sid: 2,
};
// A group whose `children` key has not been created. The GroupEvent type
// requires `children`, so the cast models the on-disk/in-flight shape a mutator
// must cope with before it populates the array.
const childlessGroup = {
  eventType: "group",
  disabled: false,
  title: "G",
  isActiveOnStart: true,
  sid: 3,
} as unknown as EventSheetEvent;
const variable: EventSheetEvent = {
  eventType: "variable",
  name: "v",
  type: "number",
  initialValue: "0",
  isStatic: false,
  isConstant: false,
  sid: 4,
};
const include: EventSheetEvent = { eventType: "include", includeSheet: "Other" };

describe("§4a predicates", () => {
  it("isScriptAction distinguishes typescript script actions", () => {
    expect(isScriptAction({ type: "script", language: "typescript", script: [] })).to.equal(true);
    expect(isScriptAction({ id: "x", objectClass: "Y" })).to.equal(false);
    expect(isScriptAction({ type: "comment", text: "hi" })).to.equal(false);
  });

  it("hasChildren is true only when a children array is present", () => {
    expect(hasChildren(block)).to.equal(true);
    expect(hasChildren(comment)).to.equal(false);
  });

  it("hasActions / hasConditions hold for block-like events only", () => {
    expect(hasActions(block)).to.equal(true);
    expect(hasConditions(block)).to.equal(true);
    expect(hasActions(comment)).to.equal(false);
    expect(hasConditions(comment)).to.equal(false);
  });

  it("canHaveChildren is type-based: true for a childless block/group, unlike hasChildren", () => {
    // Disambiguating case: child-capable kinds with no populated children array.
    expect(canHaveChildren(childlessBlock)).to.equal(true);
    expect(hasChildren(childlessBlock)).to.equal(false);
    expect(canHaveChildren(childlessGroup)).to.equal(true);
    expect(hasChildren(childlessGroup)).to.equal(false);
  });

  it("canHaveChildren and hasChildren both reject non-child-bearing kinds", () => {
    for (const event of [comment, variable, include]) {
      expect(canHaveChildren(event)).to.equal(false);
      expect(hasChildren(event)).to.equal(false);
    }
  });
});

describe("walkScriptActions", () => {
  it("collects every typescript script action in event order", () => {
    const sheet: EventSheet = {
      name: "S",
      sid: 1,
      events: [
        {
          eventType: "block",
          conditions: [],
          actions: [
            { type: "script", language: "typescript", script: ["one()"] },
            { id: "do-thing", objectClass: "Sprite" }, // non-script, ignored
          ],
          sid: 1,
          children: [
            {
              eventType: "block",
              conditions: [],
              actions: [{ type: "script", language: "typescript", script: ["two()"] }],
              sid: 2,
            },
          ],
        },
      ],
    };
    const scripts = walkScriptActions(sheet);
    expect(scripts.map((s) => s.script[0])).to.deep.equal(["one()", "two()"]);
  });

  it("returns [] for a sheet with no script actions", () => {
    expect(walkScriptActions({ name: "S", sid: 1, events: [] })).to.deep.equal([]);
  });
});
