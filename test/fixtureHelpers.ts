import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkRoot = path.join(repoRoot, "SDK");
const canonicalRoot = path.join(repoRoot, "construct3-sample");

/** Absolute path to a file/dir under test/fixtures/. */
export function fixturePath(relPath: string): string {
  return path.join(fixturesRoot, relPath);
}

/** Read a fixture file as UTF-8 text (relative to test/fixtures/). */
export function loadFixture(relPath: string): string {
  return readFileSync(fixturePath(relPath), "utf-8");
}

/** Whether a fixture file/dir exists — used to self-skip fixture-dependent tests. */
export function fixtureExists(relPath: string): boolean {
  return existsSync(fixturePath(relPath));
}

/**
 * The materialized project-fixture root, relative to test/fixtures/. Single swap
 * point for the whole suite: flipped from "c3source-fixture" to "canonical" when
 * the tests migrate onto the canonical golden fixture (#54).
 */
export const PROJECT_FIXTURE = "c3source-fixture";

/** Absolute path to a file/dir inside the project fixture (relative to its root). */
export function fixtureProjectPath(rel = ""): string {
  return fixturePath(rel ? `${PROJECT_FIXTURE}/${rel}` : PROJECT_FIXTURE);
}

/** Whether a file/dir inside the project fixture exists — used to self-skip fixture-dependent tests. */
export function fixtureProjectExists(rel = ""): boolean {
  return fixtureExists(rel ? `${PROJECT_FIXTURE}/${rel}` : PROJECT_FIXTURE);
}

/** Absolute path to a file/dir under the SDK/ git submodule. */
export function sdkPath(relPath: string): string {
  return path.join(sdkRoot, relPath);
}

/**
 * Whether an SDK-scoped file/dir exists — used to self-skip SDK-dependent tests.
 * MUST check the specific file/dir itself (not just that SDK/ is present): a
 * non-recursive submodule checkout leaves SDK/ present-but-empty, which a bare
 * directory check would false-positive.
 */
export function sdkFixtureExists(relPath: string): boolean {
  return existsSync(sdkPath(relPath));
}

/** Absolute path to a file/dir under the construct3-sample git submodule (canonical golden project). */
export function canonicalPath(relPath: string): string {
  return path.join(canonicalRoot, relPath);
}

/**
 * Whether a construct3-sample file/dir exists — used to self-skip canonical-fixture tests.
 * MUST check the specific file/dir itself (not just that construct3-sample/ is present): a
 * non-recursive submodule checkout leaves construct3-sample/ present-but-empty, which a bare
 * directory check would false-positive (mirrors `sdkFixtureExists`).
 */
export function canonicalFixtureExists(relPath: string): boolean {
  return existsSync(canonicalPath(relPath));
}

/**
 * Zip every top-level file in `srcDir` into a `.c3addon`-shaped archive at `destZipPath`.
 * TEST-ONLY helper for synthesizing a `.c3addon` package from an unpacked sample dir
 * (top-level is enough for the addon.json/aces.json samples this is used against).
 */
export function zipDirToC3addon(srcDir: string, destZipPath: string): void {
  const entries: Record<string, Uint8Array> = {};
  for (const name of readdirSync(srcDir)) {
    const full = path.join(srcDir, name);
    if (statSync(full).isFile()) entries[name] = readFileSync(full);
  }
  writeFileSync(destZipPath, zipSync(entries));
}
