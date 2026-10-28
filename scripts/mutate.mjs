// Mutation harness: break the code on purpose, run a test block, restore byte-exact.
//
//   node scripts/mutate.mjs <mutations.json>
//
// mutations.json is an array of { "id", "file", "find", "replace", "grep" }:
// - "file" is repo-relative; "find" must occur in it exactly once (else the row errors).
// - "find": "" is a no-op control (M0). Put one first: it must pass, and it is re-run
//   after every mutation as the "after-restore" check.
// - "grep" is a mocha --grep pattern selecting the tests that should catch the mutation.
//
// Each row prints {rc, passing, failing, assertion, loadErr}. A real catch is failing > 0
// with assertion true and loadErr false; a TypeError from dereferencing a missing result
// still counts, but read the failure text before calling it a catch. The file is restored
// in `finally` and checked with `git diff --quiet` against the index, so stage (or commit)
// the code under test first: a mutation of an unstaged edit would read as a restore failure.
// Run from the repo root. Not linted or typechecked (scripts/ is outside both checks).
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const repo = process.cwd();
const muts = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const mocha = (grep) =>
  spawnSync(
    process.execPath,
    [
      "node_modules/mocha/bin/mocha.js",
      "--timeout",
      "5000",
      "--import=tsx",
      "--require",
      "./test/setup.ts",
      "test/**/*.test.ts",
      "--exit",
      "--grep",
      grep,
    ],
    { cwd: repo, encoding: "utf8", timeout: 600000 },
  );
const summarize = (r) => {
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const p = out.match(/(\d+) passing/);
  const f = out.match(/(\d+) failing/);
  const assertion = /AssertionError/.test(out);
  const loadErr = /SyntaxError|TSError|Cannot find|ERR_/.test(out) && !p;
  return { rc: r.status, passing: p ? +p[1] : null, failing: f ? +f[1] : 0, assertion, loadErr };
};

for (const m of muts) {
  const file = `${repo}/${m.file}`;
  const original = fs.readFileSync(file);
  try {
    if (m.find !== "") {
      const text = original.toString("utf8");
      const count = text.split(m.find).length - 1;
      if (count !== 1) throw new Error(`${m.id}: anchor matched ${count} times`);
      fs.writeFileSync(file, text.replace(m.find, m.replace));
    }
    console.log(`${m.id}: ${JSON.stringify(summarize(mocha(m.grep)))}`);
  } catch (e) {
    console.log(`${m.id}: ERROR ${e.message}`);
  } finally {
    fs.writeFileSync(file, original);
    const d = spawnSync("git", ["diff", "--quiet", "--", m.file], { cwd: repo });
    if (d.status !== 0) {
      console.log(`${m.id}: RESTORE FAILED (git diff not quiet)`);
      process.exit(2);
    }
  }
}
console.log(`after-restore: ${JSON.stringify(summarize(mocha(muts[0].grep)))}`);
