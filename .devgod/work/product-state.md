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
| Workflow template and checker consistency | restored | runtime/export semantics are rendered from `src/devgod/workflow-schema.ts`, live completion-audit export enforcement is covered by focused tests, approved-task export obligations now surface in status/ops, the stale June 8 approved trace-mining export set has been repaired, and the active June 12 task now passes status, artifact workflow proof, and live workflow proof |
| Downstream install contract hardening | restored_locally | Phase 7 focused regressions passed locally: `node --experimental-strip-types --test tests/install.test.ts tests/happy-path.test.ts` passed `120/120`, `bash scripts/verify-installed-repo-harness.sh` passed, `npm run check:happy-path` passed, and the Phase 7 GPT-5.5 audit closed with no findings |
| Release-readiness truthfulness | restored | Phase 8 reconciled `README.md`, `docs/current-state.md`, `.devgod/work/product-state.md`, `.devgod/work/task-queue.json`, and the repair-roadmap proof/review exports to fresh 2026-06-13 command output; package/install proof and runtime workflow closeout are both recorded |

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
- completed Phase 4 command and setup surface consolidation locally, including Phase 4.2 thin-wrapper setup flow hardening
- completed Phase 5 canonical policy/template rendering locally, including Phase 5.1 managed-text rendering and Phase 5.2 skill/agent surface deduplication
- completed Phase 6 local core-vs-optional boundary cleanup so Graphify, Playwright, and Grafana stay follow-up modules instead of core proof blockers
- completed Phase 7 downstream install contract hardening locally; focused regressions passed and a GPT-5.5 audit closed with no findings

## Current Task

`2026-06-12-devgod-autonomous-team-repair` is complete. Phases 1 through 8 are recorded, package/install gates are green, runtime proof run `d5a2b9ac-aa2d-4412-8387-578f0b849102` approved the task, and the required reviewer, QA, and security exports are runtime-verified approvals.

## Next Task

No active task is queued in this checkout. Future work should start from a new task packet, with optional Graphify, Playwright, Grafana, and full JS build-pipeline work treated as separate follow-up scopes.

## Blockers

No product-direction or workflow closeout blocker remains for the June 12 repair task. Optional module enablement and the future full JS build pipeline remain explicit follow-up scopes, not blockers for this completed task.

## Reasoning Debt

- package shipping metadata is still consumed manually by `package.json`, but drift is now centrally verified instead of silently relying on copied lists
- copied contract surfaces still exist in some non-managed maintainer prose and workflow summaries even after centralizing the managed rule/template/helper policy surfaces
- terminal queue-state recognition is explicit to `done`, `complete`, and `completed`; future queue-status additions must keep hook normalization aligned
- runtime status and exported queue semantics are intentionally different: runtime tasks may remain `approved` while the exported local queue records them as `done` after closeout
- local markdown status surfaces are now explicitly derived/export evidence, status/ops surface approved-task export contradictions, and the stale `2026-06-08-consuming-repo-skill-evolution-trace-mining` exports have been repaired; review-export drift is still surfaced through workflow checks rather than a separate status subsection
- Phase 3.2 stabilizes the public npm boundary through JS `dist` entrypoints and removes raw `node_modules/devgod/src` CLI coupling from new managed templates, while installed runtime commands still load shipped TypeScript internals through Node experimental type-stripping hooks until a full JS build pipeline exists
- Graphify remains an optional follow-up surface and still needs repo-local setup plus freshness proof when enabled
- Playwright remains an optional follow-up surface and is only proven in target repos that opt in and pass their own Playwright verification
- Grafana remains an optional advisory surface and should not be conflated with core workflow proof or runtime-authoritative task state

## Verification Summary

- `node --experimental-strip-types --test tests/install.test.ts tests/happy-path.test.ts` passed with `120/120` tests during Phase 7 downstream install contract hardening
- `bash scripts/verify-installed-repo-harness.sh` passed during Phase 7 downstream install contract hardening
- `npm run check:happy-path` passed during Phase 7 downstream install contract hardening
- `npm run check:quality` passed during the latest verified Phase 7 gate run
- `git diff --check` passed during the latest verified Phase 7 gate run
- the Phase 7 GPT-5.5 audit closed with no findings
- no `.only` tests were reported in the maintainer verification surface during the latest verified Phase 7 gate run
- `npm run devgod -- seed-workflow-proof --task-id 2026-06-12-devgod-autonomous-team-repair --workspace-slug default --project-slug devgod` passed and registered runtime proof run `d5a2b9ac-aa2d-4412-8387-578f0b849102`
- `npm run devgod -- status --format text` passed and reports `integrity.status` as `consistent`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-autonomous-team-repair` passed after runtime-verified review export repair
- `bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-12-devgod-autonomous-team-repair` passed after runtime proof and task-packet closeout repair
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
- `bash scripts/check-devgod-workflow.sh --external-review-authority --task-id 2026-06-12-devgod-autonomous-team-repair` passed for the local artifact packet before final runtime proof
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
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-autonomous-team-repair` passed after final runtime proof and review export repair
- `bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-12-devgod-autonomous-team-repair` passed after final runtime proof and task-packet closeout repair
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

- GPT-5.5 closed the Phase 7 downstream install contract audit with no findings
- earlier June 7 and June 8 slice approvals remain recorded in their respective `.devgod/work/reviews/` artifacts
- active June 12 reviewer, QA, and security exports are runtime-verified approvals tied to runtime proof run `d5a2b9ac-aa2d-4412-8387-578f0b849102`
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

2026-06-13
