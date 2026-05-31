import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { visit_layers_in_layouts } from "../src/c3source.js";

describe("uistate subfolders (C3 r487)", () => {
	let root: string;

	afterEach(() => {
		if (root) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("ignores uistate/ subfolders and their contents instead of choking on them", () => {
		root = mkdtempSync(join(tmpdir(), "c3source-uistate-"));
		const layouts = join(root, "layouts");
		mkdirSync(layouts, { recursive: true });

		// A real layout file the traversal must visit.
		writeFileSync(
			join(layouts, "Level1.json"),
			JSON.stringify({ name: "Level1", layers: [{ name: "Background" }] }),
		);

		// C3 r487 drops a `uistate/` subfolder full of .json files that are NOT
		// named `.uistate.json`. They are not layouts; parsing them as such chokes.
		const uistate = join(layouts, "uistate");
		mkdirSync(uistate, { recursive: true });
		writeFileSync(join(uistate, "Level1.json"), "this is not valid json {");

		const visited: string[] = [];
		const changed = visit_layers_in_layouts(layouts, (layer) => {
			visited.push(layer.name);
			return 0;
		});

		expect(changed).to.equal(0);
		expect(visited).to.deep.equal(["Background"]);
	});
});
