// Hand-written declaration for gitlink-drift.mjs; keep in sync with it by hand.
export const STRICT_ENV: "PREP_FIXTURE_STRICT";
export function parseStrictFlag(raw: string | undefined): boolean | null;
export function findGitlinkDrift(superRoot: string, subPath: string): { pinned: string; head: string } | null;
