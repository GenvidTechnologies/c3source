# 0015. Adopt `construct3-sample` as the canonical C3 reference fixture; c3source validates, it does not own

- **Status:** accepted (complements [ADR 0013](0013-fflate-dependency-c3addon-reader.md) / [ADR 0014](0014-sdk-submodule-recursive-ci-checkout.md))
- **Date:** 2026-07-22
- **Issue:** #51 (also references #44, #50)

## Context

Three separate "truths" for what a Construct 3 project looks like on disk were
drifting: c3source's own `test/fixtures/c3source-fixture/`,
`@genvidtech/construct3-chef`'s `construct3-chef-sample/`, and the Scirra
Construct Addon SDK samples (vendored here as the `SDK/` git submodule, see
ADR 0013/0014). Concretely, #44 (the `.c3addon` domain layer) surfaced the
cost: pinning real `behaviorTypes`/`effectTypes` shapes required cross-reading
construct3-chef's fixture from another repo and hand-replicating shapes into
c3source's own fixture — the exact duplicated-domain-parsing problem #44 set
out to avoid, pushed down one layer to the fixtures themselves. Every new C3
domain fact had to be re-verified and re-encoded per repo, with no shared,
editor-validated source of truth.

## Decision

A standalone repo, `construct3-sample`
(https://github.com/GenvidTechnologies/construct3-sample), is **the**
canonical golden C3 project — the single source of truth for on-disk shape,
editor-authored and editor-validated by construction (seeded via a real C3
editor round-trip at r49500). Ownership is deliberately neutral: c3source is
itself a consumer of the fixture (its own tests), so if c3source owned it,
every other consumer (construct3-chef, c3-domain-manager, the gvt-construct3
plugin) would track c3source's release cadence instead. A standalone repo puts
all consumers on equal footing; `construct3-sample`'s own
`docs/decisions/0001-consumption-mechanism.md` codifies the same direction
from the upstream side.

**c3source's role is validator, not owner.** It provides the
parsers/validators (`validateForEditor`, `detectManifestDrift`); the canonical
repo runs those in its own CI so every consumer inherits a pre-validated base
rather than re-deriving correctness locally.

**Consumption is a git submodule pinned to a tag** — never a floating branch,
so updates stay a deliberate, reviewable bump. c3source mounts it at
repo-root `construct3-sample/`, pinned to tag `v0.1.0`.

**Per-consumer prep stays local.** Each consumer materializes the fixture it
actually tests against via an additive overlay + strip-list, producing a
gitignored build artifact — `test/fixtures/canonical/` in c3source, built by
`scripts/prep-fixture.mjs`. The submodule remains the single source of the
canonical bytes; edge-case/broken fixtures and rendered `extracted/`-style
read-surfaces stay local to each consumer, never in the golden repo.

## Compromise

- **npm companion package** (`@genvidtech/c3source-fixtures`) — rejected: wrong
  shape. A C3 project is a directory tree, not a module; it would land
  read-only under `node_modules`, forcing any consumer that regenerates from
  the fixture to copy it out to a temp dir first. It optimizes versioning
  (already solved by a pinned submodule tag/SHA) at the cost of actual usage.
- **Vendored copy** (checked-in duplicate per consumer) — rejected: squashes
  upstream history into flat "sync" diffs and duplicates the bytes in every
  consumer's history. A submodule pointer bump is instead one compare-view of
  "what changed + why", commit by commit.
- **c3source owns the fixture** — rejected: forces every other consumer onto
  c3source's release cadence; c3source is a peer consumer of the fixture, not
  its owner, so neutral standalone ownership is the cleaner architecture.
- The marginal cost of adding a second submodule is close to zero here:
  `--recurse-submodules` is already required for the Scirra `SDK/` submodule,
  and the shared `node-gate.yml` CI already checks out submodules recursively
  (ADR 0014 / #49).

## Consequences

This ADR records the *mechanism*; the initial c3source landing (this PR) is
infra-only — the submodule, the prep script, and a
`validateForEditor`/`detectManifestDrift` gate over the materialized fixture.
Migrating c3source's own fixture-backed tests onto the canonical fixture (and
retiring the committed `test/fixtures/c3source-fixture/`) is a filed
follow-up, not part of this change.

The Scirra `SDK/` submodule is **retained** (read-only) — its retirement (#50)
was closed as won't-do; it remains the authoritative upstream for real BOM'd
`addon.json`/`aces.json` samples and is unaffected by this decision.

A fixture bump has one step CI structurally can't cover — whether it still
loads/edits correctly in the real C3 editor — so the update protocol keeps an
explicit manual editor-round-trip checkpoint: validation is pushed upstream to
the canonical repo's own CI, plus a last-mile manual gate that CI cannot
replace. construct3-chef's #130/#132 (the consumer side of this same
migration) is where a real editor round-trip already surfaced three latent
defects that automated checks alone had missed.
