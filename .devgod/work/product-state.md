# Product State

## Product Goal

Make `devgod` a runtime-authoritative public package that makes Codex behave like a fully autonomous development team: orchestrated intake and research, clarifying questions, fit-for-purpose agent dispatch, independent validation loops, and verified completion before any task is treated as done.

## Global Acceptance Criteria

- package manifests, shipped files, and role catalogs match the actual repo surface
- workflow templates, scaffold output, workflow checks, and tests agree on the same contract
- maintainers can run the core verification path without hidden drift between docs, code, and exported artifacts
- downstream installs are runtime-authoritative by default
- installer, runtime, review, skills, agents, and hooks support the autonomous development-team loop
- implementation agents are reviewed by independent validation agents until functional, formatting, completeness, security, compliance, and task-specific acceptance gates are clean
- duplication, unnecessary surfaces, workflow holes, and real development blockers are removed or replaced with better core surfaces

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Package manifest and pack consistency | restored_locally | Phase 3.1 makes `package.json` public, adds explicit JS `exports` and `bin` entrypoints, ships `dist` bridge files plus `src/public.ts`, routes downstream installer scripts through the public `devgod` command, verifies packed installs can import `devgod` and run the bin, and Phase 3.2 removes raw `node_modules/devgod/src` CLI coupling from managed install surfaces |
| Workflow template and checker consistency | restored_locally | runtime/export semantics are rendered from `src/devgod/workflow-schema.ts`, live completion-audit export enforcement is covered by focused tests, approved-task export obligations now surface in status/ops, the stale June 8 approved trace-mining export set has been repaired, and `npm run check:quality` passed after Phase 2.2 integration; default June 12 workflow proof and live runtime proof remain blocked by missing runtime registration and blocked review exports |
| Maintainer quality gate reliability | restored | `npm run check:quality` passed during the June 12 repair track after Phase 1 gate restoration, Phase 2.1 runtime/export semantics repair, and Phase 2.2 status contradiction repair |
| Written drift and blocker summary | in_progress | `docs/plans/2026-06-12-devgod-repair-roadmap.md` and this product-state export record the new autonomous-team target |

## Current Milestone

The active milestone is `2026-06-12-devgod-autonomous-team-repair`: align `devgod` to the clarified autonomous-team product target and begin with gate restoration under runtime DB authority.

## Completed Milestones

- hardened closeout truth so `specialist_verified` work now requires explicit completion-audit evidence and exported queues no longer collapse `approved` into `done`
- audited `devgod` against `archon` and identified that `devgod` currently has broader surface area but weaker internal consistency
- confirmed that `archon` clears its main quality gate while the current `devgod` worktree fails package-manifest and workflow-contract tests
- restored package-manifest, workflow-template, hook-scope, and agent-metadata consistency across the maintainer and downstream install path
- added maintainer-facing documentation for remaining drift risks and follow-up priorities
- added a canonical shipped-package surface helper and verifier so `package.json` files-list drift now fails before pack time
- centralized workflow schema definitions behind one canonical source reused by the checker, templates, scaffold path, and tests
- documented package-surface ownership explicitly and exposed ownership groups from the canonical helper for maintainers
- simplified workflow contract breadth by removing non-behavioral task-packet requirements while preserving release, review, reasoning, and UI evidence gates
- centralized review-role aliases and review artifact path rules across schema, checker, scaffold/install helpers, and installed happy-path verification
- centralized workflow artifact-ref and review-export policy prose across canonical schema code, managed docs, shipped schema artifacts, and install/scaffold helper guidance
- relaxed stop-hook completion handling so authoritative terminal queue state ends completed tasks without transcript-specific completion wording

## Current Task

`2026-06-12-devgod-autonomous-team-repair` has completed Phase 1 gate restoration, all Phase 2 single-source-of-truth repair tasks, Phase 3.1 public package boundary stabilization, and Phase 3.2 raw node_modules CLI coupling removal in local code, tests, and repaired exports. It still awaits runtime registration plus review-gate cleanup before the active task can be considered complete.

## Next Task

The next roadmap task is Phase 4 command and setup surface consolidation, followed by canonical policy/template rendering and autonomous agent-loop contract hardening.

## Blockers

No product-direction blocker remains. Implementation remains blocked on runtime registration for the new task and review-gate cleanup from the Phase 0 validation agents.

## Reasoning Debt

- package shipping metadata is still consumed manually by `package.json`, but drift is now centrally verified instead of silently relying on copied lists
- copied contract surfaces still exist in some non-managed maintainer prose and workflow summaries even after centralizing the managed rule/template/helper policy surfaces
- terminal queue-state recognition is explicit to `done`, `complete`, and `completed`; future queue-status additions must keep hook normalization aligned
- runtime status and exported queue semantics are intentionally different: runtime tasks may remain `approved` while the exported local queue records them as `done` after closeout
- local markdown status surfaces are now explicitly derived/export evidence, status/ops surface approved-task export contradictions, and the stale `2026-06-08-consuming-repo-skill-evolution-trace-mining` exports have been repaired; review-export drift is still surfaced through workflow checks rather than a separate status subsection
- Phase 3.2 stabilizes the public npm boundary through JS `dist` entrypoints and removes raw `node_modules/devgod/src` CLI coupling from new managed templates, while installed runtime commands still load shipped TypeScript internals through Node experimental type-stripping hooks until a full JS build pipeline exists

## Verification Summary

- `git diff --check` passed for the June 12 roadmap and workflow-artifact edits
- `node --experimental-strip-types --test tests/actions.test.ts tests/orchestration-eval.test.ts tests/control-layer-contract.test.ts tests/ops-recovery.test.ts` passed with 45 tests and 0 failures after Phase 1 gate restoration
- `node --experimental-strip-types --test tests/workflow-integrity.test.ts` passed with 11 tests and 0 failures after Phase 1 gate restoration
- `node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts` passed with 45 tests and 0 failures after idle workflow behavior repair
- `npm run check:coverage` passed during the June 12 repair track with aggregate branch coverage at 80.08 percent
- `npm run check:quality` passed during the June 12 repair track
- `npm run verify:workflow-schema` passed after Phase 2.1 runtime/export semantics integration
- `node --experimental-strip-types --test tests/control-layer-contract.test.ts tests/workflow-integrity.test.ts tests/workflow-check.test.ts` passed with 63 tests and 0 failures after Phase 2.1 integration
- `git diff --check -- AGENTS.md .devgod/rules/review-gate-policy.md .devgod/rules/policy-precedence.md .devgod/templates/task-packet.md src/devgod/workflow-schema.ts tests/control-layer-contract.test.ts tests/workflow-integrity.test.ts scripts/check-devgod-workflow.sh tests/workflow-check.test.ts` passed after Phase 2.1 integration
- `npm run check:quality` passed after Phase 2.1 integration with aggregate branch coverage at 80.16 percent
- `node --experimental-strip-types --test tests/status-report.test.ts tests/ops-recovery.test.ts tests/workflow-integrity.test.ts` passed with 79 tests and 0 failures after Phase 2.2 integration
- `npm run devgod -- status --format text` passed after Phase 2.2 integration and surfaced derived `taskProofObligations` for the stale approved trace-mining task exports, while still emitting JSON under the text flag
- `git diff --check -- src/admin.ts src/admin/status.ts src/admin/ops.ts src/admin/devgod.ts tests/status-report.test.ts tests/ops-recovery.test.ts tests/workflow-integrity.test.ts` passed after Phase 2.2 integration
- `npm run check:quality` passed after Phase 2.2 integration
- `node -e "JSON.parse(require('fs').readFileSync('.devgod/work/proofs/progress-2026-06-08-consuming-repo-skill-evolution-trace-mining.json','utf8')); console.log('json ok')"` passed after Phase 2.3 export repair
- `git diff --check -- .devgod/work/briefs/brief-2026-06-08-consuming-repo-skill-evolution-trace-mining.md .devgod/work/tasks/task-2026-06-08-consuming-repo-skill-evolution-trace-mining.md .devgod/work/proofs/progress-2026-06-08-consuming-repo-skill-evolution-trace-mining.json .devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-reviewer.md .devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-qa_engineer.md .devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-security_reviewer.md` passed after Phase 2.3 export repair
- `bash scripts/check-devgod-workflow.sh --repo-root <temporary-export-root> --task-id 2026-06-08-consuming-repo-skill-evolution-trace-mining` passed after Phase 2.3 export repair
- `bash scripts/check-devgod-workflow.sh --live --external-review-authority --repo-root <temporary-export-root> --task-id 2026-06-08-consuming-repo-skill-evolution-trace-mining` passed after Phase 2.3 export repair
- `npm run devgod -- status --format text` passed after Phase 2.3 export repair and reports the trace-mining `taskProofObligations` entry as `exportState: valid` with no issues
- `bash scripts/check-devgod-workflow.sh --external-review-authority --task-id 2026-06-12-devgod-autonomous-team-repair` passed for the local artifact packet with blocked review exports
- `rg -n 'node_modules/devgod/src/admin/devgod|devgod/src/index|from "devgod/src|"./src/index.ts"|"./src/admin/devgod.ts"' package.json src/install tests dist src/devgod || true` passed after Phase 3.1 integration with no forbidden raw package-boundary references
- `node --experimental-strip-types --test tests/types-modules.test.ts tests/install.test.ts` passed with 70 tests and 0 failures after Phase 3.1 integration, including packed-install import and bin smoke coverage
- `npm run verify:package-surface` passed after Phase 3.1 integration
- `npm pack --dry-run` passed after Phase 3.1 integration and includes `dist/bin/devgod.js`, `dist/index.js`, `dist/register-typescript-hooks.js`, and `src/public.ts`
- `npm run check:quality` passed after Phase 3.1 integration
- `rg -n 'node_modules/devgod/src/|devgod/src/index\.ts|\.\./src/public\.ts' src tests scripts package.json .devgod/templates || true` passed after Phase 3.2 integration with no raw package-boundary references
- `rg -n '/home/eimi/projects/devgod' tests/mcp-tools.test.ts tests/cli-surface-coverage.test.ts tests/install.test.ts src/install/merge.ts package.json || true` passed after Phase 3.2 integration with no checkout-specific test paths
- `node --experimental-strip-types --test tests/mcp-tools.test.ts tests/cli-surface-coverage.test.ts` passed with 14 tests and 0 failures after Phase 3.2 integration
- `npm run check:coverage` passed after Phase 3.2 integration with aggregate coverage at 94.50 percent lines, 85.33 percent branches, and 88.97 percent functions
- `npm run check:quality` passed after Phase 3.2 integration
- GPT-5.5 final validation approved Phase 3.2 after the raw-path, generated-artifact, and coverage-harness findings were repaired
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-autonomous-team-repair` currently blocks because the review exports are intentionally `blocked`
- `bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-12-devgod-autonomous-team-repair` currently fails because runtime has no run for `2026-06-12-devgod-autonomous-team-repair`
- `npm run typecheck` passed after completion-audit closeout hardening
- `node --experimental-strip-types --test tests/admin.test.ts tests/workflow-check.test.ts tests/contracts.test.ts tests/task-queue-repair.test.ts` passed after completion-audit closeout hardening
- `node --experimental-strip-types --test tests/install.test.ts` passed
- `npm run verify:package-surface` passed
- `npm run verify:release-overlay` passed
- `node --experimental-strip-types --test tests/hooks.test.ts` passed
- `node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts` passed
- `node --experimental-strip-types --test tests/install.test.ts` passed
- `npm run typecheck` passed
- `npm test` passed with 693 passing, 0 failing, 1 skipped
- `node --experimental-strip-types --test tests/skill-evolution.test.ts tests/vendored-skills.test.ts` passed after the trace-mining slice
- `npm run typecheck` passed after the trace-mining slice
- `npm test` passed with 700 passing, 0 failing, 1 skipped after the trace-mining slice
- `git diff --check` passed after the trace-mining slice
- `npm run check:quality` passed, including coverage, workflow fixture verification, `npm audit`, and package dry run
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-devgod-internal-consistency-hardening` passed
- `node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts tests/control-layer-contract.test.ts` passed
- `npm run verify:workflow-schema` passed
- `npm run verify:release-overlay` passed with the centralized workflow schema in place
- `npm run check:quality` passed after adding workflow schema verification to the quality path
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-workflow-schema-centralization` passed
- `node --experimental-strip-types --test tests/install.test.ts` passed after adding ownership-group coverage
- `npm run verify:package-surface` passed after the ownership-group refactor
- `npm run verify:release-overlay` passed after the package-surface ownership docs slice
- `npm run check:quality` passed after the package-surface ownership docs slice
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-package-surface-ownership-docs` passed
- `node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts tests/control-layer-contract.test.ts` passed after slimming workflow task-packet requirements
- `npm run verify:workflow-schema` passed after removing non-behavioral workflow headings
- `npm run verify:release-overlay` passed after the workflow-contract breadth simplification slice
- `npm run check:quality` passed after the workflow-contract breadth simplification slice
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-workflow-contract-breadth-simplification` passed
- `node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts` passed after centralizing the review-role contract
- `node --experimental-strip-types --test tests/happy-path.test.ts` passed after fixing installed-fixture review-role lookup against the shipped schema artifact
- `npm run verify:workflow-schema` passed after centralizing review-role aliases and artifact-path helpers
- `npm run verify:release-overlay` passed after the review-role contract centralization slice
- `npm run check:quality` passed after the review-role contract centralization slice
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-review-role-contract-centralization` passed
- `node --experimental-strip-types --test tests/control-layer-contract.test.ts tests/workflow-scaffold.test.ts tests/install.test.ts` passed after centralizing artifact-ref and review-export policy text
- `npm run verify:workflow-schema` passed after promoting the review-gate policy doc into managed renderer output
- `npm run verify:release-overlay` passed after compacting helper-summary policy lines for installed guidance
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-workflow-artifact-ref-policy-centralization` passed
- `node --experimental-strip-types --test tests/hooks.test.ts` passed after normalizing terminal queued task pointers before stop-hook evaluation
- `npm run verify:release-overlay` passed after the stop-hook completion relaxation slice
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-stop-hook-completion-relaxation` passed
- `node --experimental-strip-types --test tests/actions.test.ts tests/workflow-integrity.test.ts tests/control-layer-contract.test.ts` passed after the completion-audit fixture backfill slice
- `node --experimental-strip-types --test tests/admin.test.ts tests/status-report.test.ts tests/ops-recovery.test.ts` passed after the completion-audit fixture backfill slice
- `node --experimental-strip-types ./src/admin/devgod.ts sync-runtime-exports --format text` resynced local workflow exports from runtime authority on 2026-06-09
- `node --experimental-strip-types ./src/admin/devgod.ts reconcile-runtime-state --apply --format text` rebuilt stale runtime queue exports from authoritative runtime signals on 2026-06-09
- `bash scripts/check-devgod-workflow-live.sh --repo-root .` returned idle runtime state on 2026-06-09

## Review Summary

- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-08-devgod-consistency-repair-roadmap-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-08-devgod-consistency-repair-roadmap-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-08-devgod-consistency-repair-roadmap-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-08-completion-audit-fixture-backfill-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-08-completion-audit-fixture-backfill-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-08-completion-audit-fixture-backfill-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-devgod-internal-consistency-hardening-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-devgod-internal-consistency-hardening-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-devgod-internal-consistency-hardening-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-package-surface-manifest-hardening-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-package-surface-manifest-hardening-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-package-surface-manifest-hardening-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-schema-centralization-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-schema-centralization-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-schema-centralization-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-package-surface-ownership-docs-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-package-surface-ownership-docs-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-package-surface-ownership-docs-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-contract-breadth-simplification-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-contract-breadth-simplification-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-contract-breadth-simplification-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-review-role-contract-centralization-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-review-role-contract-centralization-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-review-role-contract-centralization-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-artifact-ref-policy-centralization-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-artifact-ref-policy-centralization-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-workflow-artifact-ref-policy-centralization-security_reviewer.md`
- reviewer approval recorded in `.devgod/work/reviews/review-2026-06-07-stop-hook-completion-relaxation-reviewer.md`
- QA approval recorded in `.devgod/work/reviews/review-2026-06-07-stop-hook-completion-relaxation-qa_engineer.md`
- security approval recorded in `.devgod/work/reviews/review-2026-06-07-stop-hook-completion-relaxation-security_reviewer.md`

## Last Updated

2026-06-12
