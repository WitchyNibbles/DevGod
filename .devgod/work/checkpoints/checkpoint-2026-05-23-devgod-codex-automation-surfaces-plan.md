# Checkpoint

## Task

`2026-05-23-devgod-codex-automation-surfaces-plan`

## Status

`done`

## Date

`2026-05-23`

## Completed in this slice

- researched the current Codex app automation surface from official docs
- researched the current Codex CLI automation surface from official docs and local CLI help
- confirmed the app supports standalone and thread automations, project vs worktree execution, and background triage reporting
- confirmed the CLI supports scripted `codex exec` runs, JSONL event streaming, output schemas, and resume for two-stage automation pipelines
- recorded a `devgod` integration plan that moves delayed execution ownership away from hooks and onto native app or CLI automation providers

## Evidence

- `docs/codex-automation-surface-integration-plan.md`
- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-surfaces-plan.md`
- `.devgod/work/tasks/task-2026-05-23-devgod-codex-automation-surfaces-plan.md`

## Key decisions recorded

- hooks should remain policy and safety gates, not schedulers
- `defer_same_thread` should prefer app thread automations when the app surface exists
- `defer_fresh_run` should prefer app standalone automations, then CLI scheduled exec runs
- CLI JSONL plus structured final output is the stable machine interface for local-first automation
- app-server and remote-control stay optional control-plane extensions until they prove mature enough for package commitments

## Next recommended action

Implement a provider-backed automation envelope in `devgod` that writes wake-up ownership into runtime state and creates native app or CLI automation jobs accordingly.
