---
type: reference
title: Canonical Reference Fixture
description: construct3-sample is the tag-pinned, editor-round-tripped golden C3 project c3source validates against rather than owns, materialized hermetically into the gitignored test fixture directory and enriched only upstream, never by hand-authoring the overlay.
tags: [canonical-fixture, construct3-sample, submodule, fixture-gate, mocharc]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Canonical Reference Fixture

`construct3-sample/` is a **second** git submodule (added issue #51), pinned
at the commit tagged `v1.1.0` as of this capture — the single,
editor-round-tripped golden C3 project that c3source and its sibling tools
consume instead of each hand-maintaining a drifting fixture[^claude-md].

## Ownership: c3source validates, it does not own

c3source is the **validator, not the owner** of this fixture — it runs
`validateForEditor`/`detectManifestDrift` (see [Event-Sheet
Extraction](/event-sheet-extraction.md), [Project
Manifest](/project-manifest.md)) over it, but the project itself is
upstream, editor-owned content[^claude-md]. See [ADR
0015](/decisions/0015-canonical-c3-reference-fixture.md) for the
ownership + tag-pinned-submodule mechanism and the rejected alternatives (an
npm companion package, a vendored copy). This is distinct from — and
additive to — the retained Scirra `SDK/` submodule, used for the [addon
domain layer](/addon-domain-layer.md)'s fixtures; the SDK submodule's own
retirement (issue #50) was closed won't-do[^claude-md].

## What is actually pinned: a commit, not a tag

**The superproject tree stores a `160000 commit <sha>` entry, and
`.gitmodules` carries no `branch`/tag field** — git never consults a tag
when updating the submodule. `git describe --tags` merely resolves that sha
to a nearby tag name for humans[^claude-md]. Tagging each golden release
(ADR 0015's convention) stays worthwhile as a readable label and a signal
that a fixture state was deliberately published, but a bump is **complete
the moment the commit pointer is staged** — the tag name documented in
c3source is documentation, not configuration[^claude-md].

## Materialization: `scripts/prep-fixture.mjs`

`scripts/prep-fixture.mjs` materializes the golden into the **gitignored**
`test/fixtures/canonical/` — a byte-for-byte copy of
`construct3-sample/project/`'s **tracked HEAD content**, via `git archive`,
**not** a working-tree copy (see [ADR
0019](/decisions/0019-hermetic-fixture-materialization.md), issue
#64) — plus an additive `test/fixtures/canonical-overlay/` minus the
`canonical.striplist.txt` paths[^claude-md]. A `pretest` npm hook runs it
before every `npm test`, and it is a **guarded no-op** (exit 0) when the
submodule is absent or its checked-out directory isn't a git repository, so
tests self-skip rather than the run breaking[^claude-md].

**Consequence: an uncommitted edit in the submodule is invisible to the
fixture.** Because materialization reads tracked HEAD content, enriching the
golden requires a **local commit in the `construct3-sample` submodule**
before the change appears in the materialized fixture[^claude-md].

## Overlay vs. upstream-enrich: the decision rule

Coverage the golden genuinely *should* carry — a real C3 construct a
downstream test needs (e.g. event-var-reference ACEs) — is added
**upstream in `construct3-sample`** (editor-round-trip → commit → push →
new tag → bump the pin), **never** faked into `canonical/` — an overlaid,
hand-authored event sheet would couple those bytes to
`canonicalFixture.test.ts`'s `validateForEditor`/drift gate[^claude-md].

The additive `canonical-overlay/` is reserved for c3source-specific shaping
the golden **deliberately omits** (e.g. `uistate/` +
`*.instancesBar.json`, which the golden's own `.gitignore` excludes), so the
`isEditorLocalPath` drift-filter coverage isn't vacuous[^claude-md]. When
enriching the golden, verify before pushing to the shared submodule
(parses, `validateForEditor` == 0 issues, referenced var declared and in
scope, minimal `git diff --stat`)[^claude-md].

## Version history

Every bump through v0.7.0 was **corpus-neutral in the strong sense** — both
counts *and* paths held, since each edited existing files rather than
adding, removing, or moving any[^claude-md]:

| Version | What it added |
|---|---|
| v0.1.0 | Original pin, no event-var-reference ACEs |
| v0.2.0 | Event-var-reference ACEs on `Event sheet 1` (needed by `eventVarReference.test.ts`) |
| v0.4.1 | Global layer with override, both layouts (the prefix-resetting `global` path in `walkLayerEntries`); upstream-owned addon sources |
| v0.5.0 | Functions ACEs on `Event sheet 1` |
| v0.6.0 | Boolean event variable + `compare-boolean-eventvar` condition on `Event sheet 2` — part of how the fabricated `is-boolean-eventvar-set` ACE id survived unnoticed |
| v0.7.0 | Custom ACE on `NavButton`; a function sampled without a description — the enrichment behind `custom-ace-name-required` and the disproof that `functionDescription` is a loader requirement |
| v1.0.0 (**MAJOR**) | "Cross-domain coupling coverage" (driven upstream by `c3-domain-manager`#34): folds `eventSheets/`/`layouts/` into `Gameplay/`/`UI/` subfolders, adds a cross-domain include, an object-member expression reference, and an event-variable reference, each deliberately crossing a folder boundary |
| v1.1.0 | Local variable referenced before its declaration in `UI/Event sheet 2` — the observable signature separating level-wide visibility from re-initialization-at-declaration (see [Event-Sheet Extraction](/event-sheet-extraction.md)) |

Per the sample's own versioning convention, a **MAJOR** bump means a
consumer with a generated read-surface keyed on those paths must regenerate
it before bumping the pin, and a consumer's own overlay/strip-list must be
re-checked against the new shape[^claude-md].

## v1.0.0's measured fallout: count-neutral, path-breaking

**v1.0.0 breaks the "corpus-neutral in the strong sense" property while
preserving the weaker one.** The `.json`/`.c3proj` counts are unchanged
(29/3/26, 26 kept round-tripping bar the brush file), because the fold
renamed every event-sheet and layout path rather than adding or removing a
file — but the *paths* moved, and anything keyed on a hardcoded path (a
generated read-surface, a fixture-gated test's literal path string) breaks
even though a count-only check would not have caught it[^claude-md].

Measured fallout in this repo: the bump broke `R-C1`/`R-C2`/`R-C14` in
`test/projectManifest.test.ts` **outright**, and caused
`eventVarReference.test.ts`, `fixtureFieldFidelity.test.ts`,
`layerVisitor.test.ts`, and `makeDefaultLayer.test.ts` to **silently
self-skip** on their now-stale hardcoded paths[^claude-md]. **When bumping
the pin, re-measure paths as well as counts** — a bump can be count-neutral
and still invalidate a third of the fixture-gated suite.

## The fixture-gate story: skip vs. throw, and `--forbid-pending`

**As of issue #82 ([ADR
0026](/decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md)),
a moved path like the v1.0.0 fold is caught automatically** at every gate
converted to `fixtureProjectAvailable`/`sdkFixtureAvailable`[^claude-md].

Gating splits skip from throw, because a bare `existsSync` cannot tell them
apart: a site whose path inside the fixture cannot move — the fixture root,
or `project.c3proj` itself — gates directly on `fixtureProjectExists(...)`,
where `false` really does mean "not materialized," so `this.skip()` is
correct. A site whose path *can* move as the golden evolves instead gates on
`fixtureProjectAvailable(rel)`: it returns `false` only when the fixture
root itself is absent (self-skip, unchanged), but **throws**, naming `rel`,
when the fixture is materialized and that specific path is missing — the
golden restructured and the test's assumption about its shape is stale,
which is a real failure, not a degradation. `sdkFixtureAvailable(rel)` is
the same split for the `SDK/` submodule[^claude-md].

A computed `.mocharc.cjs` at the repo root backstops both: it arms mocha's
`--forbid-pending` whenever **both** gated fixtures (the canonical project
fixture and the SDK sample) are materialized, so any *unexpected* skip at a
site nobody converted also fails the run rather than reporting a quiet "0
failing"[^claude-md].

**Both mechanisms require the fixtures to already be materialized.** The
computed `.mocharc.cjs`'s strictness is itself contingent on presence — it
only arms when both fixtures are present, so a pin bump run against a
partial or absent checkout still needs the manual pending-count check
above[^claude-md].

### The one case the backstop cannot cover: a broken recursive checkout

**Fetch the submodule's own remote before doing anything in it.** A `git
fetch` in c3source says nothing about `construct3-sample` — `origin/main`
here can be current while the pinned commit is several releases behind. Run
`git -C construct3-sample fetch` and check `git log HEAD..origin/main`
*before* committing an enrichment, not after: on issue #81 the pin was four
commits and one **major** (`v1.0.0`) behind, invisible from c3source
itself[^claude-md].

**Push the branch and its tag as one chained command**
(`git push origin main && git push origin vX.Y.Z`) — unchained, the tag push
still succeeds after a rejected branch push and strands the tag on a commit
unreachable from `main`, in a repo three projects pin[^claude-md].

`construct3-sample`'s remote is **SSH**
(`git@github.com:GenvidTechnologies/construct3-sample`, set in
`.gitmodules`), so pushing there goes through the same 1Password SSH-agent
path as a c3source push and may need the user present to approve. The
SCP-style `git@github.com:` spelling is deliberate: `actions/checkout`
rewrites that form to token-authenticated HTTPS for submodule clones,
whereas a `git+ssh://` URL is not covered by that rewrite and would break
CI's recursive checkout — and with it, **every** fixture-backed test, which
would **self-skip silently** rather than fail[^claude-md]. This is the one
case ADR 0026's `--forbid-pending` backstop does **not** cover, and cannot
by design: a broken recursive checkout leaves the gated fixtures absent,
which is exactly the degradation state ([ADR
0019](/decisions/0019-hermetic-fixture-materialization.md)) that
keeps `.mocharc.cjs` from arming strictness. The manual pending-count check
is the only defense here[^claude-md].

## Related

- [Event-Sheet Extraction](/event-sheet-extraction.md) — `scopeVars`/local-variable scope, the semantic v1.1.0's enrichment was built to evidence.
- [Project Manifest](/project-manifest.md) — `detectManifestDrift`, the drift detection this fixture validates.
- [Development Workflow](/development-workflow.md) — `.mocharc.cjs` and the mocha test-invocation conventions this fixture-gate story depends on.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
