import { expect } from "chai";
import { extractIncludes, type EventSheet } from "../src/c3source.js";

describe("extractIncludes", () => {
  it("collects includeSheet values with their jsonPath, in event order", () => {
    const sheet: EventSheet = {
      name: "S",
      sid: 1,
      events: [
        { eventType: "include", includeSheet: "Alpha" },
        { eventType: "comment", text: "x" },
        { eventType: "include", includeSheet: "Beta" },
      ],
    };
    expect(extractIncludes(sheet)).to.deep.equal([
      { includeSheet: "Alpha", jsonPath: "events[0]" },
      { includeSheet: "Beta", jsonPath: "events[2]" },
    ]);
  });

  it("reaches includes nested inside groups and blocks", () => {
    const sheet: EventSheet = {
      name: "S",
      sid: 1,
      events: [
        {
          eventType: "group",
          title: "G",
          disabled: false,
          isActiveOnStart: true,
          sid: 10,
          children: [{ eventType: "include", includeSheet: "Nested" }],
        },
      ],
    };
    expect(extractIncludes(sheet)).to.deep.equal([
      { includeSheet: "Nested", jsonPath: "events[0].children[0]" },
    ]);
  });

  it("returns [] when the sheet has no includes", () => {
    expect(extractIncludes({ name: "S", sid: 1, events: [{ eventType: "comment", text: "x" }] })).to.deep.equal([]);
  });
});
