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

Useful runtime operator commands inside a consuming repo:

- `npm run devgod:seed-happy-path-fixture -- --task-id fixture-<name>` for a synthetic install-proof fixture
- `npm run devgod:status -- --run-id <run-id>` for one authority-labeled status report
- `npm run devgod:ops -- --run-id latest --format text` for the operator dashboard
- `npm run devgod:recover -- --run-id <run-id>` for advisory recovery inspection or `--apply-safe` to repair safe cases
- `npm run devgod:health` for database reachability
- `npm run devgod:verify:review-identity` to replay reviewed adapter fixtures

The synthetic fixture command does not write `.devgod/ACTIVE` and does not create authoritative review summaries. Use it only for install-proof checks, never for live workflow completion.

For review identity, consuming repos can keep multiple named backends in one reviewed adapter module via `reviewIdentityAdapters` and select one with `DEVGOD_REVIEW_IDENTITY_BACKEND`. `devgod:status` and `devgod:ops` surface that selection state so operators can detect ambiguous multi-backend configs before trusting live reviews.

Optional GitNexus setup:

- add the MCP server explicitly: `codex mcp add gitnexus -- npx -y gitnexus@latest mcp`
- index the repo with `npx gitnexus analyze --skip-agents-md`
- treat GitNexus as advisory evidence only; `devgod:status` and `devgod:ops` surface its readiness and freshness without granting it workflow authority
- avoid letting GitNexus rewrite managed control-layer files by default

To make Codex configure a repo completely, keep the `devgod-setup` skill, `.env.example`, Docker
Compose file, and setup scripts together so the agent has one repeatable bootstrap path.

Why:

- global rules are powerful
- bad global instructions create confusion everywhere
- project-scoped durable memory stays cleaner than a giant shared memory blob
