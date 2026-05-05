# Task Quality Matrix

Use task-type quality gates in addition to the generic review trio.

## Global rules

- all substantive work still requires `reviewer`, `security_reviewer`, and `qa_engineer`
- `specialist_verified` tasks must name at least one required specialist role
- the task packet must list the relevant quality gates explicitly
- handoffs and review gates must cite evidence for the claimed specialist execution and quality checks

## Gate guidance

### `product_acceptance`

- use for ambiguous, customer-facing, or flow-heavy work
- requires user/problem/value framing and measurable success criteria

### `frontend_acceptance`

- use for UI or human-facing artifact work
- requires clarity, consistency, and intentional visual or interaction choices

### `accessibility_acceptance`

- use when visual or interactive output exists
- requires keyboard, semantic, and readability checks appropriate to the surface

### `responsive_acceptance`

- use when the surface must work across viewport sizes or layout contexts

### `tdd_required`

- use for new behavior or bug fixes where a meaningful failing test can exist

### `e2e_required`

- use for critical user, setup, install, or upgrade flows

### `release_readiness_required`

- use for package, installer, migration, setup, or rollout-sensitive work

### `performance_check_required`

- use when retrieval, indexing, large data, or latency-sensitive behavior changes

### `setup_replay_required`

- use when setup, bootstrap, migrations, or environment-sensitive flows change
