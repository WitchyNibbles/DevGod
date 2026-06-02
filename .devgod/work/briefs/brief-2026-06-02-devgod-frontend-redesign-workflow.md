# Intake Brief

## Brief ID

`brief-2026-06-02-devgod-frontend-redesign-workflow`

## Task ID

`2026-06-02-devgod-frontend-redesign-workflow`

## Request

Original user ask:

`research how devgod is doing front-end and how to really make it do beautiful designs and implementations, including the design itself, content like images and gifs, animations, themes, color palettes, contrast, repeatable new-build quality, stronger redesigns of existing apps like ../hexchange, and deliver the work on a fresh updated-main branch with atomic commits and an open PR`

## Goal

Make `devgod`'s shipped frontend workflow materially better at producing distinctive, well-composed, content-aware redesigns instead of safe incremental restyles.

## Intended outcome

- a source-backed diagnosis of why the current frontend behavior still produces bland AI UI
- repo-level workflow, prompt, rule, and template changes that force stronger visual direction and redesign intent
- a repeatable execution contract for both new UI builds and remakes of existing apps such as `../hexchange`
- atomic commits on a fresh branch from updated `origin/main`, pushed with an open PR

## User

Primary operator is the `devgod` maintainer who prompts the system directly and wants better visible product outcomes for end-users.

## Problem

`devgod` currently says to avoid generic frontend work, but a frontend request can still pass through planning and delivery with only shallow visual ambition. That allows "same layout, same misplaced buttons, same boring AI style" results to satisfy the workflow even when the operator asked for a remake.

## Value

Stronger frontend workflow defaults raise the floor on visible product quality, reduce repeated operator correction, and make redesign asks produce meaningful before/after change instead of minor CSS polish.

## Audience

- `devgod` package maintainers
- operators using `devgod` to generate or remake UI
- end-users of consuming-repo interfaces indirectly shaped by this workflow

## Constraints

- preserve the effectiveness of other specialist roles unless they need direct frontend-related adjustments
- keep package assets reusable and repo-local instead of depending on per-project live state
- prefer contract changes that can be enforced through prompts, rules, templates, and tests instead of a large runtime rewrite

## Risks

- adding taste language without a concrete task-packet contract may still yield generic output
- forcing a redesign loop too broadly could conflict with tasks that intentionally preserve an existing design system
- adding ambient-skill assumptions could make the package less reliable in consuming repos
- broad prompt changes could drift if the catalog, shipped agent artifact, and install output do not all agree

## Unknowns

- how much of the current weakness comes from agent skill posture versus planner/task artifact gaps
- whether the maintainer docs already describe a stronger anti-generic stack that the shipped runtime never fully adopted
- which minimal control-layer changes will most improve redesign quality without touching unrelated specialist behavior

## Clarifying questions

- deliverable is all three: diagnosis, recommended workflow improvements, and actual repo changes
- primary beneficiaries are the operator and end-users
- constraint is to avoid collateral damage to other specialist roles unless the frontend improvement requires touching them
- success means a repeatable beautiful-design workflow, stronger redesign behavior for existing apps, atomic commits on a fresh branch from updated `origin/main`, and an open PR

## Council need

`required`

## Council rationale

This changes shared frontend workflow policy, planner/task expectations, and shipped agent behavior for human-facing work across consuming repos.

## Assumptions

### Approved assumptions

- the most leverage is in control-layer guidance rather than model swapping alone
- a redesign contract should distinguish between preserve-and-polish work and explicit remake/reimagine work
- browser verification should stay mandatory for visible UI claims, but the design brief must become stronger before code starts

### Blocked assumptions

- do not assume a more powerful frontend result will come from "use the frontend role" alone without changing the contract it operates under
- do not assume every consuming repo wants radical redesigns when the task only asks for maintenance or design-system preservation

## Evidence

- `AGENTS.md`
- `.agents/skills/devgod-frontend-taste/SKILL.md`
- `.agents/skills/devgod-design-system/SKILL.md`
- `.codex/agents/frontend-designer.toml`
- `.codex/agents/planner.toml`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/rules/frontend-acceptance.md`
- `.devgod/templates/task-packet.md`
- `src/devgod/agent-catalog.ts`
- `docs/devgod-agent-team.md`
- `docs/maintainers/day-one-agent-skill-manifest.md`
- `/home/eimi/.agents/skills/frontend-design/SKILL.md`

## Reasoning quality

### Facts

- the shipped frontend role already references anti-generic guidance and browser proof, but the current contract does not require a strong redesign brief
- the task packet template has UI-surface and Playwright sections, but no explicit design-direction or redesign-delta section
- the maintainer manifest already says frontend work should not rely on a single skill and names a richer anti-generic stack
- the user's reported failure mode matches a contract gap: bland redesigns can still technically satisfy the current visible-UI checks

### Hypotheses and alternatives

- preferred: strengthen planner, task packet, frontend role, rubric, and AGENTS/install guidance together
- alternative: only improve the frontend role prompt
- alternative: only add more severe review language after implementation
- alternative: treat this as purely a model-quality issue instead of a workflow issue

### Counter-evidence

- stronger workflow text alone will not guarantee beauty if the implementation role ignores it, so the role prompt and default skill posture must change alongside the rules

### Confidence

`high`

### Research and debug budget

- two shallow repo inspections completed before planning
- one focused implementation slice across workflow artifacts, role prompts, rules, docs, and tests

### Verification plan

- update contract tests that anchor frontend workflow behavior
- run targeted tests first, then broader verification if needed
- inspect diffs and split commits by slice

## Success Criteria

- `devgod` documents and enforces a repeatable redesign contract for visible UI work
- frontend task packets require explicit redesign depth, visual direction, content or asset strategy, motion intent, and palette or contrast decisions
- frontend role defaults and prompts push for material redesigns when the user asks for one
- install output and repo docs carry the same frontend expectations into consuming repos
- tests fail if the stronger frontend contract drifts

## Completion bar

- implementation and tests land on a fresh branch from updated `origin/main`
- changes are committed atomically and pushed
- a PR is opened with the completed slice

## Good-path outcomes

- new UI work starts from an intentional visual concept instead of a stock layout
- redesign asks materially change hierarchy, layout, and affordances where needed
- tasks explicitly account for imagery, illustration, motion, theme, palette, and contrast instead of leaving them implicit

## Bad-path or edge-case outcomes

- preserve-existing-system tasks can still stay conservative when the contract says not to redesign
- bland "restyle the same UI" output is treated as failure when the operator asked for a remake
- browser verification still catches layout regressions on both desktop and mobile

## Non-goals

- shipping a new image-generation runtime
- forcing every UI task into a radical visual overhaul
- replacing the existing review trio or runtime workflow-proof authority

## Out of scope

- durable memory changes
- unrelated backend, auth, or deploy workflows
- direct UI edits inside `../hexchange` during this repo-level control-layer slice

## Council handoff target

`solution_architect`

## Trust boundaries

- repo-local workflow policy and templates
- shipped agent artifacts and catalog defaults
- consuming-repo install output
- ambient skills that may be available in some sessions but should not be the sole authority

## Stop Go

`go`

## Next step

Record the council decision, produce the implementation plan and task packet, then patch the frontend workflow contract in the smallest safe slice.
