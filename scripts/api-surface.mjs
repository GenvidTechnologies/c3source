// Dumps the package's public API surface — every export reachable from the
// built declaration entry point, following `export *` re-export chains via
// the TypeScript checker (not a textual scan). Used to prove a refactor
// keeps the published API byte-identical: run this against a baseline
// `dist/` and again against the post-refactor `dist/`, then diff the output.
//
// Usage: node scripts/api-surface.mjs [entryDeclarationFile]
//   defaults to dist/index.d.ts relative to the repo root.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, process.argv[2] ?? "dist/index.d.ts");

if (!existsSync(entry)) {
	console.error(`api-surface: entry declaration file does not exist: ${entry}`);
	console.error(`api-surface: did the build run?`);
	process.exit(1);
}

const collapseWhitespace = (text) => text.replace(/\s+/g, " ").trim();

function declText(symbol) {
	const decls = symbol.getDeclarations() ?? [];
	const texts = decls.map((d) => collapseWhitespace(d.getText()));
	texts.sort();
	return texts.join(" ||| ");
}

let program;
let checker;
let lines;

try {
	program = ts.createProgram([entry], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		skipLibCheck: true,
	});
	checker = program.getTypeChecker();

	const sourceFile = program.getSourceFile(entry);
	if (!sourceFile) {
		console.error(`api-surface: could not load source file for entry: ${entry}`);
		process.exit(1);
	}

	const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
	if (!moduleSymbol) {
		console.error(`api-surface: entry file has no module symbol (not a module?): ${entry}`);
		process.exit(1);
	}

	const exports = checker.getExportsOfModule(moduleSymbol);

	lines = exports.map((exported) => {
		// Re-exported ("export *") symbols surface as aliases; resolve to the
		// original declaring symbol so we capture the real declaration text
		// (e.g. an interface body), not an opaque alias stub.
		const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
		return `${exported.name}\t${symbol.flags}\t${declText(symbol)}`;
	});
} catch (err) {
	console.error(`api-surface: failed to resolve exports: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}

lines.sort();
for (const line of lines) console.log(line);
