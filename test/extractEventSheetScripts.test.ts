import { describe, it } from "mocha";
import { assert } from "chai";
import {
  type EventSheet,
  extractScriptsFromSheet,
  generateFunctionName,
  formatCondition,
  comparisonSymbol,
  COMPARISON_OPERATORS,
} from "../src/c3source.js";

describe("extractScriptsFromSheet", () => {
  it("extracts script actions from a simple block", () => {
    const sheet: EventSheet = {
      name: "TestSheet",
      events: [
        {
          eventType: "block",
          conditions: [{ id: "on-start-of-layout", objectClass: "System", sid: 1 }],
          actions: [{ type: "script", language: "typescript", script: ["console.log('hello');"] }],
          sid: 100,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.equal(results[0].sheetName, "TestSheet");
    assert.equal(results[0].eventIndex, 1);
    assert.equal(results[0].actionIndex, 1);
    assert.deepEqual(results[0].lines, ["console.log('hello');"]);
    assert.equal(results[0].humanPath, "block");
    assert.equal(results[0].conditions.length, 1);
  });

  it("collects scope variables from variable declarations", () => {
    const sheet: EventSheet = {
      name: "VarSheet",
      events: [
        {
          eventType: "variable",
          name: "myVar",
          type: "string",
          initialValue: "test",
          isStatic: false,
          isConstant: false,
          sid: 10,
        },
        {
          eventType: "variable",
          name: "count",
          type: "number",
          initialValue: "0",
          isStatic: false,
          isConstant: false,
          sid: 11,
        },
        {
          eventType: "block",
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["localVars.myVar;"] }],
          sid: 100,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].scopeVars, [
      { name: "myVar", type: "string" },
      { name: "count", type: "number" },
    ]);
    // Scope segments: one root segment with both vars
    assert.equal(results[0].scopeSegments.length, 1);
    assert.equal(results[0].scopeSegments[0].label, "root");
    assert.equal(results[0].scopeSegments[0].scopeKey, "root");
    assert.deepEqual(results[0].scopeSegments[0].vars, [
      { name: "myVar", type: "string" },
      { name: "count", type: "number" },
    ]);
  });

  it("traverses groups and builds human-readable paths", () => {
    const sheet: EventSheet = {
      name: "GroupSheet",
      events: [
        {
          eventType: "group",
          disabled: false,
          title: "MyGroup",
          isActiveOnStart: true,
          children: [
            {
              eventType: "block",
              conditions: [],
              actions: [{ type: "script", language: "typescript", script: ["// inside group"] }],
              sid: 200,
            },
          ],
          sid: 300,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.equal(results[0].humanPath, "MyGroup > block");
  });

  it("counts groups as events in C3 depth-first numbering", () => {
    const sheet: EventSheet = {
      name: "GroupCountSheet",
      events: [
        {
          eventType: "group",
          disabled: false,
          title: "OuterGroup",
          isActiveOnStart: true,
          children: [
            {
              eventType: "group",
              disabled: false,
              title: "InnerGroup",
              isActiveOnStart: true,
              children: [
                {
                  eventType: "block",
                  conditions: [],
                  actions: [],
                  sid: 100,
                },
                {
                  eventType: "block",
                  conditions: [],
                  actions: [{ type: "script", language: "typescript", script: ["// first script"] }],
                  sid: 101,
                },
              ],
              sid: 200,
            },
          ],
          sid: 300,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    // OuterGroup=1, InnerGroup=2, empty block=3, script block=4
    assert.equal(results[0].eventIndex, 4);
  });

  it("handles function-block with parameters", () => {
    const sheet: EventSheet = {
      name: "FuncSheet",
      events: [
        {
          eventType: "function-block",
          functionName: "MyFunction",
          functionReturnType: "none",
          functionCopyPicked: false,
          functionIsAsync: false,
          functionParameters: [
            { name: "param1", type: "string", initialValue: "", sid: 50 },
            { name: "param2", type: "number", initialValue: "0", sid: 51 },
          ],
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["return param1;"] }],
          sid: 400,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.equal(results[0].humanPath, "fn MyFunction");
    assert.deepEqual(results[0].scopeVars, [
      { name: "param1", type: "string" },
      { name: "param2", type: "number" },
    ]);
    // Scope segments: one params segment
    assert.equal(results[0].scopeSegments.length, 1);
    assert.equal(results[0].scopeSegments[0].label, "fn MyFunction params");
    assert.deepEqual(results[0].scopeSegments[0].vars, [
      { name: "param1", type: "string" },
      { name: "param2", type: "number" },
    ]);
  });

  it("handles custom-ace-block", () => {
    const sheet: EventSheet = {
      name: "AceSheet",
      events: [
        {
          eventType: "custom-ace-block",
          aceType: "action",
          aceName: "DoSomething",
          objectClass: "MyObject",
          functionReturnType: "none",
          functionCopyPicked: false,
          functionIsAsync: false,
          functionParameters: [{ name: "key", type: "string", initialValue: "", sid: 60 }],
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["// ace action"] }],
          sid: 500,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.equal(results[0].humanPath, "MyObject.DoSomething");
  });

  it("skips non-script actions", () => {
    const sheet: EventSheet = {
      name: "MixedSheet",
      events: [
        {
          eventType: "block",
          conditions: [],
          actions: [
            { id: "set-text", objectClass: "TextObj", sid: 70, parameters: { text: "hello" } },
            { type: "script", language: "typescript", script: ["// only this"] },
            { id: "set-visible", objectClass: "SpriteObj", sid: 71, parameters: {} },
          ],
          sid: 600,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.equal(results[0].actionIndex, 2); // 1-indexed, second action
  });

  it("extracts multiple script actions from a single block with correct indices", () => {
    const sheet: EventSheet = {
      name: "MultiScriptSheet",
      events: [
        {
          eventType: "block",
          conditions: [],
          actions: [
            { type: "script", language: "typescript", script: ["// first script"] },
            { id: "set-text", objectClass: "TextObj", sid: 70, parameters: { text: "hello" } },
            { type: "script", language: "typescript", script: ["// second script"] },
          ],
          sid: 100,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 2);
    assert.equal(results[0].actionIndex, 1);
    assert.deepEqual(results[0].lines, ["// first script"]);
    assert.equal(results[1].actionIndex, 3); // non-script action in between
    assert.deepEqual(results[1].lines, ["// second script"]);
    // Both share the same event index
    assert.equal(results[0].eventIndex, results[1].eventIndex);
  });

  it("counts events correctly with nested children", () => {
    const sheet: EventSheet = {
      name: "NestedSheet",
      events: [
        {
          eventType: "block",
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["// event 1"] }],
          sid: 100,
          children: [
            {
              eventType: "block",
              conditions: [],
              actions: [{ type: "script", language: "typescript", script: ["// event 2"] }],
              sid: 101,
            },
          ],
        },
        {
          eventType: "block",
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["// event 3"] }],
          sid: 102,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 3);
    assert.equal(results[0].eventIndex, 1);
    assert.equal(results[1].eventIndex, 2); // child of event 1
    assert.equal(results[2].eventIndex, 3);
  });

  it("skips comments and includes", () => {
    const sheet: EventSheet = {
      name: "SkipSheet",
      events: [
        { eventType: "comment", text: "This is a comment" },
        { eventType: "include", includeSheet: "OtherSheet" },
        {
          eventType: "block",
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["// only block"] }],
          sid: 100,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.equal(results[0].eventIndex, 1);
  });

  it("inherits scope variables through group nesting", () => {
    const sheet: EventSheet = {
      name: "ScopeSheet",
      events: [
        {
          eventType: "variable",
          name: "outerVar",
          type: "string",
          initialValue: "",
          isStatic: false,
          isConstant: false,
          sid: 10,
        },
        {
          eventType: "group",
          disabled: false,
          title: "Inner",
          isActiveOnStart: true,
          children: [
            {
              eventType: "variable",
              name: "innerVar",
              type: "number",
              initialValue: "0",
              isStatic: false,
              isConstant: false,
              sid: 11,
            },
            {
              eventType: "block",
              conditions: [],
              actions: [{ type: "script", language: "typescript", script: ["// nested"] }],
              sid: 200,
            },
          ],
          sid: 300,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].scopeVars, [
      { name: "outerVar", type: "string" },
      { name: "innerVar", type: "number" },
    ]);
    // Scope segments: root vars + group vars
    assert.equal(results[0].scopeSegments.length, 2);
    assert.equal(results[0].scopeSegments[0].label, "root");
    assert.deepEqual(results[0].scopeSegments[0].vars, [{ name: "outerVar", type: "string" }]);
    assert.equal(results[0].scopeSegments[1].label, 'group "Inner"');
    assert.equal(results[0].scopeSegments[1].scopeKey, 'root > group "Inner"');
    assert.deepEqual(results[0].scopeSegments[1].vars, [{ name: "innerVar", type: "number" }]);
  });

  it("collects variables declared after blocks at the same level", () => {
    const sheet: EventSheet = {
      name: "LateVarSheet",
      events: [
        {
          eventType: "group",
          disabled: false,
          title: "MyGroup",
          isActiveOnStart: true,
          children: [
            {
              eventType: "variable",
              name: "earlyVar",
              type: "number",
              initialValue: "0",
              isStatic: false,
              isConstant: false,
              sid: 10,
            },
            {
              eventType: "function-block",
              functionName: "myFunc",
              functionReturnType: "none",
              functionCopyPicked: false,
              functionIsAsync: false,
              functionParameters: [],
              conditions: [],
              actions: [{ type: "script", language: "typescript", script: ["localVars.lateVar;"] }],
              sid: 200,
            },
            {
              eventType: "variable",
              name: "lateVar",
              type: "string",
              initialValue: "",
              isStatic: false,
              isConstant: false,
              sid: 11,
            },
          ],
          sid: 300,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].scopeVars, [
      { name: "earlyVar", type: "number" },
      { name: "lateVar", type: "string" },
    ]);
  });

  it("builds multi-level scope segments (root + group + fn params + fn body vars)", () => {
    const sheet: EventSheet = {
      name: "MultiScope",
      events: [
        {
          eventType: "variable",
          name: "rootVar",
          type: "string",
          initialValue: "",
          isStatic: false,
          isConstant: false,
          sid: 10,
        },
        {
          eventType: "group",
          disabled: false,
          title: "MyGroup",
          isActiveOnStart: true,
          children: [
            {
              eventType: "variable",
              name: "groupVar",
              type: "number",
              initialValue: "0",
              isStatic: false,
              isConstant: false,
              sid: 11,
            },
            {
              eventType: "function-block",
              functionName: "myFunc",
              functionReturnType: "none",
              functionCopyPicked: false,
              functionIsAsync: false,
              functionParameters: [{ name: "param1", type: "string", initialValue: "", sid: 50 }],
              conditions: [],
              actions: [],
              sid: 200,
              children: [
                {
                  eventType: "variable",
                  name: "bodyVar",
                  type: "boolean",
                  initialValue: "false",
                  isStatic: false,
                  isConstant: false,
                  sid: 12,
                },
                {
                  eventType: "block",
                  conditions: [],
                  actions: [{ type: "script", language: "typescript", script: ["// inside fn"] }],
                  sid: 300,
                },
              ],
            },
          ],
          sid: 400,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);

    // 4 segments: root, group, fn params, fn body
    assert.equal(results[0].scopeSegments.length, 4);

    assert.equal(results[0].scopeSegments[0].label, "root");
    assert.deepEqual(results[0].scopeSegments[0].vars, [{ name: "rootVar", type: "string" }]);

    assert.equal(results[0].scopeSegments[1].label, 'group "MyGroup"');
    assert.equal(results[0].scopeSegments[1].scopeKey, 'root > group "MyGroup"');
    assert.deepEqual(results[0].scopeSegments[1].vars, [{ name: "groupVar", type: "number" }]);

    assert.equal(results[0].scopeSegments[2].label, "fn myFunc params");
    assert.equal(results[0].scopeSegments[2].scopeKey, 'root > group "MyGroup" > fn myFunc params');
    assert.deepEqual(results[0].scopeSegments[2].vars, [{ name: "param1", type: "string" }]);

    assert.equal(results[0].scopeSegments[3].label, "fn myFunc");
    assert.equal(results[0].scopeSegments[3].scopeKey, 'root > group "MyGroup" > fn myFunc');
    assert.deepEqual(results[0].scopeSegments[3].vars, [{ name: "bodyVar", type: "boolean" }]);

    // Flat scopeVars matches all segments combined
    assert.deepEqual(results[0].scopeVars, [
      { name: "rootVar", type: "string" },
      { name: "groupVar", type: "number" },
      { name: "param1", type: "string" },
      { name: "bodyVar", type: "boolean" },
    ]);
  });

  it("omits empty scope segments", () => {
    const sheet: EventSheet = {
      name: "EmptyScope",
      events: [
        {
          // Group with no variables — should not create a segment
          eventType: "group",
          disabled: false,
          title: "EmptyGroup",
          isActiveOnStart: true,
          children: [
            {
              eventType: "block",
              conditions: [],
              actions: [{ type: "script", language: "typescript", script: ["// hi"] }],
              sid: 100,
            },
          ],
          sid: 200,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    // No root vars, no group vars → empty segments
    assert.equal(results[0].scopeSegments.length, 0);
    assert.deepEqual(results[0].scopeVars, []);
  });

  it("returns empty scopeSegments for blocks with no scope", () => {
    const sheet: EventSheet = {
      name: "NoScope",
      events: [
        {
          eventType: "block",
          conditions: [],
          actions: [{ type: "script", language: "typescript", script: ["// hi"] }],
          sid: 100,
        },
      ],
      sid: 999,
    };

    const results = extractScriptsFromSheet(sheet);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].scopeSegments, []);
    assert.deepEqual(results[0].scopeVars, []);
  });
});

describe("generateFunctionName", () => {
  it("generates function name from sheet name and indices", () => {
    assert.equal(generateFunctionName("RegenerationEvents", 3, 1), "RegenerationEvents_Event3_Act1");
  });

  it("sanitizes non-alphanumeric characters to underscores", () => {
    assert.equal(generateFunctionName("My Sheet Name", 1, 2), "My_Sheet_Name_Event1_Act2");
  });

  it("collapses multiple consecutive non-alphanumeric chars", () => {
    assert.equal(generateFunctionName("foo--bar", 1, 1), "foo_bar_Event1_Act1");
  });

  it("handles sheet name starting with a digit", () => {
    const result = generateFunctionName("123Sheet", 1, 1);
    assert.match(result, /^[a-zA-Z_]/);
    assert.include(result, "123Sheet");
    assert.include(result, "Event1_Act1");
  });

  it("falls back to 'Sheet' for completely non-alphanumeric name", () => {
    assert.equal(generateFunctionName("---", 1, 1), "Sheet_Event1_Act1");
  });
});

describe("formatCondition", () => {
  it("formats a simple condition", () => {
    const result = formatCondition({
      id: "on-start-of-layout",
      objectClass: "System",
      sid: 1,
    });
    assert.equal(result, "System.on-start-of-layout()");
  });

  it("formats a condition with parameters", () => {
    const result = formatCondition({
      id: "compare-two-values",
      objectClass: "System",
      sid: 2,
      parameters: { "first-value": "x", comparison: 0, "second-value": "y" },
    });
    assert.equal(result, "System.compare-two-values(first-value=x, comparison=0, second-value=y)");
  });

  it("formats an inverted condition", () => {
    const result = formatCondition({
      id: "is-visible",
      objectClass: "Sprite",
      sid: 3,
      isInverted: true,
    });
    assert.equal(result, "NOT Sprite.is-visible()");
  });

  it("prefixes a disabled condition with [DISABLED]", () => {
    const result = formatCondition({
      id: "on-start-of-layout",
      objectClass: "System",
      sid: 4,
      disabled: true,
    });
    assert.equal(result, "[DISABLED] System.on-start-of-layout()");
  });

  it("combines [DISABLED] and NOT prefixes", () => {
    const result = formatCondition({
      id: "is-visible",
      objectClass: "Sprite",
      sid: 5,
      disabled: true,
      isInverted: true,
    });
    assert.equal(result, "[DISABLED] NOT Sprite.is-visible()");
  });
});

describe("comparisonSymbol", () => {
  it("maps 0 to '='", () => {
    assert.equal(comparisonSymbol(0), "=");
  });

  it("maps 1 to '≠'", () => {
    assert.equal(comparisonSymbol(1), "≠");
  });

  it("maps 2 to '<'", () => {
    assert.equal(comparisonSymbol(2), "<");
  });

  it("maps 3 to '≤'", () => {
    assert.equal(comparisonSymbol(3), "≤");
  });

  it("maps 4 to '>'", () => {
    assert.equal(comparisonSymbol(4), ">");
  });

  it("maps 5 to '≥'", () => {
    assert.equal(comparisonSymbol(5), "≥");
  });

  it("returns undefined for out-of-range value 6", () => {
    assert.isUndefined(comparisonSymbol(6));
  });

  it("returns undefined for out-of-range value -1", () => {
    assert.isUndefined(comparisonSymbol(-1));
  });

  it("COMPARISON_OPERATORS has exactly 6 entries (0–5)", () => {
    assert.deepEqual(
      Object.keys(COMPARISON_OPERATORS)
        .map(Number)
        .sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5],
    );
  });
});
