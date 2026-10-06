import { afterEach, beforeEach, describe, it } from "mocha";
import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findGitlinkDrift, parseStrictFlag, STRICT_ENV } from "../scripts/gitlink-drift.mjs";

const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false"];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", [...IDENTITY, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commitFile(repo: string, name: string, body: string): string {
  writeFileSync(path.join(repo, name), body);
  git(repo, "add", name);
  git(repo, "commit", "-m", `add ${name}`);
  return git(repo, "rev-parse", "HEAD");
}

describe("findGitlinkDrift", () => {
  let tmp: string;
  let superRoot: string;
  let subRoot: string;
  let pinnedSha: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "c3source-gitlink-"));
    superRoot = path.join(tmp, "super");
    subRoot = path.join(superRoot, "sub");
    mkdirSync(subRoot, { recursive: true });
    git(subRoot, "init", "-q");
    pinnedSha = commitFile(subRoot, "a.txt", "one");
    git(superRoot, "init", "-q");
    git(superRoot, "update-index", "--add", "--cacheinfo", `160000,${pinnedSha},sub`);
    git(superRoot, "commit", "-m", "pin sub");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("R1: HEAD equals the index gitlink -> null", () => {
    expect(findGitlinkDrift(superRoot, "sub")).to.equal(null);
  });

  it("R2: submodule HEAD ahead of an unstaged gitlink -> { pinned, head }", () => {
    const newSha = commitFile(subRoot, "b.txt", "two");
    const drift = findGitlinkDrift(superRoot, "sub");
    expect(drift).to.deep.equal({ pinned: pinnedSha, head: newSha });
    expect(drift!.pinned).to.match(/^[0-9a-f]{40}$/);
    expect(drift!.head).to.match(/^[0-9a-f]{40}$/);
    expect(drift!.pinned).to.not.equal(drift!.head);
  });

  it("R3: a staged pin bump -> null, while HEAD's tree still holds the old SHA", () => {
    const newSha = commitFile(subRoot, "b.txt", "two");
    git(superRoot, "add", "sub");
    expect(findGitlinkDrift(superRoot, "sub")).to.equal(null);
    const treeLine = git(superRoot, "ls-tree", "HEAD", "sub");
    expect(treeLine).to.contain(pinnedSha);
    expect(treeLine).to.not.contain(newSha);
  });

  it("R4a: subPath not registered in the index -> null", () => {
    expect(findGitlinkDrift(superRoot, "nothere")).to.equal(null);
  });

  it("R4b: superRoot is not a git repository -> null, no throw", () => {
    const plain = path.join(tmp, "plain");
    mkdirSync(plain);
    expect(() => git(plain, "rev-parse", "--git-dir")).to.throw();
    expect(findGitlinkDrift(plain, "sub")).to.equal(null);
  });
});

describe("parseStrictFlag", () => {
  it("S1: \"1\" and \"true\" -> true, and the env var is PREP_FIXTURE_STRICT", () => {
    expect(STRICT_ENV).to.equal("PREP_FIXTURE_STRICT");
    expect(parseStrictFlag("1")).to.equal(true);
    expect(parseStrictFlag("true")).to.equal(true);
  });

  it("S2: unset, \"\", \"0\", \"false\" -> false", () => {
    for (const raw of [undefined, "", "0", "false"]) {
      expect(parseStrictFlag(raw), String(raw)).to.equal(false);
    }
  });

  it("S3: unrecognized values -> null (strict equality, not merely falsy)", () => {
    for (const raw of ["yes", "TRUE", " 1", "on"]) {
      expect(parseStrictFlag(raw), raw).to.equal(null);
    }
  });
});
