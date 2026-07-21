# 0014. Keep the Construct Addon SDK submodule read-only; recursive CI checkout via the shared workflow's `submodules` input

- **Status:** accepted (complements [ADR 0013](0013-fflate-dependency-c3addon-reader.md))
- **Date:** 2026-07-21
- **Issue:** #49 (also references #50, #51)

## Context

c3source's `.c3addon` reader/parser tests (`test/addonReader.test.ts`,
`test/addonAcesModel.test.ts`, added in #44) have a supplementary tier gated
on `sdkFixtureExists()` that reads real, BOM'd `addon.json`/`aces.json`
samples from the Scirra **Construct Addon SDK**, vendored as the `SDK/` git
submodule. [ADR 0013](0013-fflate-dependency-c3addon-reader.md)'s
Context/Consequences already flag that this tier "must be checked out
recursively for the SDK-gated reader tests to exercise real, BOM'd samples"
— but that requirement was left unresolved: the tier self-skips when the
submodule is absent, so it silently never ran in CI. The always-on synthetic
fixture (`test/fixtures/addon-sample/`) remained the non-optional coverage
floor throughout.

c3source's `.github/workflows/ci.yml` `gate` job is **entirely** a `uses:`
call to the shared reusable workflow
`GenvidTechnologies/public-github-actions/.github/workflows/node-gate.yml@main`,
which owns the `actions/checkout@v6` step and runs the tests. There is no
local checkout step in the consumer to attach `submodules:` to, and a
`uses:` job cannot also declare `steps:`.

Two open follow-ups framed the choice: #49 (wire recursive checkout) and #50
(retire the submodule entirely and vendor a built-from-sources sample).

## Decision

Keep the official Scirra Construct Addon SDK as a **read-only** git
submodule — it is the authoritative upstream for real BOM'd samples and
schemas; "read-only" here just means it is simply consumed (a public HTTPS
URL c3source can't push to), with no shallow-pin or write-guard machinery.

Enable the SDK-gated tier in CI by adding an optional `submodules` input
(`type: string`, default `""`) to the shared `node-gate.yml` reusable
workflow, wired into its `actions/checkout@v6` step, and having c3source's
`ci.yml` pass `submodules: recursive`. The shared-workflow change is
backward-compatible (`""` → `actions/checkout` treats as `false`) for all 6
consumers, so only c3source opts in. This shipped as
`GenvidTechnologies/public-github-actions` PR #1 (merged to `@main`).
Locally, developers run `git submodule update --init --recursive`
(documented in the README).

## Compromise

- **Retire the submodule and vendor a built-from-sources `.c3addon` sample
  (#50)** — rejected: prefer consuming the *authoritative* upstream SDK over
  owning a hand-built snapshot that drifts from Scirra's real format; the SDK
  is the official source of real BOM'd samples and schemas. (#50 is being
  closed as won't-do; the broader canonical-fixture ownership question stays
  an open discussion in #51.)
- **Submodule-init pre-step in c3source's `ci.yml`** (option b in #49) —
  rejected: unworkable. The `gate` job is a pure reusable-workflow `uses:`
  call; it cannot have `steps:`, and a separate job's checkout can't help
  tests that run on the reusable workflow's own runner.
- **Inline the gate in c3source's `ci.yml`** (copy lint/typecheck/test/build
  plus a recursive checkout, dropping the reusable workflow) — rejected:
  abandons the shared-workflow DRY across 6 consumer repos
  (c3-domain-manager, construct3-chef, cordova-plugin-eos,
  cordova-plugin-marketplace, mcp-utils, c3source) for a one-line checkout
  tweak.

## Consequences

The SDK-gated addon tests now run in CI (target: 25 passing / 0 pending on
the two files; 19/6 when the submodule is absent, still the local default).
The submodule remains a moving external dependency — accepted, since the
shapes it pins are r487 domain facts c3source already owns as exported
constants (cf. [ADR 0008](0008-c3-domain-fact-tables.md)) — and clones still
need `--recursive` / a submodule init to exercise the tier locally. The
shared `node-gate` workflow now has a reusable `submodules` input other
consumers can adopt.
