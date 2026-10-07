// Materializes the gitignored `test/fixtures/canonical/` fixture from the
// `construct3-sample` submodule's canonical golden project, then layers on
// two tracked, additive-only adjustments so the fixture can evolve without
// forking the upstream bytes:
//   - a strip-list (`test/fixtures/canonical.striplist.txt`) of paths to
//     delete after copying
//   - an overlay directory (`test/fixtures/canonical-overlay/`) copied on
//     top, winning on any path collision
//
// The canonical copy is byte-for-byte from the submodule's **tracked HEAD
// content** — via `git archive`, never re-serialize JSON — so tab
// indentation / CRLF line endings survive exactly as C3 wrote them. It is
// deliberately not a working-tree `cpSync`: the golden's own
// `project/.gitignore` excludes `*.uistate.json` and `uistate/`, so those
// files are untracked-but-present in a developer's local submodule checkout
// and absent on a clean CI checkout — a working-tree copy made the fixture
// environment-dependent (#64).
//
// Guarded: if the submodule isn't checked out (or is a shallow/empty
// checkout), or its directory isn't its own git repository (e.g. a bare
// extracted copy with no `.git`, which `git rev-parse --show-prefix` reports
// as nested inside c3source), this exits 0 with a stderr note instead of
// failing, so it is safe to wire into `pretest` on any checkout (the
// downstream test then self-skips on the missing fixture).
//
// Strict mode: when `PREP_FIXTURE_STRICT` is `1` or `true`, those two guards
// are fatal instead (exit 1), as is a pinned gitlink that checkGitlinkPin
// cannot establish (status "unknown"), since the fixture cannot be verified.
// Every strict exit happens before anything is wiped.
//
// Drift check: if the checkout differs from the pinned gitlink, this warns by
// default and continues. In strict mode the drift is fatal too (exit 1, before
// anything is wiped). An unrecognized value is also fatal, so a typo cannot
// silently disable the check. CI opts in via node-gate's `extra-env` (#90,
// ADR 0029, #93).
//
// Usage: node scripts/prep-fixture.mjs

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { checkGitlinkPin, parseStrictFlag, STRICT_ENV } from "./gitlink-drift.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRepo = resolve(root, "construct3-sample");
const sourceDir = resolve(sourceRepo, "project");
const outputDir = resolve(root, "test/fixtures/canonical");
const overlayDir = resolve(root, "test/fixtures/canonical-overlay");
const striplistFile = resolve(root, "test/fixtures/canonical.striplist.txt");

const strict = parseStrictFlag(process.env[STRICT_ENV]);
if (strict === null) {
	console.error(
		`[prep-fixture] ${STRICT_ENV} must be 1 or true (on), or 0, false or empty (off); got ${JSON.stringify(process.env[STRICT_ENV])}`,
	);
	process.exit(1);
}

// Guard: detect an absent/uninitialized submodule via its known root file.
if (!existsSync(join(sourceDir, "project.c3proj"))) {
	if (strict) {
		console.error(
			`[prep-fixture] ERROR: construct3-sample submodule not checked out; ${STRICT_ENV} is on, so the pinned fixture cannot be verified (run: git submodule update --init --recursive)`,
		);
		process.exit(1);
	}
	console.error(
		"[prep-fixture] construct3-sample submodule not checked out; skipping (run: git submodule update --init --recursive)",
	);
	process.exit(0);
}

// Guard: confirm the submodule directory is its own git repository before
// shelling out to `git archive` against it. `--git-dir` is not enough: with the
// submodule's `.git` missing it walks up to c3source's own `.git`. `--show-prefix`
// prints "" only at the top of a repository, and `construct3-sample/` when nested.
let ownRepo = false;
try {
	const prefix = execFileSync("git", ["-C", sourceRepo, "rev-parse", "--show-prefix"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	ownRepo = prefix.trim() === "";
} catch {
	ownRepo = false;
}
if (!ownRepo) {
	if (strict) {
		console.error(
			`[prep-fixture] ERROR: construct3-sample is not its own git repository; ${STRICT_ENV} is on, so the pinned fixture cannot be verified (run: git submodule update --init --recursive)`,
		);
		process.exit(1);
	}
	console.error(
		"[prep-fixture] construct3-sample is not a git repository (no .git dir found); skipping (run: git submodule update --init --recursive)",
	);
	process.exit(0);
}

// Warn (fail only in strict mode, #90) when the checkout differs from the
// pinned gitlink: the archive below reads the checkout's HEAD, so a drifted
// checkout means the tests grade a golden no c3source commit points at (#88).
// The pin is read from the index, so a staged pin bump passes. A warning by
// default, not a throw: deliberately testing an unpinned upstream commit is
// legitimate.
const pin = checkGitlinkPin(root, "construct3-sample");
const drift = pin.status === "drift" ? pin : null;
// Exits before the wipe below, so the existing fixture survives.
if (pin.status === "unknown" && strict) {
	console.error(
		`[prep-fixture] ERROR: could not establish construct3-sample's pinned gitlink (${pin.reason}); ${STRICT_ENV} is on, so the fixture will not be materialized from an unverified checkout.`,
	);
	process.exit(1);
}
if (drift && strict) {
	console.error(
		`[prep-fixture] ERROR: construct3-sample is checked out at ${drift.head}, but c3source pins ${drift.pinned}; ` +
			`${STRICT_ENV} is on, so the fixture will not be materialized from an unpinned checkout. ` +
			"Run `git submodule update construct3-sample` to restore the pin, " +
			"or `git add construct3-sample` to stage a deliberate pin bump.",
	);
	process.exit(1);
}
if (drift) {
	console.warn(
		`[prep-fixture] WARNING: construct3-sample is checked out at ${drift.head}, but c3source pins ${drift.pinned}; ` +
			"the fixture will be materialized from the unpinned checkout. " +
			"Run `git submodule update construct3-sample` to restore the pin, " +
			"or `git add construct3-sample` to stage a deliberate pin bump.",
	);
}

// (a) Wipe the materialized output for an idempotent rebuild.
rmSync(outputDir, { recursive: true, force: true });

// (b) Byte-for-byte extraction of the canonical project's tracked HEAD
// content. A failure here (e.g. a corrupt/detached submodule checkout) is a
// hard failure — swallowing it would silently produce an empty fixture,
// worse than failing loudly.
// 256 MiB — far above the current archive (~230 KB), sized so fixture growth
// never needs this re-tuned.
const archive = execFileSync("git", ["-C", sourceRepo, "archive", "--format=zip", "HEAD", "project"], {
	encoding: "buffer",
	maxBuffer: 1 << 28,
});
// Entry names are produced by `git` itself from committed content of a pinned,
// first-party submodule, so the usual zip path-traversal concern (`../`) does
// not arise here and the join below needs no containment check.
for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(archive)))) {
	if (name.endsWith("/")) continue; // skip directory entries
	const dest = join(outputDir, name.replace(/^project\//, ""));
	mkdirSync(dirname(dest), { recursive: true });
	writeFileSync(dest, bytes); // byte-for-byte; never re-serialize
}

// (c) Apply the strip-list: delete listed paths (relative to the
// materialized root), tolerating entries that don't exist.
if (existsSync(striplistFile)) {
	const lines = readFileSync(striplistFile, "utf8").split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const target = resolve(outputDir, line);
		// Guard the destructive rmSync: never let a strip-list entry (e.g. `../foo`)
		// escape the materialized fixture root.
		const rel = relative(outputDir, target);
		if (rel === "" || rel.startsWith("..")) {
			console.warn(`[prep-fixture] strip-list entry escapes fixture root, skipping: ${line}`);
			continue;
		}
		if (!existsSync(target)) {
			console.warn(`[prep-fixture] strip-list entry does not exist, skipping: ${line}`);
			continue;
		}
		rmSync(target, { recursive: true, force: true });
	}
}

// (d) Apply the overlay: recursive additive copy, skipping any `.gitkeep`.
if (existsSync(overlayDir)) {
	cpSync(overlayDir, outputDir, {
		recursive: true,
		filter: (src) => {
			const stat = statSync(src);
			if (stat.isDirectory()) return true;
			return src.split(/[\\/]/).pop() !== ".gitkeep";
		},
	});
}

// Count materialized files for the summary line.
function countFiles(dir) {
	let count = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) count += countFiles(full);
		else count += 1;
	}
	return count;
}

const fileCount = countFiles(outputDir);
console.log(`[prep-fixture] materialized ${fileCount} files -> test/fixtures/canonical/`);
