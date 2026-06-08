# Task Packet

## Task ID

`2026-06-04-frontend-media-first-family-reset`

## Owner role

`planner`

## Completion standard

`artifact_complete`

## Required specialist roles

- `frontend_designer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `council_review_required`
- `frontend_acceptance`
- `responsive_acceptance`
- `regression_safety_required`
- `performance_check_required`

## Goal

Break the workflow tendency to reuse the same design primitives, force explicit media-first art-direction choices, and prove the upgraded contract on a genuinely different `hexchange` remake.

## Inputs

- `.agents/skills/devgod-ui-art-direction/SKILL.md`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/rules/frontend-acceptance.md`
- `.devgod/rules/frontend-inspiration-sources.md`
- `.devgod/templates/task-packet.md`
- `.codex/agents/frontend-designer.toml`
- `.codex/agents/planner.toml`
- source-backed research on current strong UI-agent workflows, image-guided design, generated imagery, authored motion, and 3D technical-fit
- latest `hexchange` screenshots showing the “same design reordered” failure mode

## Visual direction package

- repeated-primitive diagnosis
- design-family reset definition
- media-first concept decision
- visual exploration artifact refs
- generated-or-authored asset strategy
- image-generation decision rationale
- motion-system and interaction-choreography choice
- 3D or non-3D technical-fit rationale
- control-preservation map
- screenshot and live-motion critique loop

## Dependencies

- `.devgod/work/briefs/brief-2026-06-04-frontend-media-first-family-reset.md`
- `.devgod/work/plans/plan-2026-06-04-frontend-media-first-family-reset.md`

## Outputs

- updated workflow files in `devgod`
- research-backed maintainer guidance
- fresh `hexchange` remake verified in browser
- archon-vs-devgod Codex-routing audit recorded in maintainer guidance and task artifacts

## Required runtime traces

- `brief://2026-06-04-frontend-media-first-family-reset`
- `plan://2026-06-04-frontend-media-first-family-reset`
- `runtime-proof://latest/2026-06-04-frontend-media-first-family-reset`

## Progress proof

- `.devgod/work/proofs/progress-2026-06-07-archon-codex-frontend-routing-audit.json`
- `.devgod/work/checkpoints/checkpoint-2026-06-07-archon-codex-frontend-routing-audit.md`

## Proof artifacts

- desktop dashboard screenshot: `/home/eimi/projects/devgod/hexchange-dashboard-live-desktop.png`
- mobile dashboard screenshot: `/home/eimi/projects/devgod/hexchange-dashboard-live-mobile.png`
- desktop strategies screenshot: `/home/eimi/projects/devgod/hexchange-strategies-live-desktop.png`
- desktop trades screenshot: `/home/eimi/projects/devgod/hexchange-trades-live-desktop.png`
- latest dashboard snapshot: `.devgod/work/artifacts/playwright/page-2026-06-05T19-31-02-094Z.yml`
- latest strategies snapshot: `.devgod/work/artifacts/playwright/page-2026-06-05T19-39-23-615Z.yml`
- latest trades snapshot: `.devgod/work/artifacts/playwright/page-2026-06-05T19-44-52-201Z.yml`

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-06-04-frontend-media-first-family-reset.md
plan=.devgod/work/plans/plan-2026-06-04-frontend-media-first-family-reset.md
task=.devgod/work/tasks/task-2026-06-04-frontend-media-first-family-reset.md
review_exports=runtime_optional

## Council review

### Required

`true`

### Trigger rationale

This is a substantive workflow and architecture-significant change to the shipped frontend generation contract, affecting planning, acceptance, and future autonomous redesign behavior across consuming repos.

### Decision packet

- `.devgod/work/council/dac-2026-06-04-frontend-media-first-family-reset.md`

### Council members

- `solution_architect`
- `product_strategist`
- `frontend_designer`
- `qa_engineer`

### Dissent owner

`reviewer`

### Outcome

`approved_with_conditions`

### Exception expiry

`none`

## Allowed write scope

- `.agents/skills/devgod-ui-art-direction/SKILL.md`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/rules/frontend-acceptance.md`
- `.devgod/rules/frontend-inspiration-sources.md`
- `.devgod/templates/task-packet.md`
- `.codex/agents/frontend-designer.toml`
- `.codex/agents/planner.toml`
- `docs/maintainers/agentic-frontend-inspiration-sources.md`
- `tests/control-layer-contract.test.ts`
- `.devgod/ACTIVE`
- `.devgod/work/**`
- `../hexchange/app/**`
- `../hexchange/tests/app/**`
- `../hexchange/.devgod/**`

## Out of scope

- backend trading-engine logic changes
- non-frontend package runtime changes unrelated to the workflow contract

## Assumptions

### Approved assumptions

- broad remakes should be allowed to discard inherited layout primitives
- image generation, authored illustration, or 3D should be considered explicitly when the concept needs them, rather than silently skipped
- the proof surface should preserve critical controls without forcing the same old shell family

### Inheritance policy

- discard the inherited dark panel-shell silhouette, serif-led hero framing, and garnish-only motion language
- preserve control discoverability for dashboard, strategy, and trade workflows in a visibly new form

### Blocked assumptions

- a palette swap, poster insert, or reordered shell is enough to count as a new design family
- generated imagery, authored motion, or 3D can be omitted without an explicit rationale

## Reasoning quality

### Claim

- this task needed a workflow-level family reset because the existing frontend contract still allowed broad remakes to collapse into the same panel-first visual primitive set

### Facts

- the shipped workflow already had originality language, but the proof output still showed the same family reordered
- the task has a recorded council decision and proof artifacts covering desktop, mobile, strategy, and trade surfaces
- the task explicitly targeted control-layer workflow changes plus a proof pass in `hexchange`

### Assumptions

- explicit media-first routing and exploration-artifact requirements are the smallest contract changes that materially reduce repeated-family failures
- preserving control discoverability matters more than preserving prior visual structure

### Hypotheses and alternatives

- requiring a frontend entrypoint, UI-surface declaration, media-first concept choice, and exploration artifacts would prevent another same-family reorder
- leaving the workflow as guidance-only would keep producing superficially polished but structurally repeated outcomes

### Evidence refs

- `.agents/skills/devgod-ui-art-direction/SKILL.md`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/rules/frontend-acceptance.md`
- `.devgod/rules/frontend-inspiration-sources.md`
- `.codex/agents/frontend-designer.toml`
- `.codex/agents/planner.toml`
- `.devgod/work/council/dac-2026-06-04-frontend-media-first-family-reset.md`

### Counter-evidence

- a stricter media-first workflow can still fail if it overfits to spectacle and hides key controls

### Confidence

`medium`

### Open questions

- none

### Verification plan

- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- desktop and mobile browser renders for `hexchange`
- Playwright-backed evidence review for dashboard, strategy, and trade surfaces

### Research and debug budgets

- `researchSteps=4 debugSteps=2 reviewPasses=3 toolRetries=2`

## Reasoning policy

### Mode

`strict`

### Requirements

- require an explicit reasoning-quality block
- require bounded reasoning attempts
- require verification records
- require a passed critic or reviewer verification
- require trace refs for attempts
- require a final reasoning verdict before completion

### Max attempts

- `3`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: diagnose repeated-family failure and define workflow reset
- hypothesis: the frontend contract needed stronger routing and artifact requirements to stop broad remakes from reusing the same shell family
- alternatives: keep the existing contract and rely on taste enforcement; require specific media technologies unconditionally
- evidence refs: `.agents/skills/devgod-ui-art-direction/SKILL.md`, `.devgod/rules/frontend-quality-rubric.md`, `.devgod/work/council/dac-2026-06-04-frontend-media-first-family-reset.md`
- verification refs: `verification-1`, `verification-2`, `verification-3`
- trace ref: `brief://2026-06-04-frontend-media-first-family-reset`
- outcome: `supported`
- summary: the strongest bounded fix was to tighten the shipped workflow contract rather than prescribe one rendering stack

### Verification records

- id: `verification-1`
- kind: `critic_review`
- ref: `plan://2026-06-04-frontend-media-first-family-reset`
- status: `passed`
- summary: the plan and council packet both support a contract-level family reset with bounded conditions

- id: `verification-2`
- kind: `human_review`
- ref: `.devgod/work/council/dac-2026-06-04-frontend-media-first-family-reset.md`
- status: `passed`
- summary: the design and architecture council approved the workflow reset with explicit dissent and conditions

- id: `verification-3`
- kind: `tool_output`
- ref: `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- status: `passed`
- summary: the shipped control-layer contract coverage was updated and passed for the frontend-routing slice

### Verdict

- status: `supported`
- summary: the workflow reset is sufficiently evidenced and can stand as the approved task basis
- supporting attempt ids: `attempt-1`
- blocking issues: none

## Acceptance criteria

- source-backed diagnosis explains the repeated “same family reordered” failure mode
- workflow updates require a media-first concept decision and reject repeated shell primitives in broad remakes
- workflow updates require externalized exploration artifacts before production code on broad remakes
- a fresh `hexchange` remake proves a visibly different family and preserves key controls
- focused verification and browser review pass

## Behavior to preserve

- critical dashboard, strategy, and trade controls remain discoverable
- browser-backed proof remains required for interactive frontend work
- frontend workflow decisions remain reviewable from task artifacts rather than implied in code only

## Good-path checks

- the task packet records UI surface, frontend entrypoint, workflow refs, and strict reasoning metadata
- proof artifacts and browser evidence show a visibly new family without losing key controls

## Bad-path or edge-case checks

- same-family reorder attempts fail rubric and acceptance review
- media-heavy directions that hide controls or ignore reduced-motion expectations fail review

## Verification steps

- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- desktop and mobile browser renders for `hexchange`
- review Playwright evidence refs for dashboard, strategies, and trades

## Residual risk disposition

If future broad remakes still converge on the same family, the next fix should tighten the frontend routing or rubric examples rather than silently relaxing the contract.

## Required reviews

- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

- no change widens authenticated review authority
- browser proof remains evidence, not authority by itself
- workflow routing guidance must not auto-approve frontend work

## Anti-patterns

- treating a reordered dark shell as a valid family reset
- using generated media, motion, or 3D without rationale
- hiding route-critical controls behind spectacle

## Rollback notes

Revert the frontend-routing, rubric, and task-artifact contract additions together if they cause false positives; do not keep partial routing changes without the matching acceptance language.

## Handoff format

Summarize the chosen family reset, the preserved controls, the proof evidence refs, and any remaining rubric gaps in concise operator-facing language.

## Retrieval guidance

- prefer the frontend workflow skill, rubric, acceptance rules, and council packet before broad grep
- treat screenshots and Playwright captures as proof aids that must be read with the canonical workflow files

## UI surface

`interactive_flow`

## Playwright requirement

`true`

## Browser evidence expectations

QA review must cite Playwright evidence for the desktop dashboard, mobile dashboard, strategy surface, and trade surface, with screenshots or page captures showing that the new family preserves critical controls.

## Frontend workflow entrypoint

`devgod-ui-art-direction`

## Residual blockers

- Trusted review identities are now configured, but live reviewer gate exports still cannot be recorded because the hexchange devgod runtime database at 127.0.0.1:55432 is unreachable in this session and Docker is unavailable in the current WSL distro.

## 2026-06-07 audit delta

- `archon` already ships a dedicated frontend hub skill and explicit UI-surface gating for its frontend skill cluster.
- `devgod` was already stronger on originality, media-first decisions, and exploration artifacts, but it had not stated the Codex routing entrypoint clearly enough.
- this slice adapts that delta by making `devgod-ui-art-direction` the explicit frontend entrypoint, adding `ui surface` and frontend-entrypoint requirements to task artifacts, and teaching the shipped Codex role prompts to load deeper frontend skills on demand.
