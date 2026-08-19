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
import { loadFixtureProject, fixtureProjectAvailable } from "./fixtureHelpers.js";

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("EVENTVAR_REFERENCE_ACES", () => {
  it("exports a record with 8 entries", () => {
    expect(Object.keys(EVENTVAR_REFERENCE_ACES)).to.have.length(8);
  });

  it("does not table the fabricated id 'is-boolean-eventvar-set'", () => {
    expect(EVENTVAR_REFERENCE_ACES).to.not.have.property("is-boolean-eventvar-set");
  });

  it("maps every expected id to 'variable'", () => {
    const expectedIds = [
      "set-eventvar-value",
      "add-to-eventvar",
      "subtract-from-eventvar",
      "reset-eventvar",
      "set-boolean-eventvar",
      "toggle-boolean-eventvar",
      "compare-eventvar",
      "compare-boolean-eventvar",
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

  it("returns { nameParamKey: 'variable' } for reset-eventvar", () => {
    const ace = { id: "reset-eventvar", objectClass: "System", parameters: { variable: "languageCount" } };
    expect(isEventVarReference(ace)).to.deep.equal({ nameParamKey: "variable" });
  });

  it("returns null for reset-eventvar on a non-System object", () => {
    const ace = { id: "reset-eventvar", objectClass: "MyPlugin", parameters: { variable: "languageCount" } };
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

  it("returns the variable name for reset-eventvar", () => {
    const ace = { id: "reset-eventvar", objectClass: "System", parameters: { variable: "languageCount" } };
    expect(getEventVarReferenceName(ace)).to.equal("languageCount");
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
  const SHEET_1 = "eventSheets/Gameplay/Event sheet 1.json";

  before(function () {
    if (!fixtureProjectAvailable(SHEET_1)) {
      this.skip();
    }
  });

  it("resolves exactly 3 event-var references across conditions and actions", () => {
    const sheet = JSON.parse(loadFixtureProject(SHEET_1)) as EventSheet;

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

    // construct3-sample "Add a cross-domain event-variable reference" (v1.0.0+) added a
    // set-eventvar-value action on the root-level "score" variable, alongside the
    // pre-existing compare-eventvar/add-to-eventvar pair on "temp".
    expect(names).to.have.length(3);
    // Assert as a sorted array to stay robust against ordering changes
    expect([...names].sort()).to.deep.equal(["score", "temp", "temp"]);
  });
});

describe("getEventVarReferenceName (boolean event variable, fixture integration)", () => {
  const SHEET_2 = "eventSheets/UI/Event sheet 2.json";

  before(function () {
    if (!fixtureProjectAvailable(SHEET_2)) {
      this.skip();
    }
  });

  // compare-boolean-eventvar is the id C3 actually emits for a boolean event variable —
  // the table once carried a fabricated `is-boolean-eventvar-set` alongside it (#68).
  // The golden gained this construct in construct3-sample v0.6.0 so the real id is
  // exercised against editor-written bytes, not only against hand-built objects.
  it("resolves the compare-boolean-eventvar reference to its declared variable", () => {
    const sheet = JSON.parse(loadFixtureProject(SHEET_2)) as EventSheet;

    const declared: string[] = [];
    const refs: string[] = [];
    visitEvents(sheet.events, (event) => {
      if (event.eventType === "variable") declared.push(event.name);
      if (hasConditions(event)) {
        for (const cond of event.conditions) {
          // Scoped to compare-boolean-eventvar specifically: construct3-sample v1.0.0+ added a
          // sibling compare-eventvar (on "score", a cross-domain reference into Event sheet 1)
          // to this same sheet, which getEventVarReferenceName resolves too but which is out of
          // scope for a test named after the boolean-eventvar id.
          if (cond.id !== "compare-boolean-eventvar") continue;
          const name = getEventVarReferenceName(cond);
          if (name !== null) refs.push(name);
        }
      }
    });

    expect(refs).to.deep.equal(["isActive"]);
    // The reference resolves to a variable declared in the same sheet — a dangling
    // reference here would mean the golden itself drifted.
    expect(declared).to.include("isActive");
  });
});
