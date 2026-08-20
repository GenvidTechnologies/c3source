---
type: decision-context
title: "ADR 0019 — Materialize the canonical fixture from the submodule's tracked HEAD content, not its working tree"
description: scripts/prep-fixture.mjs now materializes test/fixtures/canonical/ via git archive HEAD (extracted in-process with fflate) instead of copying the construct3-sample submodule's working tree, so a developer's untracked/gitignored editor-local files can never leak into the corpus.
tags: [adr, fixtures, testing]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0019
    resource: ../../raw/adr-0019-hermetic-fixture-materialization-2026-08-20.md
    title: "ADR 0019 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0019 — Materialize the canonical fixture from the submodule's tracked HEAD content, not its working tree

**Status:** accepted
**Date:** 2026-07-30
**Issue:** #64

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0019].

## Context

`scripts/prep-fixture.mjs` materialized `test/fixtures/canonical/` by `cpSync`-ing the `construct3-sample`
submodule's *working tree*. The golden's own `project/.gitignore` excludes `*.uistate.json` and `uistate/`, so
those files are untracked-but-present in a developer's local submodule checkout and absent on a clean checkout
(CI, or a fresh clone) — a working-tree copy therefore made the materialized fixture environment-dependent.

Measured: on a polluted developer tree the corpus was 117 files / 38 `.json`+`.c3proj` / 12 editor-local / 26
kept; on a clean CI checkout, 108 / 29 / 3 / 26. `scripts/ts-defs/` (56 tracked `.d.ts` files) is **not** part of
that leak — it is tracked upstream and legitimately present on both trees. The leak was exactly the 11 untracked
uistate files (8 `*.uistate.json` + 3 `uistate/*.instancesBar.json`).

This caused a real CI break: `main` went red at `054846a` (CI run `30472921171`) with `AssertionError: expected
29 to equal 38` in T7's corpus assertion (`test/manifestSerialize.test.ts`), because T7's figures had been
measured on a polluted local tree. The same wrong figures also reached ADR 0016's Context. Both were corrected
in #59 — but that hardened one test's expected numbers, not the mechanism producing the drift, so any future
whole-fixture count assertion was liable to reacquire the same latent environment-sensitivity.

## Decision

Materialize from tracked HEAD content instead of the working tree: `git -C construct3-sample archive
--format=zip HEAD project`, extracted in-process via `fflate` (already a runtime dependency per [ADR
0013](/decisions/0013-fflate-dependency-c3addon-reader.md) — no new dependency), writing each entry byte-for-byte, never
re-serializing. The strip-list (`canonical.striplist.txt`) and overlay (`canonical-overlay/`) steps are
unchanged and still applied on top, in that same order.

The guarded-no-op property is preserved and extended: an absent submodule **or** a present-but-not-a-git-
repository directory (e.g. a bare extracted copy with no `.git`) both produce a stderr note and exit 0, so
downstream tests self-skip rather than the run breaking; a `git archive` failure inside an actual repository
checkout stays a hard failure — silently producing an empty fixture would be worse than failing loudly.

## Compromise

1. **`git archive HEAD project | tar -x`** — the form the issue literally proposed. Rejected: it depends on an
   external `tar` binary being reachable from an npm-spawned `node` process on Windows (the primary dev platform
   here). `fflate` was already a dependency, so in-process zip extraction removes the external-tool dependency
   entirely rather than adding a portability caveat.
2. **`git ls-files -z` + per-file `cpSync`** — genuinely fixes the reported bug (untracked files can never
   enter) and is the simplest diff. Rejected on two counts: it copies tracked *paths* but **working-tree
   bytes**, so a locally-modified tracked file still silently changes the fixture — hermetic in membership but
   not in content; and it measured 493 ms vs 133 ms for the archive path (3.7x slower), on a script that runs on
   **every** `npm test` via the `pretest` hook.
3. **Leave the mechanism and keep hardening individual tests** (the #59 status quo). Rejected: it puts the
   burden on every future test author to know the corpus is environment-sensitive, and
   `test/canonicalFixture.test.ts`'s drift gate was pollution-tolerant only by accident — every leaked file
   happened to be editor-local-filtered, an invariant nothing independently guarded.

Supporting evidence measured during the change: extracting HEAD blobs is **byte-identical** to the working-tree
copy on every shared file on the reference machine (`core.autocrlf=input`, no `.gitattributes` in the
submodule) — so the change moves no [ADR 0016](/decisions/0016-c3-source-json-serialization-form.md) round-trip claim —
**and** it is additionally immune to a contributor configured with `core.autocrlf=true`, whose working tree
would have carried CRLF-converted bytes straight into the fixture under the old `cpSync`.

## Consequences

**Hermetic is not the same as representative.** [ADR
0018](/decisions/0018-brush-json-minified-source-not-editor-local.md)'s trap is unchanged by this decision:
`test/fixtures/canonical-overlay/`'s `*.uistate.json` / `*.instancesBar.json` are c3source-authored stubs, not
real C3 output (the overlay `instancesBar` is 66 bytes with a trailing newline; C3's real one is 224 bytes,
tab-indented, no trailing newline). Making materialization reproducible does **not** make the overlay
representative — serialization-form claims must still never be measured against it.

Enriching the golden now requires a **local commit in the `construct3-sample` submodule** before the change
appears in the materialized fixture — `git archive HEAD` only sees committed content. `CLAUDE.md`'s enrichment
workflow already says to verify *before pushing* to the shared submodule, so commit-then-verify still fits; but
an uncommitted edit is now invisible to the fixture, which it was not before (a working-tree copy would have
picked it up immediately).

`test/manifestSerialize.test.ts`'s T7 corpus assertion moved from a subset check (`skipped` via
`include.members`) to an exact-set check (`have.members`) plus a new `total === 29` assertion, now that the
corpus is identical on every machine; see the corpus-tightening commit for #64. `docs/TOC.md` and `CLAUDE.md`'s
canonical-fixture section were updated to describe tracked-HEAD extraction rather than a working-tree copy.

## Related

- [ADR 0013 — Depend on fflate for .c3addon zip reading](/decisions/0013-fflate-dependency-c3addon-reader.md) — the runtime dependency this decision reuses for in-process zip extraction.
- [ADR 0015 — Adopt construct3-sample as the canonical C3 reference fixture](/decisions/0015-canonical-c3-reference-fixture.md) — the fixture-ownership decision this ADR hardens the materialization step for.
- [ADR 0016 — c3source owns the C3 source-JSON write form](/decisions/0016-c3-source-json-serialization-form.md) — the round-trip claim this change was verified not to move.
- [ADR 0018 — *.brush.json is minified project source, not editor-local](/decisions/0018-brush-json-minified-source-not-editor-local.md) — the overlay-representativeness trap this ADR's Consequences reaffirm.
- [ADR 0026 — Fixture gate skip-vs-throw and forbid-pending](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md) — later extends the degradation contract this ADR's guarded-no-op establishes.
- [Canonical Reference Fixture](/canonical-fixture.md) — the current state of the materialization mechanism this ADR establishes.

[^adr-0019]: ADR 0019 (docs/decisions capture, 2026-08-20)
