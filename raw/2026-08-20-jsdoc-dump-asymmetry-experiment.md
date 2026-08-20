# Capture: controlled confirmation of the api-surface JSDoc asymmetry

**Captured:** 2026-08-20
**Source:** working session — the `docs/` → `wiki/` documentation migration
(branch `docs/migrate-to-llm-wiki`).
**Nature:** direct measurement on this repository. Not a corpus scan, not the
C3 editor bundle — a local experiment on c3source's own build output.

---

## Why the measurement happened

The migration renamed a documentation path referenced from JSDoc. Thirteen
`@see`-style pointers across five modules read `docs/domain-fact-audit.md` and
had to become `wiki/c3-domain-facts.md`. Because JSDoc ships to consumers
inside `dist/*.d.ts`, this was a change to the published tarball, so it needed
the api-surface check.

The repository already documented an asymmetry: a **top-level `const`**'s JSDoc
does not appear in the `scripts/api-surface.mjs` dump, while an **interface or
type member**'s JSDoc does. The prior evidence was issue #81 — a single `const`
version-pin comment edit that produced a byte-identical dump. That establishes
one half (const edits are free) but cannot establish the other half in the same
run.

## What made this change a controlled test

The thirteen edits were not uniform. They split across both categories at once:

- **Top-level `const` JSDoc** — in `serialize.ts`, `layouts.ts`, `references.ts`.
- **Interface member JSDoc** — `C3ProjectManifest.functionsName` in
  `manifest.ts` (`functionsName?: string;` is a member of an exported
  interface), plus comment text in `eventSheets.ts`.

Both halves moved in a single commit, so one dump comparison exercises both
predictions simultaneously.

## Method

```sh
node scripts/api-surface.mjs > after.txt
git stash push -- src/          # baseline: pre-change src, everything else held
npm run build && node scripts/api-surface.mjs > before.txt
git stash pop && npm run build  # restore

diff before.txt after.txt
sed -E 's#/\*\*[^*]*\*+([^/*][^*]*\*+)*/##g' before.txt > before.strip
sed -E 's#/\*\*[^*]*\*+([^/*][^*]*\*+)*/##g' after.txt  > after.strip
diff before.strip after.strip
```

Both dumps were 198 lines.

## Result

**Raw diff: exactly one changed line** — `C3ProjectManifest`. The changed text
is the interface's inlined JSDoc, where `See \`docs/domain-fact-audit.md\` (#68)`
became `See \`wiki/c3-domain-facts.md\` (#68)`. The declaration itself
(`functionsName?: string;` and every sibling member) is character-identical.

**JSDoc-stripped diff: empty.**

An independent check confirmed the change was comment-only: filtering the
`src/` diff for lines that are not `*`- or `//`-prefixed returned nothing.

## What this establishes

1. **The asymmetry is confirmed in both directions by one experiment.** Comment
   edits to top-level `const`s in three separate modules moved **zero** lines.
   A comment edit to one interface member moved **one**. Had const JSDoc been
   carried into the dump, the delta would have been four or more lines.

2. **The empty JSDoc-stripped diff is the real "no signature changed" proof.**
   The raw dump being non-empty is expected and benign for a doc-carrying
   change; treating a non-empty raw diff as failure would have been a false
   alarm here.

3. **Predicting the delta is now cheap and exact.** Count only the comments
   attached to interface/type members. This change had exactly one, and the
   dump moved exactly one line.

## Caveat on the method

`git stash push -- src/` is what keeps the baseline honest — it reverts only
`src/`, leaving the migration's other edits in place, so the two dumps differ
by the JSDoc change and nothing else. Rebuilding after `git stash pop` is
required, or `dist/` is left holding baseline output.

The `sed` recipe above contains backslash escapes. Writing it through a shell
heredoc in this environment corrupts them (a doubled backslash collapses to a
single one), which silently changes the regex. It was written to a file
directly for this reason.
