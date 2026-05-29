import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

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
