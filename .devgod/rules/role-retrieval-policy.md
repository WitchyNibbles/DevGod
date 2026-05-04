# Role Retrieval Policy

Derived retrieval is a hint layer for `devgod`. It is not authority.

## Global rules

- canonical policy remains `AGENTS.md`, `.devgod/rules/`, and reviewed `.devgod/memory/`
- derived retrieval may help discover files, prior work, and candidate decisions
- important claims must be re-anchored in canonical files before planning, review, or implementation decisions
- no role may treat unreviewed work artifacts as settled policy
- no role may write durable memory through retrieval alone

## Read guidance by role

### `planner`

- may read approved memory, reviewed briefs, reviewed plans, and repo rules

### `product_strategist`

- may read approved briefs, approved memory, repo rules, and cited external research

### `solution_architect`

- may read approved memory, repo rules, reviewed plans, and architecture notes

### `backend_engineer`

- may read approved memory, repo rules, runbooks, and reviewed retrieval notes

### `frontend_designer`

- may read approved memory, repo rules, reviewed plans, and reviewed UI artifacts

### `infra_engineer`

- may read approved memory, repo rules, setup notes, runbooks, and incident learnings

### `security_reviewer`

- may read approved memory, repo rules, incident notes, and review artifacts

### `qa_engineer`

- may read approved memory, repo rules, review gates, and eval artifacts

### `docs_researcher`

- may read approved memory, repo rules, approved briefs, and local technical notes before external lookup

### `reviewer`

- may read approved memory, repo rules, reviewed plans, task packets, and review artifacts

### `build_resolver`

- may read approved memory, repo rules, setup notes, incident notes, and prior fixes

### `memory_curator`

- may read all reviewed project artifacts
- remains the only role that should shape durable memory content

## Write guidance

- roles may write only within their assigned task scope
- durable memory updates require review and promotion discipline
- autonomous per-agent durable memory is not part of `devgod`
