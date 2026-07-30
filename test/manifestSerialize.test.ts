import { describe, it, before } from "mocha";
import { expect } from "chai";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  C3_JSON_INDENT,
  serializeC3Json,
  isEditorLocalPath,
  isMinifiedSourcePath,
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
 *  it is just a second, minified serialization form. This literal is still the
 *  expected discovered set (kept for a precise, readable failure diff), but T7
 *  below now also proves it bidirectionally against the `isMinifiedSourcePath`
 *  domain fact (`src/serialize.ts`) rather than trusting this list alone. */
const MINIFIED_SOURCE_FILES = ["tilemapBrushes/objectTypes/tiles/Tilemap.brush.json"];

/**
 * Editor-local files that must be present on any materialization of the fixture,
 * so the classifier coverage below is not vacuous. As of #64 (ADR 0019),
 * `prep-fixture.mjs` materializes tracked HEAD content only, so this is now the
 * exact `skipped` set on every machine, not just a required subset (see T7).
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

    // Fixture materialization is hermetic as of #64 (ADR 0019): prep-fixture.mjs
    // extracts the construct3-sample submodule's tracked HEAD content (git archive),
    // not its working tree, so the corpus is identical on a developer machine and on
    // CI — total=29/skipped=3/kept=26 everywhere — and these counts can be asserted
    // exactly rather than as a lower bound. The non-round-tripping set below is still
    // discovered, not pre-declared, since it is a claim about content, not membership.
    expect(kept.length + skipped.length, "total .json/.c3proj corpus").to.equal(29);
    expect(kept.length, "project-source .json/.c3proj corpus size").to.equal(26);
    expect(skipped.map(rel), "editor-local set").to.have.members(REQUIRED_EDITOR_LOCAL);

    const nonRoundTripping: string[] = [];
    for (const file of kept) {
      const text = readFileSync(file, "utf-8");
      expect(text.endsWith("\n"), `${file} must not end with a trailing newline`).to.equal(false);
      if (serializeC3Json(JSON.parse(text)) !== text) nonRoundTripping.push(rel(file));

      // Direction 2 (#59): every kept file the fact *claims* is minified must really
      // be byte-exact minified JSON — stronger than merely "differs from the tab
      // form", so the fact cannot over-claim a file that just happens not to
      // round-trip for some other reason.
      if (isMinifiedSourcePath(path.basename(file))) {
        expect(
          JSON.stringify(JSON.parse(text)),
          `${rel(file)} is classified minified-source by isMinifiedSourcePath but is not byte-exact minified JSON`,
        ).to.equal(text);
      }
    }

    // Direction 1 (#59): every discovered non-round-tripping file must be explained
    // by the domain fact — catches a newly-minified file the fact does not cover.
    for (const file of nonRoundTripping) {
      expect(
        isMinifiedSourcePath(path.basename(file)),
        `${file} does not round-trip but isMinifiedSourcePath does not classify it as known minified source`,
      ).to.equal(true);
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
