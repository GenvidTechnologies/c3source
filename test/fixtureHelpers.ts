import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { writeC3JsonFile } from "../src/serialize.js";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkRoot = path.join(repoRoot, "SDK");

/** Absolute path to a file/dir under test/fixtures/. */
export function fixturePath(relPath: string): string {
  return path.join(fixturesRoot, relPath);
}

/** Read a fixture file as UTF-8 text (relative to test/fixtures/). */
function loadFixture(relPath: string): string {
  return readFileSync(fixturePath(relPath), "utf-8");
}

/** Whether a fixture file/dir exists — used to self-skip fixture-dependent tests. */
function fixtureExists(relPath: string): boolean {
  return existsSync(fixturePath(relPath));
}

/**
 * The materialized project-fixture root, relative to test/fixtures/. Single swap
 * point for the whole suite: flipped from "c3source-fixture" to "canonical" when
 * the tests migrated onto the canonical golden fixture (#54, done).
 */
export const PROJECT_FIXTURE = "canonical";

/** The canonical fixture's manifest filename — the "is the fixture materialized at all" probe. */
export const PROJECT_MANIFEST = "project.c3proj";

/** The SDK sample's aces file, SDK-root-relative. */
export const SDK_SAMPLE_ACES = "plugin-sdk/customImporterPlugin/aces.json";

/** Absolute path to a file/dir inside the project fixture (relative to its root). */
export function fixtureProjectPath(rel = ""): string {
  return fixturePath(rel ? `${PROJECT_FIXTURE}/${rel}` : PROJECT_FIXTURE);
}

/** Whether a file/dir inside the project fixture exists — used to self-skip fixture-dependent tests. */
export function fixtureProjectExists(rel = ""): boolean {
  return fixtureExists(rel ? `${PROJECT_FIXTURE}/${rel}` : PROJECT_FIXTURE);
}

/**
 * The gate for a test depending on a specific path inside the canonical project
 * fixture — a three-way split that a bare `existsSync` cannot make. `existsSync`
 * answers two different questions with the same `false`: "the fixture was never
 * materialized" (self-skip — no test has regressed) and "the fixture is present
 * but this path is gone from it" (the golden moved or renamed something a test
 * still expects — a real break). Collapsing those into one boolean is exactly how
 * construct3-sample's v1.0.0 fold of `eventSheets/`/`layouts/` into
 * `Gameplay/`/`UI/` subfolders silently disarmed six tests instead of failing any
 * of them (#82) — they self-skipped as if the fixture were simply absent.
 *
 * So: if the fixture itself was never materialized (`fixtureProjectExists(PROJECT_MANIFEST)`
 * is false), return `false` so the caller self-skips as before. If the fixture is
 * materialized but `rel` is missing, throw — that is no longer an absent-fixture
 * self-skip, it is a stale path. Otherwise return `true`.
 *
 * See ADR 0026 for the full rationale.
 *
 * @throws if the fixture is materialized but `rel` does not exist within it.
 */
export function fixtureProjectAvailable(rel: string): boolean {
  if (!fixtureProjectExists(PROJECT_MANIFEST)) return false;
  if (!fixtureProjectExists(rel)) {
    throw new Error(
      `Canonical fixture is materialized, but "${rel}" does not exist within it. ` +
        `This is a FIXTURE problem, not a library defect: the construct3-sample golden ` +
        `likely moved or renamed this path — its v1.0.0 fold of eventSheets/ and layouts/ ` +
        `into Gameplay/ and UI/ subfolders did exactly this. Update the path in this test, ` +
        `or re-check the submodule pin — see CLAUDE.md's "Canonical reference fixture" section.`,
    );
  }
  return true;
}

/**
 * Read a file inside the canonical project fixture as UTF-8 text, given a path
 * relative to the fixture's project root. Thin wrapper over `loadFixture` that
 * prefixes `PROJECT_FIXTURE`, so a converted call site can pass one bare
 * project-relative string to both this and `fixtureProjectAvailable`, instead of
 * today's mix of `test/fixtures/`-root-relative and project-relative strings.
 */
export function loadFixtureProject(rel: string): string {
  return loadFixture(`${PROJECT_FIXTURE}/${rel}`);
}

/** Absolute path to a file/dir under the SDK/ git submodule. */
export function sdkPath(relPath: string): string {
  return path.join(sdkRoot, relPath);
}

/**
 * Whether an SDK-scoped file/dir exists — a non-throwing presence probe. MUST
 * check the specific file/dir itself (not just that SDK/ is present): a
 * non-recursive submodule checkout leaves SDK/ present-but-empty, which a bare
 * directory check would false-positive. That same root-marker check is what
 * `sdkFixtureAvailable` below builds on.
 *
 * Kept alongside `sdkFixtureAvailable` rather than being replaced by it:
 * `test/mochaStrictness.test.ts` calls this one inside a biconditional
 * assertion, where a throw would crash the comparison instead of evaluating
 * it. Tests gating on SDK-scoped fixtures should use `sdkFixtureAvailable`;
 * this one stays exported and non-throwing for that one caller.
 */
export function sdkFixtureExists(relPath: string): boolean {
  return existsSync(sdkPath(relPath));
}

/** The SDK submodule's own root marker — tracked at its HEAD in every recursive checkout. */
const SDK_ROOT_MARKER = "README.md";

/**
 * The gate for a test depending on a specific path inside the SDK/ git
 * submodule — the same three-way split as `fixtureProjectAvailable`, for the
 * same reason: a bare `existsSync` cannot distinguish "the submodule was
 * never checked out recursively" (self-skip — no test has regressed) from
 * "the submodule is present but this path is gone from it" (a real break).
 *
 * So: if `SDK/README.md` itself is absent, the submodule was never checked
 * out recursively — return `false` so the caller self-skips as before. If
 * `SDK/README.md` is present but `rel` is missing, throw — that is no longer
 * an absent-submodule self-skip, it is a stale path within a present
 * checkout. Otherwise return `true`.
 *
 * @throws if the submodule is checked out but `rel` does not exist within it.
 */
export function sdkFixtureAvailable(rel: string): boolean {
  if (!sdkFixtureExists(SDK_ROOT_MARKER)) return false;
  if (!sdkFixtureExists(rel)) {
    throw new Error(
      `SDK/ submodule is checked out, but "${rel}" does not exist within it. ` +
        `This is a SUBMODULE-PIN problem, not a library defect: the SDK/ pin may have ` +
        `moved or renamed this path. Update the path in this test, or re-check the SDK/ ` +
        `submodule pin — see CLAUDE.md's mention of the Scirra Construct-Addon-SDK submodule.`,
    );
  }
  return true;
}

/**
 * Create a throwaway project directory containing only a `project.c3proj` holding
 * `manifestJson`, and return its path.
 *
 * TEST-ONLY. This is how malformed-manifest inputs are built: `test/fixtures/canonical/`
 * is the upstream-owned golden fixture (gitignored, materialized from the
 * `construct3-sample` submodule), so hand-authored broken bytes must never be written
 * there. Tests either clone-then-mutate the golden in memory, or write a temp project
 * here.
 *
 * The manifest is written with `writeC3JsonFile` rather than a second hand-rolled
 * tab-indent literal, so temp projects are byte-shaped exactly like real ones.
 */
export function makeTempProject(manifestJson: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "c3source-manifest-"));
  writeC3JsonFile(path.join(dir, "project.c3proj"), manifestJson);
  return dir;
}

/**
 * Create a throwaway project directory with a minimal `project.c3proj`, an
 * `objectTypes/` directory holding one JSON file per supplied object type (keyed by
 * `objectType.name`), and an `images/` directory holding the supplied filenames as
 * zero-byte files. Returns the project directory path.
 *
 * TEST-ONLY. Sibling to `makeTempProject`: for tests that need `deriveExpectedImages`/
 * `detectImageDrift` inputs on disk rather than an in-memory `objectTypes` array, without
 * hand-authoring bytes into the upstream-owned `test/fixtures/canonical/` golden.
 */
export function makeTempImageProject(
  objectTypes: Record<string, unknown>[],
  imageFiles: string[] = [],
  manifestOverrides: Record<string, unknown> = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), "c3source-image-project-"));

  const manifestJson = {
    objectTypes: { items: objectTypes.map((ot) => String(ot.name)), subfolders: [] },
    layouts: { items: [], subfolders: [] },
    eventSheets: { items: [], subfolders: [] },
    timelines: { items: [], subfolders: [] },
    flowcharts: { items: [], subfolders: [] },
    families: { items: [], subfolders: [] },
    models3d: { items: [], subfolders: [] },
    containers: [],
    rootFileFolders: {
      script: { items: [], subfolders: [] },
      sound: { items: [], subfolders: [] },
      music: { items: [], subfolders: [] },
      video: { items: [], subfolders: [] },
      font: { items: [], subfolders: [] },
      icon: { items: [], subfolders: [] },
      general: { items: [], subfolders: [] },
    },
    ...manifestOverrides,
  };
  writeC3JsonFile(path.join(dir, "project.c3proj"), manifestJson);

  const objectTypesDir = path.join(dir, "objectTypes");
  mkdirSync(objectTypesDir, { recursive: true });
  for (const ot of objectTypes) {
    writeC3JsonFile(path.join(objectTypesDir, `${String(ot.name)}.json`), ot);
  }

  const imagesDir = path.join(dir, "images");
  mkdirSync(imagesDir, { recursive: true });
  for (const fileName of imageFiles) {
    writeFileSync(path.join(imagesDir, fileName), new Uint8Array(0));
  }

  return dir;
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
