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

/** Fixture-root-relative, POSIX-normalized path, for platform-stable assertions
 *  and readable failure messages. */
const rel = (f: string): string => path.relative(FIXTURE_DIR, f).split(path.sep).join("/");

/** The one documented brush-serialization exception (#57 design, resolved #59): C3
 *  writes `*.brush.json` minified. It IS C3 project source — not editor-local —
 *  it is just a second, minified serialization form. Excluded by exact path here;
 *  a general `isMinifiedSourcePath` domain-fact predicate lands in a follow-up task. */
const MINIFIED_SOURCE_FILES = ["tilemapBrushes/objectTypes/tiles/Tilemap.brush.json"];

/**
 * Editor-local files that must be present on any materialization of the fixture
 * (local polluted tree or clean CI checkout), so the classifier coverage below is
 * not vacuous even though the exact `skipped` set is pollution-sensitive (see the
 * POLLUTION NOTE in T7).
 */
const REQUIRED_EDITOR_LOCAL = [
  "layouts/Main Layout.uistate.json",
  "layouts/uistate/Main Layout.instancesBar.json",
  "scripts/tsconfig.json",
];

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

    // POLLUTION NOTE (2026-07-29, #59): scripts/prep-fixture.mjs cpSync's the
    // construct3-sample submodule's *working tree*, not just its tracked content.
    // Locally that working tree carries gitignored, editor-local files
    // (*.uistate.json, uistate/, ts-defs/) that a clean CI checkout does not, so
    // the corpus totals legitimately differ between environments: locally
    // total=38/skipped=12/kept=26, on a clean checkout (= CI) total=29/skipped=3/
    // kept=26. Every one of those polluting files is editor-local by construction
    // (isEditorLocalPath / the inherited uistate/ directory rule cover them all,
    // and none of the 56 upstream ts-defs files are .json), so the leak lands
    // entirely in `skipped` — `kept`, and the non-round-tripping subset discovered
    // below, are pollution-invariant. Hence: an exact assertion on `kept.length`,
    // a subset (not exact-count) assertion on `skipped`, and discovery — not a
    // pre-declared path list sized to one tree — for the round-trip exception.
    // Making prep-fixture.mjs hermetic (copy tracked content only) is tracked as a
    // separate follow-up issue, not fixed here.
    expect(kept.length, "project-source .json/.c3proj corpus size").to.equal(26);
    expect(skipped.map(rel)).to.include.members(REQUIRED_EDITOR_LOCAL);

    const nonRoundTripping: string[] = [];
    for (const file of kept) {
      const text = readFileSync(file, "utf-8");
      expect(text.endsWith("\n"), `${file} must not end with a trailing newline`).to.equal(false);
      if (serializeC3Json(JSON.parse(text)) !== text) nonRoundTripping.push(rel(file));
    }

    expect(nonRoundTripping.sort()).to.deep.equal(MINIFIED_SOURCE_FILES);
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
