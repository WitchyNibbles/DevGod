# Product State

## Product Goal

Make `devgod` frontend work produce stronger, more intentional visual results by default, especially for remake and redesign asks.

## Global Acceptance Criteria

- `devgod` ships a reusable frontend redesign contract for visible UI work
- planners and task packets require explicit redesign intent, visual direction, asset strategy, motion intent, and palette or contrast decisions before code
- shipped frontend role defaults and prompts push toward meaningful redesigns instead of cosmetic restyles
- consuming-repo install output inherits the same frontend expectations
- focused tests fail if the stronger frontend contract drifts

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Frontend redesign contract | done | `.devgod/rules/frontend-redesign-contract.md`, `AGENTS.md`, `src/install/merge.ts` |
| Frontend planning package | done | `.devgod/templates/task-packet.md`, `.codex/agents/planner.toml` |
| Stronger frontend role posture | done | `.agents/skills/devgod-frontend-taste/SKILL.md`, `.codex/agents/frontend-designer.toml`, `src/devgod/agent-catalog.ts`, `docs/devgod-agent-team.md` |
| Drift protection | done | `tests/control-layer-contract.test.ts`, `tests/install.test.ts` |

## Current Milestone

Ship the frontend redesign workflow hardening slice.

## Completed Milestones

- confirmed the current shipped frontend contract mostly blocked obvious slop after the fact instead of forcing a strong design package before code
- confirmed the maintainer manifest already described a richer anti-generic frontend posture than the shipped frontend role visibly enforced
- created a clean worktree from updated `origin/main` at commit `9e6d44e`
- implemented the redesign contract, prompt, template, catalog, and install-surface changes

## Current Task

`none`

## Next Task

`none queued`

## Blockers

- none

## Reasoning Debt

- stronger contract language improves repeatability but still depends on the operator prompt and target repo constraints for the final visual outcome
- no direct consuming-repo proof run against `../hexchange` was executed in this package-level slice

## Verification Summary

- `npm ci` passed in the isolated worktree
- `node --experimental-strip-types --test tests/control-layer-contract.test.ts` passed
- `node --experimental-strip-types --test tests/install.test.ts` passed
- runtime setup repair passed via `npm run bootstrap` and `npm run verify:setup`
- authoritative proof run `0e13e842-7881-4150-84db-3eb225488a12` passed `workflow-proof` for `2026-06-02-devgod-frontend-redesign-workflow`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-06-02-devgod-frontend-redesign-workflow` passed

## Review Summary

- Design and Architecture Council packet recorded with `approved_with_conditions`
- runtime-authenticated reviewer, QA, and security approvals passed in authoritative run `0e13e842-7881-4150-84db-3eb225488a12`

## Last Updated

2026-06-02
