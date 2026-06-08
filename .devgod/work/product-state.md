# Product State

## Product Goal

Make `devgod` internally consistent and release-trustworthy for both maintainers working in this source repo and downstream repos installing it as a package.

## Global Acceptance Criteria

- package manifests, shipped files, and role catalogs match the actual repo surface
- workflow templates, scaffold output, workflow checks, and tests agree on the same contract
- maintainers can run the core verification path without hidden drift between docs, code, and exported artifacts
- downstream installs receive a coherent overlay without missing roles, stale templates, or contradictory checks
- duplication, unnecessary surfaces, workflow holes, and real development blockers are documented with follow-up priorities

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Package manifest and pack consistency | done | `package.json`, `tests/install.test.ts`, `npm run check:quality` |
| Workflow template and checker consistency | done | `.devgod/templates/task-packet.md`, `tests/workflow-check.test.ts`, `tests/workflow-scaffold.test.ts`, `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-devgod-internal-consistency-hardening` |
| Maintainer quality gate reliability | done | `npm run typecheck`, `npm test`, `npm run check:quality` |
| Written drift and blocker summary | done | `docs/maintainers/devgod-consistency-gap-summary.md` |

## Current Milestone

Close the repo's current contract drift so `devgod` can be trusted as both source-of-truth package and installable control-layer overlay.

## Completed Milestones

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

No task is currently active under runtime authority. The external runtime-evidence slice, the parent consuming-repo skill-evolution RFC, consuming-repo skill-evolution slice 1, the consuming-repo skill-evolution eval slice, and the consuming-repo skill-evolution trace-mining slice have all been registered and closed under runtime authority.

## Next Task

No immediate successor task is authored yet. The RFC-defined consuming-repo skill-evolution slices are now implemented through trace mining, so any follow-on work should start from a new brief rather than from the original slice chain.

## Blockers

- No active blocker is recorded for the completed consuming-repo skill-evolution slice chain. The next gap is deciding whether to productize the new trace-mining mechanics into CLI/runtime surfaces or to stop at the current module-and-tests completion point.

## Reasoning Debt

- package shipping metadata is still consumed manually by `package.json`, but drift is now centrally verified instead of silently relying on copied lists
- copied contract surfaces still exist in some non-managed maintainer prose and workflow summaries even after centralizing the managed rule/template/helper policy surfaces
- terminal queue-state recognition is explicit to `done`, `complete`, and `completed`; future queue-status additions must keep hook normalization aligned

## Verification Summary

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

## Review Summary

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

2026-06-08
