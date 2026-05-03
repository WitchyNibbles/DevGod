---
name: devgod-setup
description: Use when Codex needs to create and configure the local/shared pieces required for devgod to function in a repo.
---

# Devgod Setup

Use this skill when `devgod` is present but not fully configured, or when a new repo needs the complete local + shared-core setup.

## Goal

Leave the repo in a state where Codex can actually use `devgod`, not just read about it.

## What "working" means

- repo-local control files exist
- Postgres with `pgvector` is reachable
- migrations are applied
- the workspace/project is registered
- health checks pass
- Codex has a clear next prompt for using `devgod`

## Workflow

1. Verify the repo contains the `devgod` runtime and local-control files.
2. Ensure `.env` exists. If missing, create it from `.env.example`.
3. Ensure `DEVGOD_PROJECT_REPO_PATH`, `DEVGOD_PROJECT_SLUG`, and `DEVGOD_PROJECT_NAME` are set for the current repo.
4. Start the local backend with Docker Compose unless the user already provided a managed Postgres backend.
5. Install Node dependencies if `node_modules/` is missing.
6. Run:
   - `npm run migrate`
   - `npm run bootstrap`
   - `npm run verify:setup`
7. Record any durable setup choices in repo memory if they are stable.

## Default commands

Unix-like:

```bash
bash scripts/setup-devgod.sh
```

PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-devgod.ps1
```

## Rules

- prefer the shared core service as the only writer to orchestration state
- do not invent secrets; use `.env` and ask the user only if a real secret or external backend is required
- if Docker is unavailable, switch to a managed Postgres path and document the exact env vars
- if setup fails, report the exact blocking step and command output summary
