# CI, Branch Protection, Repo Metadata & Release — Design Spec

> **Goal:** Establish CI quality gates, branch protection, public repo metadata, and a first release tag for Chronoscope.

## 1. Context

Chronoscope is a browser-based HTTP latency diagnostic tool (Svelte 5, TypeScript, Vite, Vitest). Public repo at `xaedyn/chronoscope`, MIT licensed. Solo-dev project with 9 merged PRs, 329 passing unit tests, and no existing CI, branch protection, or releases. Currently local-only (no deployment).

The codebase has 55 ESLint errors that must be fixed before CI can gate on lint.

## 2. CI Workflow

**File:** `.github/workflows/ci.yml`

### Triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

### Concurrency

Cancel in-flight runs when the same ref gets a new push:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### Jobs

Four parallel jobs on `ubuntu-latest`, Node 22, `npm ci` with npm cache via `actions/setup-node`:

| Job | Script | Purpose |
|-----|--------|---------|
| `typecheck` | `npm run typecheck` | Type safety — `tsc --noEmit` |
| `lint` | `npm run lint` | Code quality — `eslint src` |
| `test` | `npm test` | Unit tests — `vitest run` (329 tests) |
| `build` | `npm run build` | Production build — `vite build` |

The `build` job uploads `dist/` as a GitHub Actions artifact with 7-day retention.

### Not Included

- **Playwright visual/a11y tests:** Added later as a separate optional workflow. Unit tests are the CI gate for now.
- **Deploy step:** Chronoscope is local-only. No deployment target exists.
- **Lighthouse:** Removed from the project (dead config).

## 3. Branch Protection

Applied to `main` via GitHub API.

### Enabled

- **Require status checks to pass before merge:** All 4 CI jobs (`typecheck`, `lint`, `test`, `build`) must be green.
- **Require branches to be up to date before merging:** Prevents merging stale PRs that haven't run against the latest main.
- **Prevent force pushes** to main.
- **Prevent deletion** of main.

### Not Enabled

- **Required reviewers:** Solo dev — self-approval is busywork. Skip.
- **Require signed commits:** Not currently set up. Add later if desired.
- **Require linear history:** Nice-to-have but not blocking. Standard merge commits are fine.

### Admin Bypass

Repo admin can bypass protection via `enforce_admins: false` in the branch protection API call. This is an escape hatch for infrastructure issues (e.g., GitHub Actions outage, npm registry down), not a code-quality bypass.

## 4. Repo Metadata

| Field | Value |
|-------|-------|
| **Description** | `Browser-based HTTP latency diagnostic with visual lane-based analysis` |
| **Homepage** | (none — not deployed) |
| **Topics** | `latency`, `speedtest`, `network-diagnostics`, `network-tools`, `web-performance`, `svelte`, `typescript`, `vite`, `web-workers`, `http`, `visualization` |

### Topic Rationale

- **Domain (5):** `latency`, `speedtest`, `network-diagnostics`, `network-tools`, `web-performance` — high signal for users searching for diagnostic tools.
- **Stack (4):** `svelte`, `typescript`, `vite`, `web-workers` — framework discovery. `svelte`, `typescript`, and `vite` have GitHub curated topic pages.
- **General (2):** `http`, `visualization` — broad discoverability. `visualization` has a curated page.

## 5. Release Tag

- **Tag:** `v0.1.0`
- **package.json version:** Bump from `0.0.0` to `0.1.0`.
- **GitHub Release:** Created via `gh release create v0.1.0 --generate-notes` targeting main after all changes land.
- **Semver rationale:** Pre-1.0 signals "usable but evolving." No external consumers depend on API stability yet.

## 6. Node Version Pinning

Add `.node-version` file containing `22` at repo root. This is respected by fnm, nvm, and GitHub Actions `setup-node` (via `node-version-file`).

## 7. Lint Fixes (Prerequisite)

55 ESLint errors must be fixed so CI is green from commit one. Breakdown:

| Category | Count | Fix |
|----------|-------|-----|
| Non-null assertions (`!`) | 17 | Proper null checks or type narrowing |
| Unused variables | 10 | Remove or prefix with `_` |
| Raw visual values | 6 | Extract to design tokens in `tokens.ts` |
| Stale `svelte-ignore` comments | 4 | Remove |
| Missing `{#each}` keys | 3 | Add key expressions |
| Mutable `Map` in reactive context | 3 | Convert to `SvelteMap` |
| Other (unused expressions, DOM manipulation, etc.) | 12 | Case-by-case fixes |

These are real code quality issues, not linter noise.

## 8. Execution Order

1. Create feature branch `chore/ci-and-project-setup`
2. Commit earlier cleanup (deleted s80worker.js, chart.min.js, icons.svg, tsconfig.app.json, lighthouserc.js, static/fonts/.gitkeep; removed unused deps)
3. Fix all 55 lint errors
4. Add `.node-version` file
5. Add `.github/workflows/ci.yml`
6. Bump `package.json` version to `0.1.0`
7. Open PR → CI runs → verify all 4 jobs pass
8. Merge to main
9. Set branch protection via `gh api`
10. Set repo metadata via `gh repo edit`
11. Create GitHub Release `v0.1.0` with auto-generated notes

## 9. Out of Scope

- README.md creation
- Playwright CI workflow
- Deployment configuration
- Automated semantic-release
- GitHub Issue templates or PR templates
- CODEOWNERS
