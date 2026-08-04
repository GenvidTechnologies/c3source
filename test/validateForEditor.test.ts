import { describe, it } from "mocha";
import { expect } from "chai";
import {
  type EventSheet,
  type EventSheetEvent,
  type EventSheetVariable,
  type GroupEvent,
  type BlockEvent,
  type CustomAceBlockEvent,
  EDITOR_FIELD_RULES,
  validateEventForEditor,
  validateForEditor,
} from "../src/c3source.js";

// Minimal valid EventSheetVariable (comment intentionally omitted where testing that case)
function makeVariable(overrides: Partial<EventSheetVariable> = {}): EventSheetVariable {
  return {
    eventType: "variable",
    name: "myVar",
    type: "number",
    initialValue: "0",
    isStatic: false,
    isConstant: false,
    sid: 1,
    ...overrides,
  };
}

// Minimal valid GroupEvent (description intentionally omitted where testing that case)
function makeGroup(overrides: Partial<GroupEvent> & { children?: EventSheetEvent[] } = {}): GroupEvent {
  return {
    eventType: "group",
    disabled: false,
    title: "TestGroup",
    isActiveOnStart: true,
    children: [],
    sid: 2,
    ...overrides,
  };
}

// Minimal valid CustomAceBlockEvent. `aceName` is typed non-optional, so omitting it
// requires a cast — which is the point: this rule guards runtime data (a sheet parsed
// from disk, or an event built as a loose Record), where the type is an assertion and
// not a guarantee.
function makeCustomAce(overrides: Partial<CustomAceBlockEvent> = {}): CustomAceBlockEvent {
  return {
    eventType: "custom-ace-block",
    aceType: "action",
    aceName: "OnClickAction",
    objectClass: "NavButton",
    functionReturnType: "none",
    functionCopyPicked: true,
    functionIsAsync: false,
    functionParameters: [],
    conditions: [],
    actions: [],
    sid: 3,
    ...overrides,
  };
}

// Minimal valid BlockEvent with optional children
function makeBlock(children?: EventSheetEvent[]): BlockEvent {
  return {
    eventType: "block",
    conditions: [],
    actions: [],
    sid: 100,
    ...(children !== undefined ? { children } : {}),
  };
}

describe("EDITOR_FIELD_RULES", () => {
  it("is exported and contains every expected rule id", () => {
    const ruleIds = EDITOR_FIELD_RULES.map((r) => r.rule);
    expect(ruleIds).to.include("eventvar-comment-required");
    expect(ruleIds).to.include("group-description-required");
    expect(ruleIds).to.include("custom-ace-name-required");
    expect(EDITOR_FIELD_RULES.length).to.be.at.least(3);
  });

  // #70: functionDescription is present on every function-block in the corpus and is
  // still optional — C3 loads without it and does not restore it on save. Asserting
  // its absence keeps a future author from "completing" the table from the corpus's
  // always-present field list, which is a hypothesis generator, not a rule list.
  it("does not table function-block.functionDescription, which C3 accepts as absent", () => {
    const ruleIds = EDITOR_FIELD_RULES.map((r) => r.rule);
    expect(ruleIds).to.not.include("function-description-required");
    expect(EDITOR_FIELD_RULES.filter((r) => r.eventType === "function-block")).to.have.length(0);
  });
});

describe("validateEventForEditor", () => {
  it("returns one issue for a variable missing comment", () => {
    const event = makeVariable(); // no comment field
    const issues = validateEventForEditor(event, "events[0]");
    expect(issues).to.have.length(1);
    expect(issues[0].rule).to.equal("eventvar-comment-required");
    expect(issues[0].path).to.equal("events[0]");
    expect(issues[0].message).to.be.a("string").and.not.be.empty;
  });

  it("returns no issue for a variable with comment: empty string", () => {
    const event = makeVariable({ comment: "" });
    const issues = validateEventForEditor(event, "events[0]");
    expect(issues).to.have.length(0);
  });

  it("returns no issue for a variable with comment: non-empty string", () => {
    const event = makeVariable({ comment: "x" });
    const issues = validateEventForEditor(event, "events[0]");
    expect(issues).to.have.length(0);
  });

  it("returns one issue for a group missing description", () => {
    const event = makeGroup(); // no description field
    const issues = validateEventForEditor(event, "events[1]");
    expect(issues).to.have.length(1);
    expect(issues[0].rule).to.equal("group-description-required");
    expect(issues[0].path).to.equal("events[1]");
  });

  it("returns no issue for a group with description", () => {
    const event = makeGroup({ description: "some desc" });
    const issues = validateEventForEditor(event, "events[1]");
    expect(issues).to.have.length(0);
  });

  // #70, verified against the C3 editor: removing aceName makes C3 refuse the whole
  // project with "Failed to open project. Check it is a valid Construct 3 folder
  // project." — naming no field, which is why reporting the path here is worth having.
  it("returns one issue for a custom-ace-block missing aceName", () => {
    const event = { ...makeCustomAce(), aceName: undefined } as unknown as EventSheetEvent;
    const issues = validateEventForEditor(event, "events[2]");
    expect(issues).to.have.length(1);
    expect(issues[0].rule).to.equal("custom-ace-name-required");
    expect(issues[0].path).to.equal("events[2]");
    expect(issues[0].message).to.be.a("string").and.not.be.empty;
  });

  it("returns no issue for a custom-ace-block with aceName", () => {
    const issues = validateEventForEditor(makeCustomAce(), "events[2]");
    expect(issues).to.have.length(0);
  });

  // Consistent with the other rules: the check is typeof === "string", so an empty
  // string passes. Only undefined/non-string is flagged.
  it("returns no issue for a custom-ace-block with aceName: empty string", () => {
    const issues = validateEventForEditor(makeCustomAce({ aceName: "" }), "events[2]");
    expect(issues).to.have.length(0);
  });

  it("uses default jsonPath 'event' when no path is provided", () => {
    const event = makeVariable(); // missing comment
    const issues = validateEventForEditor(event);
    expect(issues).to.have.length(1);
    expect(issues[0].path).to.equal("event");
  });

  it("returns no issues for a block event (no applicable rules)", () => {
    const event = makeBlock();
    const issues = validateEventForEditor(event, "events[0]");
    expect(issues).to.have.length(0);
  });
});

describe("validateForEditor", () => {
  it("returns empty array for a fully-valid sheet", () => {
    const sheet: EventSheet = {
      name: "CleanSheet",
      events: [makeVariable({ comment: "" }), makeGroup({ description: "ok" }), makeBlock()],
      sid: 999,
    };
    const issues = validateForEditor(sheet);
    expect(issues).to.deep.equal([]);
  });

  it("detects a variable missing comment at top level", () => {
    const sheet: EventSheet = {
      name: "VarSheet",
      events: [makeVariable()],
      sid: 999,
    };
    const issues = validateForEditor(sheet);
    expect(issues).to.have.length(1);
    expect(issues[0].rule).to.equal("eventvar-comment-required");
    expect(issues[0].path).to.equal("events[0]");
  });

  it("detects a group missing description at top level", () => {
    const sheet: EventSheet = {
      name: "GroupSheet",
      events: [makeBlock(), makeGroup()],
      sid: 999,
    };
    const issues = validateForEditor(sheet);
    expect(issues).to.have.length(1);
    expect(issues[0].rule).to.equal("group-description-required");
    expect(issues[0].path).to.equal("events[1]");
  });

  it("detects nested variable/group inside children, path reflects nesting", () => {
    // block at events[0], with a variable at children[0] and group at children[1]
    const block = makeBlock([makeVariable(), makeGroup()]);
    const sheet: EventSheet = {
      name: "NestedSheet",
      events: [block],
      sid: 999,
    };
    const issues = validateForEditor(sheet);
    // variable missing comment -> events[0].children[0]
    // group missing description -> events[0].children[1]
    expect(issues).to.have.length(2);

    const varIssue = issues.find((i) => i.rule === "eventvar-comment-required");
    expect(varIssue).to.exist;
    expect(varIssue!.path).to.equal("events[0].children[0]");

    const groupIssue = issues.find((i) => i.rule === "group-description-required");
    expect(groupIssue).to.exist;
    expect(groupIssue!.path).to.equal("events[0].children[1]");
  });

  it("collects issues from multiple events, reporting each separately", () => {
    const sheet: EventSheet = {
      name: "MultiIssueSheet",
      events: [makeVariable(), makeGroup(), makeVariable({ name: "v2", sid: 3 })],
      sid: 999,
    };
    const issues = validateForEditor(sheet);
    expect(issues).to.have.length(3);
    expect(issues[0].rule).to.equal("eventvar-comment-required");
    expect(issues[0].path).to.equal("events[0]");
    expect(issues[1].rule).to.equal("group-description-required");
    expect(issues[1].path).to.equal("events[1]");
    expect(issues[2].rule).to.equal("eventvar-comment-required");
    expect(issues[2].path).to.equal("events[2]");
  });
});
