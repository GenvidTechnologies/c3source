import { describe, it } from "mocha";
import { expect } from "chai";
import {
  SCRIPT_SOURCE_EXTENSIONS,
  isScriptSourceName,
  isGeneratedScriptOutput,
  filterAuthoredScriptPaths,
} from "../src/c3source.js";

describe("SCRIPT_SOURCE_EXTENSIONS", () => {
  it("A1: is exactly [\".js\", \".ts\"]", () => {
    expect(SCRIPT_SOURCE_EXTENSIONS).to.deep.equal([".js", ".ts"]);
  });
});

describe("isScriptSourceName", () => {
  it("A2: returns true for .ts and .js source files", () => {
    expect(isScriptSourceName("main.ts")).to.equal(true);
    expect(isScriptSourceName("main.js")).to.equal(true);
  });

  it("A2: is case-insensitive on the extension", () => {
    expect(isScriptSourceName("MAIN.TS")).to.equal(true);
  });

  it("A2: excludes .d.ts declaration files, in either casing", () => {
    expect(isScriptSourceName("objects.d.ts")).to.equal(false);
    expect(isScriptSourceName("objects.D.TS")).to.equal(false);
  });

  it("A2: returns false for non-script files", () => {
    expect(isScriptSourceName("tsconfig.json")).to.equal(false);
    expect(isScriptSourceName("README")).to.equal(false);
  });
});

describe("isGeneratedScriptOutput", () => {
  it("A3: a .js file is generated when a same-basename .ts sibling exists", () => {
    expect(isGeneratedScriptOutput("main.js", ["main.ts"])).to.equal(true);
  });

  it("A3: a .js file is not generated when no matching .ts sibling exists", () => {
    expect(isGeneratedScriptOutput("main.js", ["other.ts"])).to.equal(false);
  });

  it("A3: a .ts file is never treated as generated, even with a same-basename .js sibling", () => {
    expect(isGeneratedScriptOutput("main.ts", ["main.js"])).to.equal(false);
  });

  it("compares sibling extensions case-insensitively", () => {
    expect(isGeneratedScriptOutput("main.js", ["MAIN.TS"])).to.equal(true);
  });
});

describe("filterAuthoredScriptPaths", () => {
  it("A4: the generated/authored comparison is scoped per directory", () => {
    const paths = ["a/main.js", "a/main.ts", "b/main.js"];
    const result = filterAuthoredScriptPaths(paths);
    expect(result).to.not.include("a/main.js");
    expect(result).to.include("b/main.js");
  });

  it("drops a generated .js and preserves input order", () => {
    const paths = ["a/one.ts", "a/main.js", "a/main.ts", "a/two.ts"];
    const result = filterAuthoredScriptPaths(paths);
    expect(result).to.deep.equal(["a/one.ts", "a/main.ts", "a/two.ts"]);
  });

  it("passes a .ts-only list through unchanged", () => {
    const paths = ["a/one.ts", "b/two.ts"];
    expect(filterAuthoredScriptPaths(paths)).to.deep.equal(paths);
  });
});
