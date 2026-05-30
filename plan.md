# Plan: Migrate CI/publish from CircleCI/Azure/pnpm to GitHub Actions + npm + OIDC

## Branch
`chore/ci-npm-github-actions`

## Goal

Replace CircleCI + Azure Blob + pnpm + secret-token publishing with a GitHub
Actions reusable gate + npm **OIDC trusted publishing** (no stored token,
automatic provenance) under the scoped name `@genvid/c3source`. This is the
template the other public `@genvid` packages will copy.

## Final decisions

- **Package manager: npm** (drop pnpm — c3source has zero runtime deps and never
  used the workspace protocol).
- **Rename** `c3source` -> `@genvid/c3source` (scoped public).
- **Auth: OIDC trusted publishing**, no long-lived token in GitHub or 1Password.
  Provenance automatic.
- **Workflow filenames**: c3source gets `.github/workflows/ci.yml` and
  `.github/workflows/publish.yml` (`publish.yml`, matching npm's convention —
  the filename is part of the trusted-publisher identity). The reusable gate
  lives in the already-existing `genvid-public-ci` repo as
  `.github/workflows/node-gate.yml`.
- **Structure (Option A)**: the `npm publish --provenance --access public` step
  lives in c3source's OWN `publish.yml` (trusted publisher registered against
  `genvid-holdings/c3source` + workflow `publish.yml` — the case npm
  unambiguously supports). The reusable `node-gate.yml` hosts ONLY the shared
  gate; both `ci.yml` and `publish.yml` call it. Rationale: npm's support for
  matching a reusable workflow's `job_workflow_ref` across repos is unverified;
  Option A avoids that bet. A->B is a one-line `uses:` swap if npm later
  confirms cross-repo matching.
- **Release trigger**: tag push `v*.*.*` with a tag<->package.json version guard.
- **Remove** CircleCI/Azure/1Password entirely. Azure `.tgz` consumers are
  converted to npm separately (confirmed).
- Out of scope / leave alone: `.vscode/settings.json` (untracked), `cordova` in
  `test/fixtures/sample-project/project.c3proj` (a C3 setting), `CONVENTIONS.md`
  burbank reference.

## Cross-repo / ordering constraints

1. `genvid-public-ci/.github/workflows/node-gate.yml` must exist on `main`
   **before** c3source's workflows resolve it (P1 gates P4/P5 at run time, not
   commit time).
2. `package-lock.json` (P2) must be committed **before** `pnpm-lock.yaml` is
   deleted (F1), or CI `npm ci` has no lockfile.
3. The rename (F2) must be merged **before** configuring the npm trusted
   publisher (bootstrap), since npm validates the package name + workflow path.

---

## Tasks (P-steps before F-steps; repo stays green after each)

### P1. Seed genvid-public-ci with node-gate.yml (cross-repo)

Create `.github/workflows/node-gate.yml` on `genvid-holdings/genvid-public-ci@main`.

```yaml
name: Node Gate

on:
  workflow_call:
    inputs:
      dry-run:
        description: "Run npm publish --dry-run (non-failing)"
        type: boolean
        default: false

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - if: inputs.dry-run
        run: npm publish --dry-run --access public
        continue-on-error: true
```

Commit (in genvid-public-ci): `feat: add shared node-gate reusable workflow`
Verify: `gh workflow list --repo genvid-holdings/genvid-public-ci` shows it.

### P2. Generate package-lock.json

`npm install`, commit only `package-lock.json`. `pnpm-lock.yaml` stays until F1.
Commit: `chore: generate package-lock.json for npm migration`
Verify: clean `npm ci` succeeds.

### P3. Add package.json metadata + prepack (no rename yet)

Add to `package.json` (preserve TAB indent, keep existing `publishConfig` dist
redirect):
- `description` (text from `.genvid-agent.json`)
- `repository` = `{ "type": "git", "url": "https://github.com/genvid-holdings/c3source.git" }`
- `homepage` = `https://github.com/genvid-holdings/c3source`
- `bugs` = `{ "url": "https://github.com/genvid-holdings/c3source/issues" }`
- `scripts.prepack` = `"npm run build"`
- `publishConfig.access` = `"public"`

Commit: `chore: add package metadata (description, repository, bugs, homepage, prepack, publishConfig.access)`
Verify: `npm pkg get description repository homepage bugs scripts.prepack publishConfig.access`; `npm run build` passes.

### P4. Add .github/workflows/ci.yml

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  gate:
    uses: genvid-holdings/genvid-public-ci/.github/workflows/node-gate.yml@main
    with:
      dry-run: true
```

Commit: `ci: add GitHub Actions CI workflow (calls shared node-gate)`

### P5. Add .github/workflows/publish.yml

```yaml
name: Publish

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  gate:
    uses: genvid-holdings/genvid-public-ci/.github/workflows/node-gate.yml@main

  publish:
    needs: gate
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"
      - name: Upgrade npm for OIDC support
        run: npm install -g npm@latest
      - run: npm ci
      - run: npm run build
      - name: Verify tag matches package version
        shell: bash
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG=$(node -p "require('./package.json').version")
          if [ "$TAG" != "$PKG" ]; then
            echo "Tag $GITHUB_REF_NAME does not match package.json version $PKG"
            exit 1
          fi
      - name: Publish to npm
        run: npm publish --provenance --access public
```

Commit: `ci: add GitHub Actions publish workflow with OIDC trusted publishing`

### F1. Switch to npm: drop pnpm-lock.yaml, update .genvid-agent.json

Delete `pnpm-lock.yaml`. Rewrite `.genvid-agent.json` commands:
- `test` -> `npm run test`
- `lint` -> `npm run lint`
- `build` -> `npm run build`
- `validate` -> `npm run lint && npm run typecheck && npm run test && npm run build`

Commit: `chore: switch to npm — drop pnpm-lock.yaml, update .genvid-agent.json commands`
Verify: `npm run lint && npm run typecheck && npm run test && npm run build` pass; `pnpm-lock.yaml` gone.

### F2. Rename to @genvid/c3source + README imports (highest blast radius)

`package.json` name -> `@genvid/c3source`. Update README import snippets
`from "c3source"` -> `from "@genvid/c3source"`.
Commit: `feat: rename package to @genvid/c3source (scoped public)`
Verify: `node -p "require('./package.json').name"` == `@genvid/c3source`; build passes.

### F3. Delete .circleci/config.yml

Remove `.circleci/` entirely.
Commit: `chore: remove CircleCI configuration`

### F4. Update CLAUDE.md (pnpm->npm, CircleCI->GitHub Actions)

Rewrite the Commands section (pnpm prose + `pnpm exec` examples -> npm/npx) and
the CI & Publishing section (CircleCI/Azure/1Password -> GitHub Actions +
node-gate + publish.yml + OIDC trusted publishing).
Commit: `docs: update CLAUDE.md for npm and GitHub Actions (drop pnpm/CircleCI references)`

### Final validation

`npm run lint && npm run typecheck && npm run test && npm run build` (zero
warnings); `npm pack --dry-run` lists `dist/`, `LICENSE`, `README.md`.

---

## Manual Bootstrap Runbook (human-executed, after F2 merges)

Prereqs: F2 merged to `main`; `@genvid` npm org/scope confirmed owned.

1. **Claim the npm name** (one-time token; OIDC MVP excludes first publish):
   `npm login` then publish a placeholder so the first OIDC publish is a clean
   `0.3.0`:
   - bump to `0.3.0-bootstrap.0` temporarily, `npm publish --access public`,
     then `npm deprecate @genvid/c3source@0.3.0-bootstrap.0 "bootstrap placeholder"`.
2. **Configure the npm Trusted Publisher** on the `@genvid/c3source` package:
   - Repository owner: `genvid-holdings`
   - Repository name: `c3source`
   - Workflow filename: `publish.yml` (exact — part of the OIDC claim)
   - Environment: _(blank)_
3. **Revoke** the one-time token from step 1. No long-lived token remains.
4. **Verify** end-to-end: `git tag v0.3.0 && git push origin v0.3.0`; watch
   `publish.yml`; confirm OIDC publish + provenance badge on npmjs.com.
5. Confirm Azure `.tgz` consumers migrated (out of scope here).

---

## Risks

| Risk | Mitigation |
|------|-----------|
| npm >= 11.5.1 required for OIDC | `publish.yml` runs `npm install -g npm@latest` before publish; pin to a known-good version once confirmed. |
| Reusable-workflow OIDC matching unverified | Option A: only `publish.yml` (registered) publishes; `node-gate.yml` never does. Architecture is the mitigation. |
| Tag/version drift | Version-guard step fails the job before publish. |
| First-publish chicken-and-egg | One-time-token bootstrap claims the name, then trusted publisher is configured, then token revoked. |
| `@main` floating ref for node-gate | node-gate passes no secrets -> low supply-chain risk; pin to tag/SHA once genvid-public-ci adopts release tags. |
| P2/F1 ordering | `package-lock.json` (P2) committed before `pnpm-lock.yaml` deleted (F1). |
| `@genvid` scope ownership | Verify org scope is owned before the bootstrap; create at npmjs.com/org/create if not. |
