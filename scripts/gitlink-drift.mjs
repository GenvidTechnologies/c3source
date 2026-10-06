// Detects a submodule whose checked-out HEAD differs from the gitlink the
// superproject pins.
//
// The pin is read from the superproject's INDEX (`git ls-files -s`), not from
// `git ls-tree HEAD`: mid pin-bump the normal state is a staged gitlink that
// HEAD does not hold yet, and that must not be reported as drift.
//
// Never throws: returns null when drift cannot be established (not a git
// repo, path not registered, entry not a gitlink, unresolved conflict with
// several stages, or the submodule's HEAD unreadable) and when pinned === head.

import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Env var that turns prep-fixture's gitlink-drift warning into a hard failure (#90, ADR 0029). */
export const STRICT_ENV = "PREP_FIXTURE_STRICT";

/**
 * Parses the PREP_FIXTURE_STRICT value: "1"/"true" → on; unset, "", "0", "false" → off;
 * anything else → null (unrecognized — the caller treats that as a configuration error).
 * @param {string | undefined} raw
 * @returns {boolean | null}
 */
export function parseStrictFlag(raw) {
	if (raw === undefined || raw === "" || raw === "0" || raw === "false") return false;
	if (raw === "1" || raw === "true") return true;
	return null;
}

function git(cwd, args) {
	return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * @param {string} superRoot
 * @param {string} subPath
 * @returns {{ pinned: string, head: string } | null}
 */
export function findGitlinkDrift(superRoot, subPath) {
	try {
		const lines = git(superRoot, ["ls-files", "-s", "--", subPath])
			.split("\n")
			.filter((line) => line.length > 0);
		if (lines.length !== 1) return null;
		const match = /^160000 ([0-9a-f]{40,64}) \d\t/.exec(lines[0]);
		if (!match) return null;
		const pinned = match[1];
		const head = git(join(superRoot, subPath), ["rev-parse", "HEAD"]).trim();
		return pinned === head ? null : { pinned, head };
	} catch {
		return null;
	}
}
