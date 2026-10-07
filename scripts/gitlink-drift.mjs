// Detects a submodule whose checked-out HEAD differs from the gitlink the
// superproject pins.
//
// The pin is read from the superproject's INDEX (`git ls-files -s`), not from
// `git ls-tree HEAD`: mid pin-bump the normal state is a staged gitlink that
// HEAD does not hold yet, and that must not be reported as drift.
//
// Two functions, neither of which ever throws:
//
// - checkGitlinkPin returns a three-way verdict: "clean" (pinned === head),
//   "drift" (pinned !== head), or "unknown" with a reason (not a git repo, path
//   not registered, entry not a gitlink, unresolved conflict with several
//   stages, or the submodule's HEAD unreadable). It distinguishes "couldn't
//   tell" from "clean" for prep-fixture's strict mode (#93).
// - findGitlinkDrift is the two-way wrapper: it returns null when drift cannot
//   be established and when pinned === head (ADR 0028). Its contract is unchanged.

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
	return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Three-way verdict on a submodule's pin. Never throws; git's stderr is captured
 * for the reason, never printed.
 * @param {string} superRoot
 * @param {string} subPath
 * @returns {{ status: "clean", pinned: string, head: string }
 *   | { status: "drift", pinned: string, head: string }
 *   | { status: "unknown", reason: string }}
 */
export function checkGitlinkPin(superRoot, subPath) {
	try {
		const lines = git(superRoot, ["ls-files", "-s", "--", subPath])
			.split("\n")
			.filter((line) => line.length > 0);
		if (lines.length === 0) return { status: "unknown", reason: "not registered in the index" };
		if (lines.length > 1) return { status: "unknown", reason: `${lines.length} conflicting index stages` };
		const match = /^160000 ([0-9a-f]{40,64}) \d\t/.exec(lines[0]);
		if (!match) {
			const mode = /^(\d+) /.exec(lines[0]);
			return { status: "unknown", reason: mode ? `not a gitlink (mode ${mode[1]})` : "not a gitlink (unparseable index entry)" };
		}
		const pinned = match[1];
		const head = git(join(superRoot, subPath), ["rev-parse", "HEAD"]).trim();
		return pinned === head ? { status: "clean", pinned, head } : { status: "drift", pinned, head };
	} catch (err) {
		const stderr = typeof err?.stderr === "string" ? err.stderr : (err?.stderr?.toString?.() ?? "");
		const first = stderr.split("\n").find((line) => line.trim().length > 0);
		return { status: "unknown", reason: `git failed: ${first ? first.trim() : String(err?.message ?? err)}` };
	}
}

/**
 * @param {string} superRoot
 * @param {string} subPath
 * @returns {{ pinned: string, head: string } | null}
 */
export function findGitlinkDrift(superRoot, subPath) {
	const r = checkGitlinkPin(superRoot, subPath);
	return r.status === "drift" ? { pinned: r.pinned, head: r.head } : null;
}
