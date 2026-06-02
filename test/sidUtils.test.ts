import { expect } from "chai";
import { collectSids, collectSidsWithPaths, findSid, type EventSheet } from "../src/c3source.js";

const sheet: EventSheet = {
  name: "S",
  sid: 100,
  events: [
    {
      eventType: "block",
      conditions: [{ id: "is-visible", objectClass: "Sprite", sid: 200 }],
      actions: [
        { type: "script", language: "typescript", script: ["x()"] },
        { id: "do", objectClass: "Sprite", sid: 300 },
      ],
      sid: 201,
    },
    {
      eventType: "function-block",
      functionName: "Fn",
      functionReturnType: "none",
      functionCopyPicked: false,
      functionIsAsync: false,
      functionParameters: [{ name: "p", type: "number", initialValue: "0", sid: 400 }],
      conditions: [],
      actions: [],
      sid: 401,
    },
  ],
};

describe("collectSids", () => {
  it("collects every sid in the subtree", () => {
    expect(collectSids(sheet)).to.deep.equal(new Set([100, 200, 201, 300, 400, 401]));
  });

  it("works on an arbitrary nested JSON value", () => {
    expect(collectSids({ a: [{ sid: 1 }, { b: { sid: 2 } }] })).to.deep.equal(new Set([1, 2]));
  });
});

describe("collectSidsWithPaths", () => {
  it("pairs each sid with the path to its owning object", () => {
    const pairs = collectSidsWithPaths(sheet);
    const byPath = Object.fromEntries(pairs.map((p) => [p.sid, p.path]));
    expect(byPath[100]).to.equal(""); // sheet root
    expect(byPath[201]).to.equal("events[0]");
    expect(byPath[200]).to.equal("events[0].conditions[0]");
    expect(byPath[300]).to.equal("events[0].actions[1]");
    expect(byPath[400]).to.equal("events[1].functionParameters[0]");
  });
});

describe("findSid", () => {
  it("classifies the slot for each sid", () => {
    expect(findSid(sheet, 201)).to.deep.include({ slot: "event" });
    expect(findSid(sheet, 200)).to.deep.include({ slot: "condition" });
    expect(findSid(sheet, 300)).to.deep.include({ slot: "action" });
    expect(findSid(sheet, 400)).to.deep.include({ slot: "function-parameter" });
  });

  it("returns the enclosing event as node", () => {
    const hit = findSid(sheet, 200);
    expect(hit?.node).to.have.property("eventType", "block");
  });

  it("returns null for an unknown sid", () => {
    expect(findSid(sheet, 999)).to.equal(null);
  });
});

import { walkSids, formatSidPath, type SidPathSegment } from "../src/c3source.js";

describe("walkSids (exported)", () => {
  it("R-A2: delivers correct segment arrays", () => {
    const hits: Array<{ sid: number; segments: SidPathSegment[] }> = [];
    walkSids(sheet, (sid, segments) => hits.push({ sid, segments: [...segments] }));
    const byId = Object.fromEntries(hits.map((h) => [h.sid, h.segments]));
    expect(byId[100]).to.deep.equal([]);
    expect(byId[201]).to.deep.equal(["events", 0]);
    expect(byId[200]).to.deep.equal(["events", 0, "conditions", 0]);
  });
  it("R-A3: index segments are numbers, key segments are strings", () => {
    const hit: SidPathSegment[] = [];
    walkSids(sheet, (sid, segs) => {
      if (sid === 201) hit.push(...segs);
    });
    expect(typeof hit[0]).to.equal("string");
    expect(typeof hit[1]).to.equal("number");
  });
  it("R-A4: root delivers empty segments; formatSidPath([]) === ''", () => {
    let rootSegs: SidPathSegment[] | null = null;
    walkSids({ sid: 5 }, (_, segs) => {
      rootSegs = [...segs];
    });
    expect(rootSegs).to.deep.equal([]);
    expect(formatSidPath([])).to.equal("");
  });
  it("R-A5: formatSidPath joiner round-trip", () => {
    expect(formatSidPath(["events", 0, "conditions", 0])).to.equal("events[0].conditions[0]");
  });
});
