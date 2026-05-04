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
2. Ensure `.env.devgod` exists. If missing, create it from `.env.devgod.example`.
3. Ensure `DEVGOD_PROJECT_REPO_PATH`, `DEVGOD_PROJECT_SLUG`, and `DEVGOD_PROJECT_NAME` are set for the current repo.
4. If bootstrap depends on ignored local `package.json`, local `node_modules/devgod`, repo-local wrapper scripts, or other unreviewed machine-local state, stop and surface that dependency before running anything.
5. Start the local backend with Docker Compose unless the user already provided a managed Postgres backend.
6. If the user explicitly wants the local bootstrap path, run the repo-local setup script and report the package-backed steps it triggers.
7. Record any durable setup choices in repo memory only after successful verification.

## Local bootstrap commands

Unix-like:

```bash
bash scripts/devgod-setup.sh
```

PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/devgod-setup.ps1
```

These commands are local bootstrap helpers, not proof that the underlying package-backed setup path is part of the reviewed workflow surface.

## Rules

- prefer the shared core service as the only writer to orchestration state
- do not invent secrets; use `.env` and ask the user only if a real secret or external backend is required
- if Docker is unavailable, switch to a managed Postgres path and document the exact env vars
- in this repo, do not treat ignored local `package.json` or other unreviewed local bootstrap state as authoritative without surfacing that dependency clearly first
- if setup fails, report the exact blocking step and command output summary
