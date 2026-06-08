# RFC: Consuming Repo Skill Evolution For `devgod`

## Status

Proposed

## Date

2026-06-08

## Owner

`planner`

## Summary

`devgod` should add a two-layer skill system for consuming repos:

- canonical repo skills remain committed, human-reviewed, and authoritative
- a local writable overlay stores draft skills, evolved variants, and supporting evidence

Autonomous agents and local contributors can create or improve repo-specific skills in the overlay. Promotion into canonical repo skills always happens through a reviewable patch flow with human approval.

This copies the useful part of Hermes' learning loop without inheriting its riskiest property for `devgod`: direct mutation pressure on shared repo authority.

## Problem

Consuming repos need standardized ways to run repo-specific tasks. Today that knowledge tends to live in one of four weak places:

- broad generic skills that miss repo specifics
- repo docs that are not shaped for agent execution
- transcripts and local memory that are not shareable or reviewable
- ad hoc maintainer-authored skills that improve slowly and inconsistently

The result is repeated rediscovery. Contributors and autonomous agents re-learn the same task sequences, pitfalls, and verification steps without a safe path to standardize them.

## Goals

- let agents and contributors draft repo-specific procedural knowledge locally
- keep canonical repo procedures explicit, reviewable, and committed
- preserve current Codex/ECC `SKILL.md` compatibility
- avoid external SaaS dependencies
- make promotion lightweight enough that maintainers will actually use it

## Non-goals

- direct autonomous writes to committed canonical repo skills
- hosted cross-repo skill registries
- model-training or fine-tuning systems
- replacing the existing review-role trio

## Users

### Primary operators

- contributors running repo tasks locally
- autonomous agents running inside consuming repos

### Approvers

- consuming repo maintainers reviewing promoted skills

## Design principles

1. Canonical policy stays committed.
2. Learned behavior stays derived until promoted.
3. Skill artifacts stay inspectable and diffable.
4. Evidence should follow the skill, not stay trapped in transcripts.
5. Evaluation is advisory evidence, not durable authority.
6. Failure to promote must not block local usefulness.

## Source-of-truth layers

### Layer 1: canonical repo skills

Committed repo-local skills under the existing shared skill tree, for example:

```text
.agents/skills/<skill-name>/SKILL.md
.agents/skills/<skill-name>/references/
.agents/skills/<skill-name>/templates/
.agents/skills/<skill-name>/scripts/
```

These remain the authoritative shared procedure set for the repo.

### Layer 2: local overlay skills

Writable learned skills under repo-local operational state:

```text
.devgod/skills/overlay/<skill-name>/SKILL.md
.devgod/skills/overlay/<skill-name>/references/
.devgod/skills/overlay/<skill-name>/templates/
.devgod/skills/overlay/<skill-name>/scripts/
.devgod/skills/evidence/<skill-name>/
.devgod/skills/index.json
```

These are derived operational state, not canonical repo policy.

### Layer 3: promotion artifacts

Reviewable outputs generated from overlay-to-canonical comparison:

```text
.devgod/work/skill-promotions/promotion-<id>.md
.devgod/work/skill-promotions/patch-<id>.diff
.devgod/work/skill-promotions/evals-<id>.json
```

These are evidence and review artifacts for maintainers.

## Core decision

`devgod` should not let agents write directly into committed repo skills by default.

Instead, it should let agents:

1. draft or patch overlay skills
2. collect evidence from the task that triggered the learning
3. run local evaluation or verification where available
4. generate a promotion packet and patch
5. require human review before canonical adoption

## Lifecycle

### 1. detect candidate learning

Triggers can include:

- repeated tool/task pattern with successful completion
- user correction of workflow or output shape
- repeated recovery from the same repo-specific failure
- explicit user request to standardize the procedure

Default rule: bias toward patching an existing overlay umbrella skill before creating a new one.

### 2. create or patch overlay skill

The agent writes to `.devgod/skills/overlay/...`, never to `.agents/skills/...`.

Allowed actions:

- create a new class-level repo skill
- patch an existing overlay skill
- add `references/`, `templates/`, or `scripts/`
- update index metadata such as confidence, last-used timestamp, and promotion status

### 3. attach evidence

The agent stores concise evidence alongside the overlay skill:

- triggering task summary
- relevant commands or verification patterns
- failure and recovery notes
- optional extracted transcript snippets or citations
- evaluation results if run

This keeps learned procedure grounded and reviewable.

### 4. evaluate candidate

Evaluation is local and optional in slice 1, stronger later.

Possible signals:

- skill structure validation
- duplicate/overlap detection against canonical skills
- deterministic script checks in `scripts/`
- replay against synthetic prompts
- replay against local session examples when available

Hard rule: a failed evaluation blocks promotion, not local overlay retention.

### 5. propose promotion

When confidence is high enough or a maintainer requests it, `devgod` generates:

- a markdown promotion summary
- a patch or diff against the canonical skill tree
- evaluation evidence
- identified risks and overlap notes

### 6. human review and merge

Maintainer reviews the promotion artifact like any other repo change.

Outcomes:

- accept as-is
- accept with edits
- defer
- reject and keep overlay local
- reject and archive overlay skill

## Package surface

## Config

Add a `skills.evolution` block to repo or installed config:

```yaml
skills:
  evolution:
    enabled: true
    mode: overlay_only
    auto_draft: true
    auto_patch_existing: true
    promotion_requires_human_review: true
    evidence_retention_days: 30
    draft_trigger_threshold:
      min_tool_iterations: 5
      min_repeat_count: 2
    evaluation:
      enabled: true
      strict_on_promotion: true
      synthetic_replay: true
      local_trace_mining: true
```

Notes:

- `overlay_only` is the only recommended default mode
- no config mode should silently allow direct canonical writes unless a maintainer explicitly opts into an experimental unsafe mode

## Commands

Add CLI/admin commands with compatibility-preserving semantics:

- `devgod skills draft --from-task <task-id>`
- `devgod skills evolve <skill-name>`
- `devgod skills eval <skill-name>`
- `devgod skills promote <skill-name>`
- `devgod skills diff <skill-name>`
- `devgod skills overlay list`
- `devgod skills overlay archive <skill-name>`

Expected behavior:

- `draft` creates or patches overlay skills from current evidence
- `evolve` performs bounded text evolution over overlay skills only
- `eval` runs structure and replay checks
- `promote` generates patch and review packet but does not auto-merge

## Runtime hooks

Add bounded post-task review hooks inside the existing workflow contract:

- post-task skill review
- post-correction skill patch suggestion
- periodic overlay cleanup or consolidation

These hooks must be best-effort and must never block task completion.

## Data model

Add index metadata for overlay skills:

```json
{
  "name": "repo-release-checklist",
  "status": "draft",
  "created_from_task": "2026-06-08-example",
  "canonical_match": "release-prep",
  "confidence": 0.78,
  "last_used_at": "2026-06-08T12:00:00Z",
  "last_eval": {
    "passed": true,
    "score": 0.81
  },
  "promotion": {
    "eligible": true,
    "last_packet": "promotion-2026-06-08-001"
  }
}
```

Suggested states:

- `draft`
- `active_local`
- `promotion_ready`
- `promoted`
- `rejected`
- `archived`

## Skill format compatibility

The proposal intentionally keeps the existing skill format:

- `SKILL.md` with current frontmatter
- same support-file conventions: `references/`, `templates/`, `scripts/`
- same progressive-disclosure retrieval behavior

Compatibility rules:

- overlay skills must pass the same structural validator as canonical skills
- promotion patches must target the same canonical directory structure already used by `devgod`
- evolved text must not require a second proprietary format or hosted storage layer

## Evaluation model

The Hermes lesson worth copying is not “let the model rewrite everything.” It is “treat skill text as an evaluable artifact.”

For `devgod`, use three evaluation levels.

### Level 0: structure only

- frontmatter valid
- size and growth limits respected
- references/scripts/templates stay within allowed directories

### Level 1: local replay

- synthetic prompts for expected triggers
- expected steps or outputs checked by heuristics
- deterministic scripts run where the skill ships a runnable verifier

### Level 2: trace-informed evolution

- mine local task traces or workflow records
- derive success/failure cases
- mutate overlay skill text
- keep only candidates that improve score and preserve constraints

This is closest to the Hermes self-evolution path, but it should remain offline or bounded background work over overlay skills.

## Trust boundaries

### What agents may write autonomously

- `.devgod/skills/overlay/**`
- `.devgod/skills/evidence/**` only after an explicit redaction rule exists; before that, agents may prepare transient evidence inputs but must not persist raw evidence there
- promotion packets under `.devgod/work/skill-promotions/**`

### What agents may not write autonomously by default

- committed canonical skills under `.agents/skills/**`
- review approvals
- release readiness artifacts

### Why

This preserves a clear distinction between learned draft behavior and reviewed shared repo standards.

## Review gates

Promotion should require:

- maintainer review of the patch
- `reviewer` gate for quality and overlap
- `security_reviewer` gate when scripts or commands are introduced
- `qa_engineer` gate when the skill claims verification or replay steps

This does not replace existing task review gates. It adds a promotion-specific approval path for changing shared procedures.

## Retrieval and routing behavior

At runtime, retrieval should prefer:

1. canonical repo skill when a strong match exists
2. promoted overlay variant if explicitly selected by operator
3. draft overlay skill when canonical coverage is weak and local mode allows it

Important default:

Draft overlay skills may influence the local agent, but they should be clearly marked as non-canonical in retrieval results and review notes.

## Consolidation rules

To prevent skill sprawl:

- prefer patching broad umbrella skills over narrow one-off skills
- reject names that encode PR numbers, ticket IDs, or one-day incidents
- run periodic duplicate detection on overlay skills
- archive overlay skills that remain unused past a retention window

## Security posture

Main risks:

- harmful shell steps copied into scripts
- secret leakage in evidence or transcript-derived references
- prompt-injected repo content becoming durable procedure

Required controls:

- redact secrets before evidence persistence
- restrict support files to existing allowed subdirectories
- mark untrusted evidence sources and never auto-promote them
- require security review when promotion adds executable scripts

The explicit redaction baseline for slice 1 and later evidence persistence is captured in:

- `docs/plans/2026-06-08-skill-evidence-redaction-policy.md`

## Operator flows

### Contributor flow

1. Contributor runs a repo task.
2. Agent completes it and drafts or patches an overlay skill.
3. Contributor can inspect `devgod skills diff <skill>`.
4. Contributor requests `devgod skills promote <skill>`.
5. Maintainer reviews the generated patch.

### Autonomous agent flow

1. Agent completes repeated repo-specific tasks.
2. Post-task review updates the overlay skill and records only redaction-safe evidence, or defers evidence persistence until the redaction rule exists.
3. A promotion packet is generated when eligibility threshold is crossed.
4. Maintainer reviews the packet in normal repo workflow.

### Maintainer flow

1. Review promotion summary and diff.
2. Check overlap with existing canonical skills.
3. Edit or merge promoted skill.
4. Mark overlay copy as promoted or archive it.

## Smallest useful first slice

Slice 1 should avoid full autonomous evolution.

### Slice 1

- overlay storage layout
- structural validator reuse
- manual or post-task draft creation
- diff and promotion packet generation
- human-reviewed canonical patch flow

### Slice 2

- local replay evaluation
- duplicate detection
- retention and archive rules

### Slice 3

- trace-informed bounded overlay evolution
- automatic promotion readiness suggestions

## Slice 1 implementation handoff

The first implementation slice should be intentionally narrow:

- create overlay and evidence storage under `.devgod/skills/`
- defer raw evidence persistence unless the redaction rule ships in the same slice
- reuse the existing skill validator for overlay artifacts
- add `draft`, `diff`, and `promote` commands
- generate promotion packets and canonical patches
- keep merge authority fully human

The execution handoff for this slice is captured in:

- `.devgod/work/plans/plan-2026-06-08-consuming-repo-skill-evolution-rfc.md`

## Acceptance gates for this RFC

This proposal should be treated as ready for implementation planning only if all of the following remain true:

- canonical repo skills are never silently mutated by autonomous runtime behavior
- overlay skills remain local derived state with explicit promotion paths
- promotion artifacts are reviewable in ordinary repo workflow
- no new hosted dependency or hidden durable authority is introduced

## First implementation risks

- overfitting the storage contract to one runtime instead of the shared `devgod` package
- making promotion packet generation too verbose for maintainers to use
- failing to detect overlapping draft skills early enough, causing overlay sprawl

The first slice should bias toward fewer moving parts and stronger write-boundary enforcement over ambitious autonomous evolution.

## Why this is better than the naive alternatives

### Better than manual-only skills

- captures repeated repo knowledge sooner
- reduces transcript-only learning
- gives contributors a path to standardize recurring work

### Better than direct canonical mutation

- preserves review and blame boundaries
- prevents silent drift in shared procedures
- reduces the risk of baking transient failures into repo standards

## Open questions

- should overlay skills be repo-local ignored state or optionally shareable among trusted contributors before promotion?
- how should local trace mining work across different supported runtimes with different transcript shapes?
- should promotion generate a commit, a patch file, or both?

## Recommendation

Adopt overlay-first skill evolution as the standard `devgod` pattern for consuming repos.

This gives `devgod` a safe learning loop:

- local usefulness immediately
- shared standardization through review
- compatibility with current skill format
- no hosted dependency

It captures the strongest Hermes idea, procedural learning via explicit skill artifacts, while keeping `devgod` aligned with its own governance model.
