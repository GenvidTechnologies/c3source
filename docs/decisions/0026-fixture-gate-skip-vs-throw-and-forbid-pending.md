# 0026. Split the fixture gate into skip-if-absent / throw-if-moved, backed by a computed `--forbid-pending`

- **Status:** accepted
- **Date:** 2026-08-19
- **Issue:** #82

## Context

Every fixture-gated test in this repo answered one `existsSync` with a single
boolean and treated `false` as "self-skip, nothing has regressed." That
boolean was actually conflating two different facts: *the fixture was never
materialized* (the golden submodule is absent, or checked out
non-recursively — `prep-fixture`/CI degradation the suite is explicitly
designed to tolerate, per [ADR 0019](0019-hermetic-fixture-materialization.md))
and *the fixture is materialized but the specific path a test expects is no
longer there*. The second case is not a degradation — it is a test whose
assumption about the golden's shape has gone stale — but a bare `existsSync`
answers it identically to the first, so the test skips instead of failing.

`construct3-sample`'s `v1.0.0` release (documented in `CLAUDE.md`'s canonical-
reference-fixture section) folded `eventSheets/`/`layouts/` into
`Gameplay/`/`UI/` subfolders. Bumping the pin broke three tests outright
(`R-C1`/`R-C2`/`R-C14` in `test/projectManifest.test.ts`, which asserted
against the moved paths directly) but silently disarmed six others
(`eventVarReference.test.ts`, `fixtureFieldFidelity.test.ts`,
`layerVisitor.test.ts`, `makeDefaultLayer.test.ts`) whose gates hit the
now-absent old path and self-skipped as if the golden were simply missing.
Nine tests, same root cause, two entirely different observable outcomes —
and only the louder one was noticed without a human specifically watching
the pending count.

This complementary axis — *count* — already had a guard:
`manifestSerialize.test.ts`'s corpus-count assertion fires whenever a fixture
gains or loses a `.json`/`.c3proj` file, which is exactly what would have
caught an add or remove. But `v1.0.0` renamed files rather than adding or
removing them (29/3/26 unchanged before and after), so the guard that
existed pointed at the one axis a rename does not move. Nothing guarded the
path axis at all.

## Decision

Two independent layers, neither redundant with the other.

**1. Per-site throwing gate.** `fixtureProjectAvailable(rel)` in
`test/fixtureHelpers.ts` replaces the bare-boolean gate with a three-way
answer: if the fixture root itself (`project.c3proj`) is absent, return
`false` so the caller self-skips exactly as before; if the fixture is
present but `rel` is missing, **throw**, naming `rel` and pointing at
`CLAUDE.md`'s canonical-fixture section; otherwise return `true`.
`loadFixtureProject(rel)` is the matching project-relative reader, so a
converted call site passes one bare string to both. `sdkFixtureAvailable(rel)`
is the same split for the `SDK/` git submodule, using the submodule's own
tracked `README.md` as the root-presence marker (the same role
`project.c3proj` plays for the canonical fixture) — a non-recursive checkout
leaves `SDK/` present-but-empty, so checking the directory alone would
false-positive.

Twelve "class-A" gate sites across six test files — the ones that
previously fed a `${PROJECT_FIXTURE}`-relative path into a bare `existsSync`
— were converted to the throwing gate, along with the eight `SDK/`-scoped
sites carrying the same shape. `fixtureExists`/`loadFixture` (the old
private helpers) are unused outside `fixtureHelpers.ts` and are now
module-private; `sdkFixtureExists` stays exported and non-throwing
specifically for `test/mochaStrictness.test.ts`'s biconditional (below),
where a throw would crash the comparison instead of letting it run.

**Scope is deliberately class-A only.** Two other gate shapes exist in the
suite and neither needed conversion, by the same reasoning that motivates
this ADR rather than despite it:

- **Class B** gates directly on the strictness predicate's own expression —
  `existsSync(fixtureProjectPath(PROJECT_MANIFEST))` or equivalent — which
  is *identical* to the fixture-root check `fixtureProjectAvailable`
  performs internally before it would ever consider throwing. In strict mode
  (both fixtures present) that expression is `true` by construction, so a
  class-B site cannot skip there.
- **Class C** gates on the fixture root the class-A/B sites already imply
  present (e.g. a `before` hook that only checks the directory exists, with
  the specific-path check implicit in whatever the hook then does). The same
  argument applies one level removed.

So in strict mode, neither class can produce an unexpected skip — the
predicate that arms strictness (below) is exactly the predicate that would
have to be false for either to fire. Converting the remaining ~43 root- and
`project.c3proj`-gated sites would have been 43 edits reaching zero
additional coverage: a root-fixed path cannot move, so `fixtureProjectAvailable`
would only ever return its already-correct boolean there. This is a
domination argument, not a compromise — the unconverted sites are not a
gap, they are already subsumed.

**2. Class-level backstop via a computed `.mocharc.cjs`.** A new,
deliberately partial `.mocharc.cjs` sets `forbid-pending` to the result of
`existsSync(canonical/project.c3proj) && existsSync(SDK/plugin-sdk/.../aces.json)`
— true only when *both* gated fixtures are materialized. `--forbid-pending`
turns any unexpected skip (a bodyless `it`, a suite-level `this.skip()`) into
a failed run, covering every gate class layer 1 does not convert and every
gate added in the future without anyone reaching for the throwing helper.
It is CJS because mocha evaluates `.mocharc.cjs` before any TypeScript
loads, so its two path literals cannot import `PROJECT_MANIFEST`/
`SDK_SAMPLE_ACES` from `test/fixtureHelpers.ts` — they are hand-kept in
agreement, and `test/mochaStrictness.test.ts` is the automated check that
they still are (see Consequences).

**Neither layer subsumes the other; both exist because either alone leaves
a real gap that looks like it's covered:**

- `--forbid-pending` is **all-or-nothing across every fixture in the run**.
  A developer with the canonical fixture checked out but no `SDK/` (a very
  ordinary partial-checkout state) gets `strict = false` and *zero*
  protection from layer 2 — but the per-site gate still throws on a moved
  canonical-fixture path regardless, because it does not consult the SDK's
  presence at all.
- The per-site gate's throw **names the test's path but not which mocha
  policy is in effect**, and reads, without layer 2, as an ordinary test
  failure rather than a signal that the fixture moved. Conversely, layer 2's
  failure (`Pending test forbidden`) names that *something* was skipped but
  not *what path* moved — it is `--forbid-pending`'s own stock message.
  Layer 1 supplies the "what moved," layer 2 supplies the "nothing gets
  through uncaught even at a site nobody converted."

## Compromise

Four alternatives were rejected.

**Unconditional `--forbid-pending` (no computed rc).** The obvious-looking
fix, and the one rejected hardest: it breaks the degradation contract ADR
0019 exists to protect. Measured against this branch's baseline, the
absent-submodule state runs **362 passing / 152 pending** — every one of
those 152 pending tests would become a failure, turning "no submodule
checked out" from a supported, green developer/CI state into a hard break.
The computed rc is what lets strictness apply only when it is actually safe
to demand zero skips.

**A central path-manifest assertion** (one test enumerating every
fixture-dependent path and asserting each exists). Rejected on three
grounds: it does not run under the single-file `npx mocha` recipe this
repo's own `CLAUDE.md` documents as the standard way to run one test file,
since a targeted run would never load the manifest test; it duplicates path
knowledge in a second place that can drift from the sites that actually use
those paths; and its failure message says "the fixture changed" without
saying *which test* to go fix, which is strictly less actionable than
either layer actually shipped.

**Declaration-time non-registration** (`if (fixtureAvailable) describe(...)`
instead of `this.skip()` inside a registered suite). This is the idiom that
would make an absent fixture invisible to mocha entirely rather than
reporting it as pending — and reporting it as pending is exactly the signal
ADR 0019's degradation contract depends on (a developer or CI log that reads
"0 pending" during a real regression, and a nonzero pending count during a
legitimate absence, both need the count to exist). Registering-then-skipping
is not incidental; unregistering would destroy the very signal this ADR
adds a second layer to make load-bearing.

**Upstream-enriching the golden with a genuinely disabled condition**, to
fix the vacuous `Condition.disabled` test a different way than the
de-vacuuming commit did. This was the purer fix for that one test, and was
declined for a boundary reason unrelated to its merits: nothing in this
issue's scope may require an edit to `construct3-sample`, which is
upstream-owned (ADR 0015) — a fixture change belongs to a separate decision
with its own tag and pin bump, not folded into a test-infrastructure fix.

## Consequences

- **No semver bump.** `src/` is untouched; `dist/` is byte-identical. This
  is purely a `test/`-and-tooling change.
- **`.mocharc.cjs` sits outside both quality gates that would otherwise
  catch it drifting.** It is not `.ts`, so eslint's `--ext .ts src/ test/`
  scope skips it, and it is not under `tsconfig.test.json`'s `include`, so
  `tsc` never typechecks it. `test/mochaStrictness.test.ts` — itself an
  ordinary, gated `.ts` test — is its *only* automated coverage: it asserts
  the rc's two hand-maintained path literals still agree with
  `PROJECT_MANIFEST`/`SDK_SAMPLE_ACES` in `test/fixtureHelpers.ts`. A path
  rename in one place with no corresponding edit in the other is caught
  there, not by the compiler or linter.
- **`docs/design-patterns.md`'s testing-strategy section is amended** to
  describe the skip/throw split instead of the single
  `fixtureProjectExists(...)`/`this.skip()` degradation it previously
  documented as the whole strategy.
- **Complements, supersedes nothing.** ADR 0013 (fflate dependency) and ADR
  0014 (SDK submodule, read-only + recursive CI checkout) are unaffected;
  ADR 0015 (canonical fixture ownership) and ADR 0019 (hermetic
  materialization + the degradation contract this ADR protects rather than
  changes) are both extended, not revised.
