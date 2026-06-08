# External Runtime Evidence Design For `devgod`

## Status

Proposed

## Date

2026-06-08

## Summary

`devgod` should add a first-class runtime evidence layer that records authenticated review decisions and council outcomes as runtime authority, then lets markdown review exports cite those records as `runtime_verified` summaries.

This is not a new authority system. It is a completion of the current one.

The repo already has:

- authenticated review identity policy
- `record-review`
- review dispatch directives
- `workflow-proof`
- markdown review summaries that distinguish `summary_only` from `runtime_verified`

What is still missing is a single explicit runtime evidence object that:

1. records authenticated review outcomes
2. records council outcomes with conditions
3. gives markdown exports a stable proof reference
4. lets `workflow-proof` enforce both review and council gates against runtime authority

## Problem

Today, `devgod` can represent review intent and review summaries, but design tasks can still stall when there is no runtime-authoritative evidence row for the review trio or the council decision.

That creates an awkward state:

- markdown says “approved”
- runtime authority says “missing authenticated evidence”
- the queue is honestly blocked, but the operator experience is ambiguous

The missing capability is not more markdown. It is a local-first runtime evidence record that bridges authenticated actions to workflow-proof.

## Design goals

- preserve runtime authority as the only completion authority
- preserve markdown as summary/export only
- reuse the current review-identity adapter and `record-review` model
- support council outcomes as runtime evidence, not only the review trio
- remain local-first with no hosted dependency

## Non-goals

- external approval SaaS
- cryptographic signing service outside repo/runtime control
- replacing the current review identity adapter

## Existing baseline

The current repo already establishes these rules:

- authenticated review authority comes from a reviewed principal-binding adapter, not request input
- markdown review files may be `summary_only` or `runtime_verified`
- `workflow-proof` is the authoritative approval check
- review dispatch can fail closed when no authenticated executor exists

This design extends that baseline rather than replacing it.

## Core proposal

Add a runtime evidence model with two record classes:

### 1. review evidence records

Authoritative runtime rows for:

- task id
- run id
- authenticated actor
- resolved review role
- decision
- severity
- findings summary
- evidence refs
- timestamp
- provenance source

These are the authoritative backing records for `reviewer`, `qa_engineer`, and `security_reviewer`.

### 2. council evidence records

Authoritative runtime rows for:

- task id
- run id
- decision packet ref
- authenticated recording actor
- council members
- dissent owner
- outcome
- conditions
- exception expiry if any
- timestamp

These are the authoritative backing records for `council_review_required`.

## Authority model

Authority chain should be:

1. authenticated principal binding
2. trusted runtime action
3. runtime evidence record
4. `workflow-proof`
5. markdown export that cites the runtime proof

Markdown must never invert this chain.

## How reviews become runtime authority

Use the existing `record-review` path as the canonical write path.

Required shape:

- caller authenticates through the live review identity adapter
- role is resolved through reviewed bindings
- runtime stores the review evidence row
- review export may then cite that row or proof run as `runtime_verified`

This part is already mostly present in `devgod`; the design work is mainly to formalize the evidence object and its citation path.

## How council decisions become runtime authority

Council outcomes need an equivalent runtime path.

Add a council-recording action, conceptually parallel to `record-review`, for example:

- `record-council-decision --input .devgod/council-action.json`

Required checks:

- authenticated actor with allowed authority to record the council result
- packet ref exists
- council members listed
- dissent owner present
- outcome valid
- conditions and expiry validated when required

Result:

- runtime stores the council evidence row
- task may satisfy `council_review_required`
- markdown DAC packet remains descriptive, not authoritative

## Runtime proof reference

Every authoritative review or council record should yield a stable proof ref.

Suggested format:

- `runtime-review://<run-id>/<task-id>/<role>/<record-id>`
- `runtime-council://<run-id>/<task-id>/<record-id>`

Markdown summaries can then switch from:

- `summary_only`

to:

- `runtime_verified`

when they cite those refs in `Verification evidence` and `Source handoff`.

## Workflow-proof behavior

`workflow-proof` should treat these as the required runtime checks:

### For required reviews

- latest satisfying review row exists
- actor provenance is authenticated
- role matches required gate

### For council gate

- council evidence row exists for the task
- outcome is satisfying: `approved`, `approved_with_conditions`, or valid `exception_granted`
- conditions are carried forward when required
- expiry is still valid when applicable

## Local-first implementation shape

### Input artifacts

Local repo-owned action files:

```text
.devgod/review-action.json
.devgod/council-action.json
```

These are only inputs to authenticated runtime actions. They are not authority by themselves.

### Runtime-owned outputs

Conceptually:

```text
runtime review rows
runtime council rows
workflow-proof run refs
```

Optional derived exports:

```text
.devgod/work/reviews/*.md
.devgod/work/council/*.md
```

Those exports summarize the runtime rows.

## Minimal schema additions

If implemented at the storage layer, add a council evidence table or equivalent runtime event structure with:

- task id
- run id
- actor
- members
- dissent owner
- outcome
- conditions
- expiry
- created at

Review evidence likely already maps to the current review store, but it should expose a stable runtime proof ref.

## Operator flow

### Review flow

1. Operator or automation prepares a review action file.
2. `record-review` runs through the live review identity adapter.
3. Runtime persists the authoritative review evidence row.
4. Markdown summary is exported as `runtime_verified`.

### Council flow

1. Owner prepares DAC packet and council action file.
2. `record-council-decision` authenticates and validates the outcome.
3. Runtime persists the council evidence row.
4. Markdown council summary/export cites the runtime proof.

### Completion flow

1. Required review trio exists in runtime evidence.
2. Council evidence exists when the quality gate is present.
3. `workflow-proof` passes.
4. Task may complete.

## Why this solves the current blocker

The current blocker exists because:

- the RFC task has markdown review approvals
- the RFC task has a markdown council outcome
- none of those are runtime authority

This design gives `devgod` the missing local-first authority path:

- authenticated reviews become runtime evidence
- council outcomes become runtime evidence
- markdown summaries cite runtime proof

Then the blocker becomes implementable instead of conceptual.

## Risks

- duplicating review data if markdown and runtime drift
- under-specifying who may record council outcomes
- failing to carry council conditions into successor tasks

## Required controls

- fail closed when actor authentication or binding is missing
- fail closed when council metadata is incomplete
- keep markdown exports descriptive only
- ensure `workflow-proof` reads runtime authority first

## Smallest useful slice

### Slice A

- add runtime council evidence recording
- expose stable runtime proof refs for review records
- allow markdown summaries to cite runtime proof refs

### Slice B

- wire `workflow-proof` to enforce council evidence directly
- add operator-facing status/report surfaces for missing runtime evidence

## Recommendation

Implement external runtime evidence as a local-first extension of the current runtime authority model, not as a new approval system.

The exact rule is:

- authenticated actions write runtime evidence
- runtime evidence satisfies workflow gates
- markdown exports summarize and cite runtime evidence

That is the cleanest path to unblock the current RFC and every future council-reviewed design task.
