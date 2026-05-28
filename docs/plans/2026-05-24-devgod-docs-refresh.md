# DevGod Docs Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the repo front-door documentation so `README.md`, `docs/current-state.md`, and `docs/global-setup.md` reflect the shipped DevGod surface without losing the README's visual appeal.

**Architecture:** Keep `docs/current-state.md` as the plain-language source of truth, make `README.md` a more polished summary that links into that truth, and align `docs/global-setup.md` to the same package-vs-consuming-repo boundary. Preserve wording required by `scripts/check-docs-runtime-drift.sh`.

**Tech Stack:** Markdown, repo-local shell verification, existing DevGod docs drift guard

---

### Task 1: Refresh the plan and truth docs

**Files:**
- Modify: `README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/global-setup.md`

**Step 1: Audit the current command and workflow surface**

Use the existing package scripts and installed-overlay merge logic as the authority for command names and shipped surfaces.

**Step 2: Rewrite the docs around the current shipped surface**

- keep the README visually appealing with emojis, badges, and compact diagrams
- add the Codex automation/provider surface where it is now part of shipped behavior
- clarify package truth versus consuming-repo truth
- align command examples with `package.json` and `src/install/merge.ts`

**Step 3: Preserve drift-check anchors**

Retain:

- `As of \`2026-05-20\``
- `runtime-proven at the package level`
- `authoritative completion proof is run \`d141baef-0f7a-40df-9aec-ac60ad9235f7\``
- README references to command families including `coverage`, `gaps`, and `report`

### Task 2: Verify the docs against repo checks

**Files:**
- Verify: `scripts/check-docs-runtime-drift.sh`

**Step 1: Run the docs drift check**

Run: `bash scripts/check-docs-runtime-drift.sh`

Expected: `docs/runtime drift checks passed`

**Step 2: Inspect the changed file list**

Run: `git diff -- README.md docs/current-state.md docs/global-setup.md docs/plans/2026-05-24-devgod-docs-refresh.md`

Expected: only the intended documentation files differ
