import { expect } from "chai";
import {
  extractScriptsFromSheet,
  visitEvents,
  type EventSheet,
  type EventSheetEvent,
  type EventVisitContext,
} from "../src/c3source.js";

/** A block holding a single typescript script action whose first line is `tag`. */
function scriptBlock(tag: string, children?: EventSheetEvent[]): EventSheetEvent {
  return {
    eventType: "block",
    conditions: [],
    actions: [{ type: "script", language: "typescript", script: [tag] }],
    sid: tag.charCodeAt(0),
    ...(children ? { children } : {}),
  };
}

// Fixture exercising counting + non-counting events at multiple depths:
//   events[0] comment              -> eventNumber null,  depth 0
//   events[1] variable             -> eventNumber null,  depth 0
//   events[2] group "Outer"        -> eventNumber 1,     depth 0
//     .children[0] block (A)       -> eventNumber 2,     depth 1
//       .children[0] block (B)     -> eventNumber 3,     depth 2
//   events[3] block (C)            -> eventNumber 4,     depth 0
const SHEET: EventSheet = {
  name: "Sheet 1",
  sid: 1,
  events: [
    { eventType: "comment", text: "hello" },
    { eventType: "variable", name: "v", type: "number", initialValue: "0", isStatic: false, isConstant: false, sid: 99 },
    {
      eventType: "group",
      title: "Outer",
      disabled: false,
      isActiveOnStart: true,
      sid: 10,
      children: [scriptBlock("A", [scriptBlock("B")])],
    },
    scriptBlock("C"),
  ],
};

/** Collect (eventType, eventNumber, jsonPath, depth) for every visited event, in order. */
function collect(sheet: EventSheet): Array<{ type: string; num: number | null; path: string; depth: number }> {
  const out: Array<{ type: string; num: number | null; path: string; depth: number }> = [];
  visitEvents(sheet.events, (e, ctx: EventVisitContext) => {
    out.push({ type: e.eventType, num: ctx.eventNumber, path: ctx.jsonPath, depth: ctx.depth });
  });
  return out;
}

describe("visitEvents canonical counter", () => {
  it("assigns pinned eventNumbers pre-order, null for non-counting events", () => {
    const visited = collect(SHEET);
    expect(visited).to.deep.equal([
      { type: "comment", num: null, path: "events[0]", depth: 0 },
      { type: "variable", num: null, path: "events[1]", depth: 0 },
      { type: "group", num: 1, path: "events[2]", depth: 0 },
      { type: "block", num: 2, path: "events[2].children[0]", depth: 1 },
      { type: "block", num: 3, path: "events[2].children[0].children[0]", depth: 2 },
      { type: "block", num: 4, path: "events[3]", depth: 0 },
    ]);
  });

  it("eventNumber agrees with extractScriptsFromSheet eventIndex for every script block", () => {
    // Map each script block's tag -> the eventNumber visitEvents assigns.
    const numByTag = new Map<string, number | null>();
    visitEvents(SHEET.events, (e, ctx) => {
      if (e.eventType === "block") {
        const action = e.actions.find((a) => "type" in a && (a as { type?: unknown }).type === "script") as
          | { script: string[] }
          | undefined;
        if (action) numByTag.set(action.script[0], ctx.eventNumber);
      }
    });

    const scripts = extractScriptsFromSheet(SHEET);
    expect(scripts.map((s) => s.lines[0]).sort()).to.deep.equal(["A", "B", "C"]);
    for (const s of scripts) {
      expect(s.eventIndex, `eventIndex for script ${s.lines[0]}`).to.equal(numByTag.get(s.lines[0]));
    }
    // And the pinned absolute values.
    const byTag = Object.fromEntries(scripts.map((s) => [s.lines[0], s.eventIndex]));
    expect(byTag).to.deep.equal({ A: 2, B: 3, C: 4 });
  });

  it("returning false stops descent into that node's children only; siblings still visited", () => {
    const visited: string[] = [];
    visitEvents(SHEET.events, (e, ctx) => {
      visited.push(ctx.jsonPath);
      if (e.eventType === "group") return false; // skip Outer's subtree
    });
    // Outer (events[2]) is visited, its children are NOT, but sibling block C (events[3]) IS.
    expect(visited).to.deep.equal(["events[0]", "events[1]", "events[2]", "events[3]"]);
  });
});
