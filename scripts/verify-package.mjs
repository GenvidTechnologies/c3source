// Guard against mispublishing (see issue #8): the package's resolved entry
// points (`main`, `types`, and every `exports` target) must exist on disk AND
// be inside a path shipped by the `files` allowlist. Otherwise consumers hit
// TS2307 / ERR_MODULE_NOT_FOUND, as happened with 0.3.0 when src-tree entry
// points leaked into the published tarball.
//
// Runs in `prepack`, so it fires for both `npm pack` and `npm publish`.

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

// Collect every file path the manifest advertises as an entry point.
function collectEntryPaths(value, out) {
	if (typeof value === "string") {
		if (value.startsWith("./") || value.startsWith("../")) out.add(value);
	} else if (value && typeof value === "object") {
		for (const v of Object.values(value)) collectEntryPaths(v, out);
	}
	return out;
}

const entries = collectEntryPaths(
	{ main: pkg.main, types: pkg.types, exports: pkg.exports },
	new Set(),
);

// Top-level dirs/files included in the published tarball.
const shipped = (pkg.files ?? []).map((f) => normalize(f));
const isShipped = (rel) =>
	shipped.some((f) => rel === f || rel.startsWith(f + "/") || rel.startsWith(f + "\\"));

const problems = [];
for (const entry of entries) {
	const abs = resolve(root, entry);
	const rel = relative(root, abs).split("\\").join("/");
	if (!existsSync(abs)) {
		problems.push(`entry "${entry}" does not exist on disk (did the build run?)`);
	} else if (!isShipped(normalize(rel))) {
		problems.push(`entry "${entry}" is not inside the "files" allowlist [${shipped.join(", ")}]`);
	}
}

if (problems.length > 0) {
	console.error("verify-package: refusing to pack — entry points are broken:");
	for (const p of problems) console.error(`  - ${p}`);
	process.exit(1);
}

console.log(`verify-package: OK (${entries.size} entry point(s) resolve into the published tarball)`);
