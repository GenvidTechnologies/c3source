import { expect } from "chai";
import {
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
