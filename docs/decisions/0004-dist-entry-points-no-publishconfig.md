# 0004. Package entry points at `dist/`, not `src/*.ts` via `publishConfig`

- **Status:** accepted
- **Date:** 2026-05-30
- **Issue:** #8

## Context

An earlier pnpm-style setup pointed `main`/`types`/`exports` at `src/*.ts` during
development and rewrote them to `dist/` at publish time via
`publishConfig.{main,types,exports}`. Under npm this silently failed: the
published tarball shipped the `src/` paths, so every consumer resolved
non-existent `.ts` entry points and the package was broken on install (issue #8).

## Decision

`package.json` `main`/`types`/`exports` point **directly at the built
`dist/*.js` and `dist/*.d.ts`** — the same artifacts the `files` allowlist ships —
so a consumer resolves exactly what gets published. `prepack` builds `dist/`
before any `npm pack`/`npm publish`. The old `publishConfig` src-rewrite trick is
**not** to be reintroduced: npm (unlike pnpm/yarn) ignores those manifest-field
overrides, so the `src/` paths leak into the tarball. `scripts/verify-package.mjs`
runs in `prepack` and fails the pack if any entry point is missing or falls
outside `files`.

## Compromise

The `publishConfig` src-rewrite keeps dev-time entry points on TypeScript source
(convenient for in-repo development), but npm's non-support of those overrides
makes it a silent footgun. We chose static `dist/` entry points plus a `prepack`
guard, accepting that dev tooling resolves `dist/` (and therefore requires a
build) rather than `src/` — mitigated by tests running through `tsx` against
`src/` directly ([ADR 0001](0001-single-module-esm-library.md)).

## Consequences

The package installs correctly under npm. `verify-package.mjs` prevents a
regression back to leaking `src/` paths. Contributors must not "optimize" entry
points back onto TypeScript source. This decision was the fix that shipped in
0.3.1 and is a direct consequence of the npm move in
[ADR 0003](0003-github-actions-oidc-publishing.md).
