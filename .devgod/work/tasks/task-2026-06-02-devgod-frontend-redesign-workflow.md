# Task Packet

## Task ID

`2026-06-02-devgod-frontend-redesign-workflow`

## Owner role

`frontend_designer`

## Completion standard

`specialist_verified`

## Required specialist roles

- `product_strategist`
- `solution_architect`
- `frontend_designer`
- `technical_writer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `council_review_required`
- `product_acceptance`
- `frontend_acceptance`
- `responsive_acceptance`
- `regression_safety_required`
- `reasoning_strict_required`

## Goal

Patch the shipped `devgod` frontend workflow so redesign asks reliably produce intentional design direction and materially better visible outcomes.

## Inputs

- `.devgod/work/briefs/brief-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.devgod/work/plans/plan-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.devgod/work/council/dac-2026-06-02-devgod-frontend-redesign-workflow.md`
- `AGENTS.md`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/rules/frontend-acceptance.md`
- `.devgod/templates/task-packet.md`
- `.agents/skills/devgod-frontend-taste/SKILL.md`
- `.codex/agents/frontend-designer.toml`
- `.codex/agents/planner.toml`
- `src/devgod/agent-catalog.ts`
- `docs/devgod-agent-team.md`
- `src/install/merge.ts`
- `tests/control-layer-contract.test.ts`
- `tests/install.test.ts`

## Dependencies

- none

## Outputs

- stronger frontend redesign rules and acceptance language
- task-packet guidance for visible UI design direction
- frontend role and catalog improvements
- install output and docs aligned to the new frontend posture
- focused drift tests

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-06-02-devgod-frontend-redesign-workflow.md
plan=.devgod/work/plans/plan-2026-06-02-devgod-frontend-redesign-workflow.md
task=.devgod/work/tasks/task-2026-06-02-devgod-frontend-redesign-workflow.md
reviewer=.devgod/work/reviews/review-2026-06-02-devgod-frontend-redesign-workflow-reviewer.md
qa_engineer=.devgod/work/reviews/review-2026-06-02-devgod-frontend-redesign-workflow-qa_engineer.md
security_reviewer=.devgod/work/reviews/review-2026-06-02-devgod-frontend-redesign-workflow-security_reviewer.md
review_exports=required

## Council review

### Required

`true`

### Trigger rationale

Shared frontend planning, prompt, and review behavior are changing for visible UI work across consuming repos.

### Decision packet

- `.devgod/work/council/dac-2026-06-02-devgod-frontend-redesign-workflow.md`

### Council members

- `solution_architect`
- `product_strategist`
- `frontend_designer`

### Dissent owner

`product_strategist`

### Outcome

`approved_with_conditions`

### Exception expiry

`none`

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.devgod/work/council/dac-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.devgod/work/plans/plan-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.devgod/work/tasks/task-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `AGENTS.md`
- `.devgod/rules/README.md`
- `.devgod/rules/frontend-acceptance.md`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/rules/frontend-redesign-contract.md`
- `.devgod/templates/task-packet.md`
- `.agents/skills/devgod-frontend-taste/SKILL.md`
- `.codex/agents/frontend-designer.toml`
- `.codex/agents/planner.toml`
- `src/devgod/agent-catalog.ts`
- `docs/devgod-agent-team.md`
- `src/install/merge.ts`
- `tests/control-layer-contract.test.ts`
- `tests/install.test.ts`

## Allowed successor task scope

- none

## Scope expansion protocol

If additional runtime or test surfaces outside this list are needed, stop and request the narrowest safe expansion.

## Out of scope

- `.devgod/memory/`
- direct implementation in consuming repos such as `../hexchange`
- image-generation runtime additions
- review-authority changes

## Assumptions

### Approved assumptions

- the current frontend failure mode is mostly contractual, not infrastructural
- visible UI work needs a stronger design brief before code, not only stronger review prose after code

### Blocked assumptions

- do not claim the frontend role can rely on preserving layout when the operator explicitly asked for a remake

## Reasoning quality

### Claim

The smallest safe slice is to strengthen the frontend redesign contract across rules, templates, prompts, install output, and tests.

### Facts

- browser verification already exists for visual work
- redesign intent, asset strategy, and motion planning are not strongly required today
- the maintainer manifest already documents a richer anti-generic stack than the current shipped frontend role visibly enforces

### Assumptions

- a stronger task-packet design package will improve real frontend output quality because it changes how work is framed before implementation

### Hypotheses and alternatives

- preferred: contract plus prompt plus test changes
- alternative: prompt-only change
- alternative: rubric-only change

### Evidence refs

- brief
- plan
- council packet
- source files listed above

### Counter-evidence

- some visual quality variance will still depend on the operator prompt and target repo, even with a stronger contract

### Confidence

`high`

### Open questions

- whether `frontend-design` should become part of the default catalog posture or remain an optional supporting skill

### Verification plan

- update contract and install tests
- rerun the targeted test set after the contract changes

### Research and debug budgets

- one implementation pass
- one bounded repair pass

## Reasoning policy

### Mode

`strict`

### Requirements

Explicit facts, alternatives, evidence refs, verification refs, and a supported verdict are required.

### Max attempts

`2`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: `frontend-contract-hardening`
- hypothesis: the current weakness is a missing redesign contract, not an absence of frontend guidance altogether
- alternatives: prompt-only, rubric-only, model-only
- evidence refs: repo rules, role prompt, task template, maintainer manifest
- verification refs: contract tests, install tests
- trace ref: `worktree codex/frontend-beauty-research from origin/main@9e6d44e`
- outcome: `selected`
- summary: chosen because it changes the planning and review loop instead of only one agent message

### Verification records

- id: `verify-targeted-contract-tests`
- kind: `test`
- ref: `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- status: `pending`
- summary: run after the contract changes are applied

- id: `verify-install-surface`
- kind: `test`
- ref: `node --experimental-strip-types --test tests/install.test.ts`
- status: `pending`
- summary: verify the shipped install output reflects the new frontend contract

### Verdict

- status: `supported`
- summary: proceed with the contract-hardening slice and validate through the targeted tests
- supporting attempt ids: `attempt-1`
- blocking issues: `runtime-authenticated review/export evidence remains separate from this branch-local implementation pass`

## Behavior to preserve

- browser-proof requirement for visible UI tasks
- preserve-existing-system behavior when redesign is not requested
- other specialist role routing outside frontend-related surfaces

## Acceptance criteria

- `devgod` ships a reusable frontend redesign contract that distinguishes polish from substantial redesign work
- visible UI task packets now require explicit redesign intent, current-surface failures, visual direction, layout changes, asset strategy, motion plan, and palette or contrast logic
- frontend role prompts and catalog posture steer more strongly toward intentional, differentiated design
- consuming-repo install output inherits the same frontend expectations
- focused tests anchor the new contract

## Good-path checks

- new UI work can state a strong design direction before code
- existing-app remakes must describe what changes materially and why
- review guidance now checks content, motion, palette, and contrast explicitly

## Bad-path or edge-case checks

- preserve-system tasks can still remain conservative
- unchanged hierarchy or unchanged control-placement bugs are treated as failure for explicit redesign asks
- decorative motion without hierarchy value still fails review

## UI surface

`visual_change`

## Playwright requirement

`true`

## Browser evidence expectations

For `playwright_required = true` tasks:

- `frontend_designer` must perform a browser self-check before handoff
- `qa_engineer` must cite Playwright evidence refs in the runtime review
- screenshots, traces, and videos stay task-scoped artifacts and must not be promoted into durable memory

## Frontend direction package

### Redesign intent

`redesign`

### Current surface failures to correct

- explicit remake asks can still preserve the same layout and hierarchy
- known control-placement problems can survive a redesign pass
- asset, motion, and theme decisions are often underspecified

### Intended visual direction

Make the contract bias toward one strong, intentional concept rather than generic SaaS layouts or timid restyling.

### Layout and hierarchy changes

Visible redesign work must name what changes structurally, not only cosmetically.

### Content and asset plan

Visible UI work must say whether imagery, illustration, animation assets, iconography, or empty-state graphics are generated, sourced, intentionally omitted, or deferred.

### Motion plan

Motion must clarify hierarchy, state, or affordance rather than exist as decoration.

### Theme, palette, and contrast strategy

Visible UI work must name the palette logic, surface roles, and contrast intent instead of relying on ad hoc component colors.

### Mobile composition notes

Mobile composition must be deliberate and not a shrunk desktop clone.

### Browser evidence plan

Capture at least one desktop viewport and one mobile viewport for the touched UI surface.

## Verification steps

- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- `node --experimental-strip-types --test tests/install.test.ts`

## Residual risk disposition

The contract can push design quality upward, but consuming-repo results will still depend on prompt clarity and the target app's real constraints. Record any remaining weak surfaces as follow-up contract gaps rather than claiming universal frontend quality.

## Required reviews

- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

- avoid introducing unaudited remote fetch or asset-loading behavior in the control layer
- keep ambient skill references advisory rather than mandatory runtime authority

## Retrieval guidance

- prefer the current brief, council packet, plan, task packet, frontend rules, and shipped agent artifacts

## Anti-patterns to avoid

- "beautiful" claims with no explicit visual direction
- redesign tasks that preserve the same broken hierarchy
- placeholder cards, empty imagery strategy, or decorative-only motion
- frontend contract changes that silently weaken preserve-existing-system tasks

## Rollback notes

Revert the frontend contract files, prompts, docs, and tests together if this slice is abandoned.

## Handoff format

Include the changed frontend contract, the affected shipped surfaces, test evidence, remaining gaps, and whether redesign-vs-preserve behavior stayed explicit.
