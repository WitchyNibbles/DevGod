# Write Scope Rules

- normal workers do not edit `AGENTS.md`, `.codex/`, `.agents/`, or `.devgod/memory/` unless explicitly assigned
- one active writer is allowed per overlapping write scope
- read-only analysis may run in parallel
- wide write scopes are a planning bug, not a convenience feature
- release locks only after handoff or explicit rollback
