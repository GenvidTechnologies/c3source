import { after, before, describe, it } from "mocha";
import { expect } from "chai";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STRICT_ENV } from "../scripts/gitlink-drift.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDENTITY = ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false"];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", [...IDENTITY, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

interface Case {
  dir: string;
  sub: string;
  pinned: string;
  sentinel: string;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

describe("prep-fixture strict mode (child process)", function () {
  this.timeout(30000);

  let suiteRoot: string;
  let counter = 0;

  before(() => {
    // realpathSync.native: os.tmpdir() is an 8.3 short path on Windows.
    suiteRoot = mkdtempSync(path.join(realpathSync.native(tmpdir()), "c3s-prepfix-"));
    // prep-fixture's only bare-specifier import is fflate (which has no dependencies).
    cpSync(path.join(REPO, "node_modules", "fflate"), path.join(suiteRoot, "node_modules", "fflate"), {
      recursive: true,
    });
  });

  after(() => {
    rmSync(suiteRoot, { recursive: true, force: true });
  });

  function buildCase(): Case {
    const dir = path.join(suiteRoot, `case-${++counter}`);
    const sub = path.join(dir, "construct3-sample");
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    for (const f of ["prep-fixture.mjs", "gitlink-drift.mjs"]) {
      writeFileSync(path.join(dir, "scripts", f), readFileSync(path.join(REPO, "scripts", f)));
    }
    mkdirSync(path.join(sub, "project"), { recursive: true });
    writeFileSync(path.join(sub, "project", "project.c3proj"), "{}");
    git(sub, "init", "-q");
    git(sub, "add", "project/project.c3proj");
    git(sub, "commit", "-q", "-m", "init");
    const pinned = git(sub, "rev-parse", "HEAD");
    git(dir, "init", "-q");
    git(dir, "update-index", "--add", "--cacheinfo", `160000,${pinned},construct3-sample`);
    const sentinel = path.join(dir, "test", "fixtures", "canonical", "SENTINEL");
    mkdirSync(path.dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "keep me");
    return { dir, sub, pinned, sentinel };
  }

  /** Moves the submodule HEAD off the pinned gitlink without touching the superproject index. */
  function commitInSub(c: Case): string {
    writeFileSync(path.join(c.sub, "extra.txt"), "drift");
    git(c.sub, "add", "extra.txt");
    git(c.sub, "commit", "-q", "-m", "drift");
    return git(c.sub, "rev-parse", "HEAD");
  }

  function run(c: Case, strict: string | undefined): Run {
    const env: NodeJS.ProcessEnv = { ...process.env, CI: "true" };
    if (strict === undefined) delete env[STRICT_ENV];
    else env[STRICT_ENV] = strict;
    const r = spawnSync(process.execPath, [path.join(c.dir, "scripts", "prep-fixture.mjs")], {
      cwd: c.dir,
      env,
      encoding: "utf8",
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it("P1: strict + drift -> exit 1, both SHAs named, fixture untouched", () => {
    const c = buildCase();
    const head = commitInSub(c);
    const r = run(c, "1");
    expect(r.status, r.stderr).to.equal(1);
    expect(r.stderr).to.contain(c.pinned);
    expect(r.stderr).to.contain(head);
    expect(existsSync(c.sentinel)).to.equal(true);
    expect(r.stdout).to.not.contain("materialized");
  });

  it("P2: strict + no drift behaves exactly like unset", () => {
    const strictRun = run(buildCase(), "1");
    const c2 = buildCase();
    const offRun = run(c2, undefined);
    for (const r of [strictRun, offRun]) {
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stderr).to.equal("");
      expect(r.stdout).to.match(/materialized 1 files/);
    }
    expect(strictRun.stdout).to.equal(offRun.stdout);
    expect(existsSync(c2.sentinel)).to.equal(false);
  });

  it("P3: off + drift -> the #88 warning byte-for-byte, exit 0, fixture materialized (CI alone is not the switch)", () => {
    const c = buildCase();
    const head = commitInSub(c);
    const r = run(c, undefined);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.equal(
      `[prep-fixture] WARNING: construct3-sample is checked out at ${head}, but c3source pins ${c.pinned}; ` +
        "the fixture will be materialized from the unpinned checkout. " +
        "Run `git submodule update construct3-sample` to restore the pin, " +
        "or `git add construct3-sample` to stage a deliberate pin bump.\n",
    );
    expect(existsSync(c.sentinel)).to.equal(false);
    expect(r.stdout).to.match(/materialized \d+ files/);
  });

  it("P4: strict + staged pin bump -> exit 0, no stderr", () => {
    const c = buildCase();
    const head = commitInSub(c);
    git(c.dir, "update-index", "--cacheinfo", `160000,${head},construct3-sample`);
    const r = run(c, "1");
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.equal("");
  });

  it("P5: invalid value -> exit 1, names the variable and the value, fixture untouched", () => {
    const c = buildCase();
    const r = run(c, "yes");
    expect(r.status, r.stderr).to.equal(1);
    expect(r.stderr).to.contain(STRICT_ENV);
    expect(r.stderr).to.contain('"yes"');
    expect(existsSync(c.sentinel)).to.equal(true);
  });

  it("P6: strict + not checked out -> exit 1, says so, no 'skipping', fixture untouched", () => {
    const c = buildCase();
    rmSync(path.join(c.sub, "project", "project.c3proj"));
    const r = run(c, "1");
    expect(r.status, r.stderr).to.equal(1);
    expect(r.stderr).to.contain("not checked out");
    expect(r.stderr).to.not.contain("skipping");
    expect(existsSync(c.sentinel)).to.equal(true);
  });

  it("P7: ci.yml opts in with a PREP_FIXTURE_STRICT=1 line", () => {
    const ci = readFileSync(path.join(REPO, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).to.match(new RegExp("^\\s+" + STRICT_ENV + "=1\\s*$", "m"));
  });

  it("P8: off + not checked out -> the original note byte-for-byte, exit 0", () => {
    const c = buildCase();
    rmSync(path.join(c.sub, "project", "project.c3proj"));
    const r = run(c, undefined);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.equal(
      "[prep-fixture] construct3-sample submodule not checked out; skipping (run: git submodule update --init --recursive)\n",
    );
  });

  /** The superproject needs a commit, and the submodule loses its own .git, so git walks up to the superproject. */
  function nestCase(): Case {
    const c = buildCase();
    writeFileSync(path.join(c.dir, "README.txt"), "super");
    git(c.dir, "add", "README.txt");
    git(c.dir, "commit", "-q", "-m", "super");
    rmSync(path.join(c.sub, ".git"), { recursive: true, force: true });
    return c;
  }

  it("P9: strict + submodule .git missing (nested in c3source) -> exit 1, fixture untouched", () => {
    const c = nestCase();
    const r = run(c, "1");
    expect(r.status, r.stderr).to.equal(1);
    expect(r.stderr).to.not.contain("skipping");
    expect(r.stderr).to.not.contain("checked out at");
    expect(existsSync(c.sentinel)).to.equal(true);
  });

  it("P10: off + submodule .git missing -> the original note byte-for-byte, exit 0, fixture untouched", () => {
    const c = nestCase();
    const r = run(c, undefined);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.equal(
      "[prep-fixture] construct3-sample is not a git repository (no .git dir found); skipping (run: git submodule update --init --recursive)\n",
    );
    expect(existsSync(c.sentinel)).to.equal(true);
  });

  it("P11: strict + gitlink not in the index -> exit 1, fixture untouched", () => {
    const c = buildCase();
    git(c.dir, "update-index", "--force-remove", "construct3-sample");
    const r = run(c, "1");
    expect(r.status, r.stderr).to.equal(1);
    expect(r.stderr).to.contain("not registered in the index");
    expect(r.stderr).to.not.contain("skipping");
    expect(existsSync(c.sentinel)).to.equal(true);
  });

  it("P12: off + gitlink not in the index -> silent, fixture materialized", () => {
    const c = buildCase();
    git(c.dir, "update-index", "--force-remove", "construct3-sample");
    const r = run(c, undefined);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.equal("");
    expect(existsSync(c.sentinel)).to.equal(false);
    expect(existsSync(path.join(c.dir, "test", "fixtures", "canonical", "project.c3proj"))).to.equal(true);
  });
});
