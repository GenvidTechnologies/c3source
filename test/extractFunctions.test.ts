import { expect } from "chai";
import { extractFunctions, isFunctionDefinition, type EventSheet, type EventSheetEvent } from "../src/c3source.js";

describe("extractFunctions", () => {
  it("lists function-blocks and custom-ace-blocks in event order", () => {
    const sheet: EventSheet = {
      name: "S",
      sid: 1,
      events: [
        {
          eventType: "function-block",
          functionName: "DoThing",
          functionReturnType: "none",
          functionCopyPicked: false,
          functionIsAsync: false,
          functionParameters: [],
          conditions: [],
          actions: [],
          sid: 10,
        },
        {
          eventType: "custom-ace-block",
          aceType: "action",
          aceName: "MyAction",
          objectClass: "MyObject",
          functionReturnType: "none",
          functionCopyPicked: false,
          functionIsAsync: false,
          functionParameters: [],
          conditions: [],
          actions: [],
          sid: 11,
        },
      ],
    };
    expect(extractFunctions(sheet)).to.deep.equal([
      { kind: "function", name: "DoThing", params: [], returnType: "none" },
      { kind: "custom-ace", name: "MyAction", objectClass: "MyObject", params: [], returnType: "none" },
    ]);
  });

  it("surfaces the function signature (params + returnType)", () => {
    const params = [
      { name: "count", type: "number" as const, initialValue: "0", sid: 100 },
      { name: "label", type: "string" as const, initialValue: "", comment: "the label", sid: 101 },
    ];
    const sheet: EventSheet = {
      name: "S",
      sid: 1,
      events: [
        {
          eventType: "function-block",
          functionName: "Compute",
          functionReturnType: "number",
          functionCopyPicked: false,
          functionIsAsync: false,
          functionParameters: params,
          conditions: [],
          actions: [],
          sid: 10,
        },
      ],
    };
    expect(extractFunctions(sheet)).to.deep.equal([
      { kind: "function", name: "Compute", params, returnType: "number" },
    ]);
  });

  it("returns [] for a sheet with no functions", () => {
    expect(extractFunctions({ name: "S", sid: 1, events: [{ eventType: "comment", text: "x" }] })).to.deep.equal([]);
  });
});

describe("isFunctionDefinition", () => {
  const fnBlock: EventSheetEvent = {
    eventType: "function-block",
    functionName: "F",
    functionReturnType: "none",
    functionCopyPicked: false,
    functionIsAsync: false,
    functionParameters: [],
    conditions: [],
    actions: [],
    sid: 1,
  };
  const aceBlock: EventSheetEvent = {
    eventType: "custom-ace-block",
    aceType: "action",
    aceName: "A",
    objectClass: "O",
    functionReturnType: "none",
    functionCopyPicked: false,
    functionIsAsync: false,
    functionParameters: [],
    conditions: [],
    actions: [],
    sid: 2,
  };

  it("is true for function-block and custom-ace-block events", () => {
    expect(isFunctionDefinition(fnBlock)).to.equal(true);
    expect(isFunctionDefinition(aceBlock)).to.equal(true);
  });

  it("is false for other event kinds", () => {
    expect(isFunctionDefinition({ eventType: "comment", text: "x" })).to.equal(false);
    expect(isFunctionDefinition({ eventType: "include", includeSheet: "Other" })).to.equal(false);
  });
});
