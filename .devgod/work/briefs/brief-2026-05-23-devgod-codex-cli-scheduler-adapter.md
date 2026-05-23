# Intake Brief

## Brief ID

`brief-2026-05-23-devgod-codex-cli-scheduler-adapter`

## Task ID

`2026-05-23-devgod-codex-cli-scheduler-adapter`

## Request

Original user ask:

`implement the codex automation integration plan end-to-end, test edge cases, commit each task on a branch from main, open a PR, and fix CI until green`

## Goal

Materialize a local-first CLI scheduler handoff for deferred continuation so CLI-only environments can hand work to `codex exec` with structured outputs instead of looping through operator continuation.

## Intended outcome

- CLI-owned deferred continuation emits a durable scheduler request artifact with `codex exec` command details
- the handoff includes JSONL and output-schema expectations plus prompt material
- same-thread CLI fallback uses explicit resume guidance when session context exists and falls back cleanly when it does not
- supervisor stops after materializing the CLI scheduler handoff instead of enqueueing another continuation rerun

## User

DevGod package maintainer shipping the approved Codex automation roadmap end-to-end.

## Constraints

- preserve local-first correctness without assuming any single scheduler implementation
- keep CLI scheduler handoff as an adapter, not a new truth source
- do not regress the newly landed app automation path
- keep manual-handoff fallback explicit when automation cannot be materialized safely

## Risks

- incomplete scheduler metadata could produce ambiguous or non-runnable handoffs
- hiding resume assumptions could make CLI same-thread fallback silently degrade into a fresh run
- baking one launcher format too deeply could make the package less portable

## Assumptions

### Approved assumptions

- first-wave scheduler ownership stays external and file-based rather than introducing an internal daemon scheduler
- a durable request artifact can carry prompt, schema, and launcher guidance without needing to execute the scheduler immediately
- cron/systemd/operator-managed launchers are sufficient as first-wave targets

### Blocked assumptions

- do not assume every environment can use systemd
- do not assume `codex exec resume` is always available or appropriate for every deferred path

## Evidence

- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`

## Reasoning quality

### Facts

- the runtime envelope already records CLI scheduler ownership as a provider
- the app slice proved the supervisor can stop at a materialized automation handoff instead of rerunning the daemon
- the existing daemon Codex execution path already knows how to invoke `codex exec` with JSONL and output-schema arguments

### Hypotheses and alternatives

- preferred: emit a CLI scheduler request artifact with command, prompt, schema, and launcher hints
- alternative: add only a human-readable note and leave command assembly to operators
- alternative: try to own cron/systemd installation directly inside this slice

### Counter-evidence

- direct scheduler installation would feel more complete, but it would prematurely hard-code environment-specific ownership before the request contract is stable

### Confidence

`high`

### Research and debug budget

- implementation design choice: settled
- code/test exploration: bounded to daemon, supervisor, report, and CLI command-construction surfaces

## Success Criteria

- CLI-owned defer-later continuation emits a runnable request artifact with prompt and output-schema guidance
- supervisor records a CLI scheduler handoff action and stops without launching another Codex turn
- focused tests cover same-thread resume guidance, fresh-run handoff, and unsupported/manual edge cases

## Stop Go

`go`

## Next step

Implement CLI scheduler request materialization and supervisor handoff behavior, then commit the slice on the feature branch.
