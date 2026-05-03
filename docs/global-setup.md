# Global Setup Notes

This repo ships the reusable local-control layer for `devgod` plus the first shared-core runtime
foundation.

If you later want global behavior across all repositories, use the official Codex instruction chain:

- global guidance in `~/.codex/AGENTS.md`
- optional custom agents in `~/.codex/agents/`

Recommended path:

1. keep this repo as the source of truth
2. run the shared backend and test the workflow on one or two real projects
3. only then promote the stable local-control pieces into your home-level Codex config

Package here:

- reusable skills and agent profiles
- installer merge logic
- starter `.devgod/rules/`, `.devgod/templates/`, and `.devgod/work/` scaffolding
- setup scripts and the shared-core runtime

Keep local to each consuming repo:

- live `.devgod/work/` tasks, reviews, and releases
- reviewed `.devgod/memory/` entries
- repo-specific `AGENTS.md` overlays
- repo-local `.env.devgod` values and Docker/runtime state

To make Codex configure a repo completely, keep the `devgod-setup` skill, `.env.example`, Docker
Compose file, and setup scripts together so the agent has one repeatable bootstrap path.

Why:

- global rules are powerful
- bad global instructions create confusion everywhere
- project-scoped durable memory stays cleaner than a giant shared memory blob
