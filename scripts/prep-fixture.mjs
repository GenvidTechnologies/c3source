// Materializes the gitignored `test/fixtures/canonical/` fixture from the
// `construct3-sample` submodule's canonical golden project, then layers on
// two tracked, additive-only adjustments so the fixture can evolve without
// forking the upstream bytes:
//   - a strip-list (`test/fixtures/canonical.striplist.txt`) of paths to
//     delete after copying
//   - an overlay directory (`test/fixtures/canonical-overlay/`) copied on
//     top, winning on any path collision
//
// The canonical copy is a byte-for-byte `cpSync` — never re-serialize JSON —
// so tab indentation / CRLF line endings survive exactly as C3 wrote them.
//
// Guarded: if the submodule isn't checked out (or is a shallow/empty
// checkout), this exits 0 with a stderr note instead of failing, so it is
// safe to wire into `pretest` on any checkout (the downstream test then
// self-skips on the missing fixture).
//
// Usage: node scripts/prep-fixture.mjs

import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(root, "construct3-sample/project");
const outputDir = resolve(root, "test/fixtures/canonical");
const overlayDir = resolve(root, "test/fixtures/canonical-overlay");
const striplistFile = resolve(root, "test/fixtures/canonical.striplist.txt");

// Guard: detect an absent/uninitialized submodule via its known root file.
if (!existsSync(join(sourceDir, "project.c3proj"))) {
	console.error(
		"[prep-fixture] construct3-sample submodule not checked out; skipping (run: git submodule update --init --recursive)",
	);
	process.exit(0);
}

// (a) Wipe the materialized output for an idempotent rebuild.
rmSync(outputDir, { recursive: true, force: true });

// (b) Byte-for-byte copy of the canonical project.
cpSync(sourceDir, outputDir, { recursive: true });

// (c) Apply the strip-list: delete listed paths (relative to the
// materialized root), tolerating entries that don't exist.
if (existsSync(striplistFile)) {
	const lines = readFileSync(striplistFile, "utf8").split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const target = resolve(outputDir, line);
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
