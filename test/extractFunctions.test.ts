import { expect } from "chai";
import { extractFunctions, type EventSheet } from "../src/c3source.js";

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
      { kind: "function", name: "DoThing" },
      { kind: "custom-ace", name: "MyAction", objectClass: "MyObject" },
    ]);
  });

  it("returns [] for a sheet with no functions", () => {
    expect(extractFunctions({ name: "S", sid: 1, events: [{ eventType: "comment", text: "x" }] })).to.deep.equal([]);
  });
});
