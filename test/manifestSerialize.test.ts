import { describe, it, before } from "mocha";
import { expect } from "chai";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  C3_JSON_INDENT,
  serializeC3Json,
  isEditorLocalPath,
  readProjectManifest,
  serializeProjectManifest,
  writeProjectManifest,
  type C3ProjectManifest,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

const FIXTURE_DIR = fixtureProjectPath();

/** The one documented brush-serialization exception (#57 design): C3 writes
 *  `*.brush.json` minified, unlike every other project-source JSON file. Excluded
 *  by exact path, not by broadening the editor-local classifier — a `.brush.json`
 *  file genuinely IS project source, it is just minified. */
const BRUSH_EXCEPTION = path.join(FIXTURE_DIR, "tilemapBrushes", "objectTypes", "tiles", "Tilemap.brush.json");

/**
 * Walk `dir` recursively, collecting every `.json`/`.c3proj` file, classified as
 * editor-local (per `isEditorLocalPath`) inheritably down the directory chain: a
 * file under an editor-local ancestor directory (e.g. anything under `uistate/`)
 * is editor-local even though its own basename would not otherwise match.
 */
function collectProjectJsonFiles(dir: string, ancestorEditorLocal: boolean): { kept: string[]; skipped: string[] } {
  const kept: string[] = [];
  const skipped: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const editorLocalHere = ancestorEditorLocal || isEditorLocalPath(name);
    if (statSync(full).isDirectory()) {
      const sub = collectProjectJsonFiles(full, editorLocalHere);
      kept.push(...sub.kept);
      skipped.push(...sub.skipped);
    } else if (name.endsWith(".json") || name.endsWith(".c3proj")) {
      (editorLocalHere ? skipped : kept).push(full);
    }
  }
  return { kept, skipped };
}

describe("serializeC3Json", () => {
  it("T9: C3_JSON_INDENT is a single tab", () => {
    expect(C3_JSON_INDENT).to.equal("\t");
  });

  it("T9: serializes with tab-newline indentation and no trailing newline", () => {
    const out = serializeC3Json({ a: 1, b: { c: 2 } });
    expect(out.endsWith("}")).to.equal(true);
    expect(out).to.include("\n\t");
    expect(out.endsWith("\n")).to.equal(false);
  });
});

describe("serializeC3Json — canonical fixture corpus round-trip", () => {
  before(function () {
    if (!fixtureProjectExists()) return this.skip();
  });

  it("T7: every non-editor-local .json/.c3proj file round-trips byte-for-byte, except the documented Tilemap.brush.json exception", () => {
    const { kept, skipped } = collectProjectJsonFiles(FIXTURE_DIR, false);

    // Figures re-derived at implementation time (2026-07-29) against the pinned
    // construct3-sample submodule: 38 total, 12 skipped as editor-local, 26 kept
    // (25 round-trip + 1 documented brush.json exception). Asserted explicitly so
    // a future fixture-pin bump that changes the set is caught, not silently
    // under-covered.
    expect(kept.length + skipped.length).to.equal(38);
    expect(skipped.length).to.equal(12);
    expect(kept.length).to.equal(26);

    const exceptions = kept.filter((f) => f === BRUSH_EXCEPTION);
    expect(exceptions.length).to.equal(1);

    const roundtripped = kept.filter((f) => f !== BRUSH_EXCEPTION);
    expect(roundtripped.length).to.equal(25);

    for (const file of roundtripped) {
      const text = readFileSync(file, "utf-8");
      expect(serializeC3Json(JSON.parse(text)), file).to.equal(text);
      expect(text.endsWith("\n"), `${file} must not end with a trailing newline`).to.equal(false);
    }
  });
});

describe("serializeProjectManifest / writeProjectManifest (#57)", () => {
  const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");

  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
  });

  it("T1: serializeProjectManifest(readProjectManifest(P)) reproduces project.c3proj byte-for-byte", () => {
    const m = readProjectManifest(MANIFEST_PATH);
    const original = readFileSync(MANIFEST_PATH, "utf-8");
    expect(serializeProjectManifest(m)).to.equal(original);
  });

  it("T20: writeProjectManifest writes a byte-exact, no-trailing-newline manifest to a temp path", () => {
    const base = readProjectManifest(MANIFEST_PATH);
    const clone: C3ProjectManifest = JSON.parse(JSON.stringify(base));
    const tempDir = mkdtempSync(path.join(tmpdir(), "c3source-writeManifest-"));
    const tempManifestPath = path.join(tempDir, "project.c3proj");

    writeProjectManifest(tempManifestPath, clone);

    const written = readFileSync(tempManifestPath, "utf-8");
    expect(written).to.equal(serializeProjectManifest(clone));
    expect(written.endsWith("\n")).to.equal(false);
  });
});
