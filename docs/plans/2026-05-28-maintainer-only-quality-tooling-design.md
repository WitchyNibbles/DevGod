# Maintainer-Only Quality Tooling Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add maintainer-only regression tooling in the `devgod` source repo while proving that target repos and published package files never absorb those surfaces.

**Architecture:** The design keeps all new quality tooling in repo-local maintainer paths and adds a shared boundary helper that classifies maintainer-only scripts, dependencies, and publish paths. Existing install and release tests become the authority for "does this leak to consumers?", while each new tool gets its own CI lane.

**Tech Stack:** `node:test`, `fast-check`, `promptfoo` (pinned to a repo-compatible version), `StrykerJS` TAP runner, existing release-overlay and install tests.

---

## Decisions

- Keep all new tooling outside `package.json.files`.
- Keep all new tooling out of `mergePackageJson(...)` and target-repo manifests.
- Use `fast-check` to prove install-merge invariants across arbitrary target package shapes.
- Use `promptfoo` for repo-local maintainer evals only, backed by a local JavaScript provider so no model API is required for CI.
- Use `StrykerJS` on a narrow boundary surface; CI runs a dry-run validation, while maintainers keep the deeper mutation command for local use.

## Exact directories

- `evals/promptfoo/maintainer-boundary.promptfooconfig.yaml`
- `evals/promptfoo/providers/maintainer-boundary-provider.mjs`
- `tests/properties/maintainer-boundary.property.test.ts`
- `docs/maintainers/quality-tooling.md`

## Exact npm scripts

- `test:properties`
- `eval:promptfoo:maintainer-boundary`
- `test:mutation:maintainer-boundary`
- `test:mutation:maintainer-boundary:dry-run`

## Exact CI job boundaries

- `property-regressions`: runs only `npm run test:properties`
- `promptfoo-maintainer-boundary`: runs only `npm run eval:promptfoo:maintainer-boundary`
- `mutation-maintainer-boundary`: runs only `npm run test:mutation:maintainer-boundary:dry-run`

## Verification

- focused unit/property tests for boundary helpers
- existing install/release-overlay tests
- maintainer-only scripts above
- `npm run verify:release-overlay`
