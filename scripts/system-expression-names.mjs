// Prints the System plugin's expression names from a Construct 3 `plugins/allAces.json`,
// one `expressionName` per line, in file order (categories in file order, then each
// category's expressions in file order). Dev-only; no dependencies.
//
// Usage: node scripts/system-expression-names.mjs <path-to-allAces.json>
//
// The System plugin's key is matched ignoring case (it is lowercase `system` at r495-2).
// The script exits non-zero with a message on stderr when the file has no System entry or
// the entry holds no expressions, so a wrong key cannot pass as an empty result.

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
	console.error("usage: node scripts/system-expression-names.mjs <path-to-allAces.json>");
	process.exit(2);
}

const data = JSON.parse(readFileSync(file, "utf8"));
const key = Object.keys(data).find((k) => k.toLowerCase() === "system");
if (key === undefined) {
	console.error(`no System plugin entry in ${file}`);
	process.exit(1);
}

const names = [];
for (const category of Object.values(data[key])) {
	for (const expression of category.expressions ?? []) names.push(expression.expressionName);
}
if (names.some((n) => typeof n !== "string" || n === "")) {
	console.error(`System plugin entry "${key}" has an expressionName that is not a non-empty string in ${file}`);
	process.exit(1);
}
if (names.length === 0) {
	console.error(`System plugin entry "${key}" has 0 expressions in ${file}`);
	process.exit(1);
}

process.stdout.write(names.map((n) => `${n}\n`).join(""));
