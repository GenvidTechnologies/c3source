import { expect } from "chai";
import {
  EVENTVAR_REFERENCE_ACES,
  isEventVarReference,
  getEventVarReferenceName,
  visitEvents,
  hasActions,
  hasConditions,
  type EventSheet,
} from "../src/c3source.js";
import { loadFixture, fixtureExists } from "./fixtureHelpers.js";

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("EVENTVAR_REFERENCE_ACES", () => {
  it("exports a record with 8 entries", () => {
    expect(Object.keys(EVENTVAR_REFERENCE_ACES)).to.have.length(8);
  });

  it("maps every expected id to 'variable'", () => {
    const expectedIds = [
      "set-eventvar-value",
      "add-to-eventvar",
      "subtract-from-eventvar",
      "set-boolean-eventvar",
      "toggle-boolean-eventvar",
      "compare-eventvar",
      "compare-boolean-eventvar",
      "is-boolean-eventvar-set",
    ];
    for (const id of expectedIds) {
      expect(EVENTVAR_REFERENCE_ACES[id], `id "${id}"`).to.equal("variable");
    }
  });
});

describe("isEventVarReference", () => {
  it("returns { nameParamKey: 'variable' } for each of the 8 System ids", () => {
    const ids = Object.keys(EVENTVAR_REFERENCE_ACES);
    for (const id of ids) {
      const ace = { id, objectClass: "System", parameters: { variable: "x" } };
      expect(isEventVarReference(ace), `id "${id}"`).to.deep.equal({ nameParamKey: "variable" });
    }
  });

  it("returns null for a non-System object with a known id", () => {
    const ace = { id: "set-eventvar-value", objectClass: "Sprite", parameters: { variable: "x" } };
    expect(isEventVarReference(ace)).to.be.null;
  });

  it("returns null for a System ACE with an unknown id", () => {
    const ace = { id: "compare-time", objectClass: "System", parameters: {} };
    expect(isEventVarReference(ace)).to.be.null;
  });

  it("returns null for a ScriptAction", () => {
    const ace = { type: "script", language: "typescript", script: ["x"] };
    expect(isEventVarReference(ace)).to.be.null;
  });

  it("returns null for a comment action", () => {
    const ace = { type: "comment", text: "hi" };
    expect(isEventVarReference(ace)).to.be.null;
  });

  it("returns non-null even when parameters are absent (id + objectClass match is enough)", () => {
    const ace = { id: "set-eventvar-value", objectClass: "System" };
    expect(isEventVarReference(ace)).to.deep.equal({ nameParamKey: "variable" });
  });
});

describe("getEventVarReferenceName", () => {
  it("returns the variable name for each of the 8 System ids", () => {
    const ids = Object.keys(EVENTVAR_REFERENCE_ACES);
    for (const id of ids) {
      const ace = { id, objectClass: "System", parameters: { variable: "myVar" } };
      expect(getEventVarReferenceName(ace), `id "${id}"`).to.equal("myVar");
    }
  });

  it("returns null for a non-System object", () => {
    const ace = { id: "set-eventvar-value", objectClass: "Sprite", parameters: { variable: "x" } };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });

  it("returns null for a System ACE with an unknown id", () => {
    const ace = { id: "compare-time", objectClass: "System", parameters: {} };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });

  it("returns null for a ScriptAction", () => {
    const ace = { type: "script", language: "typescript", script: ["x"] };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });

  it("returns null for a comment action", () => {
    const ace = { type: "comment", text: "hi" };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });

  it("returns null when parameters are absent", () => {
    const ace = { id: "set-eventvar-value", objectClass: "System" };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });

  it("returns null when variable key is absent from parameters", () => {
    const ace = { id: "set-eventvar-value", objectClass: "System", parameters: { value: "1" } };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });

  it("returns null when variable value is not a string", () => {
    const ace = { id: "set-eventvar-value", objectClass: "System", parameters: { variable: 42 } };
    expect(getEventVarReferenceName(ace)).to.be.null;
  });
});

// ---------------------------------------------------------------------------
// Integration test against the real fixture
// ---------------------------------------------------------------------------

describe("getEventVarReferenceName (fixture integration)", () => {
  const fixturePath = "sample-project/eventSheets/Event sheet 1.json";

  before(function () {
    if (!fixtureExists(fixturePath)) {
      this.skip();
    }
  });

  it("resolves exactly 4 event-var references across conditions and actions", () => {
    const sheet = JSON.parse(loadFixture(fixturePath)) as EventSheet;

    const names: string[] = [];
    visitEvents(sheet.events, (event) => {
      if (hasConditions(event)) {
        for (const cond of event.conditions) {
          const name = getEventVarReferenceName(cond);
          if (name !== null) names.push(name);
        }
      }
      if (hasActions(event)) {
        for (const action of event.actions) {
          const name = getEventVarReferenceName(action);
          if (name !== null) names.push(name);
        }
      }
    });

    expect(names).to.have.length(4);
    // Assert as a sorted array to stay robust against ordering changes
    expect([...names].sort()).to.deep.equal(["globalVar1", "globalVar1", "localVar1", "localVar1"]);
  });
});
