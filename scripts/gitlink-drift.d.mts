// Hand-written declaration for gitlink-drift.mjs; keep in sync with it by hand.
export const STRICT_ENV: "PREP_FIXTURE_STRICT";
export function parseStrictFlag(raw: string | undefined): boolean | null;
export function findGitlinkDrift(superRoot: string, subPath: string): { pinned: string; head: string } | null;

/** Three-way verdict on a submodule's pin; "unknown" carries a human-readable reason. */
export type GitlinkPinStatus =
	| { status: "clean"; pinned: string; head: string }
	| { status: "drift"; pinned: string; head: string }
	| { status: "unknown"; reason: string };

/** Never throws. Distinguishes "couldn't tell" (unknown) from "clean", unlike findGitlinkDrift's null. */
export function checkGitlinkPin(superRoot: string, subPath: string): GitlinkPinStatus;
