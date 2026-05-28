# 🌍 Global Setup Notes

This repo is the package source of truth for `devgod`.
It is not the same thing as an installed consuming repo, and the commands are different.

## 🧭 Keep the boundary straight

### Source repo

This repository owns the reusable package:

- `src/` runtime, installer, MCP, UI, exports, and storage
- `scripts/` setup and verification helpers
- `.agents/` reusable skills
- `.codex/` reusable agent profiles and config
- `.devgod/rules/` and `.devgod/templates/`
- `plugins/` managed hook and plugin surfaces

Typical package-maintainer commands here:

```bash
npm run devgod -- help
npm run setup:local
npm run doctor
npm run status
npm run ops
npm run devgod -- workflow-proof --run-id latest --task-id <task-id>
npm run devgod -- supervisor --format text
npm run devgod -- supervisor-history --format text
npm run export:docs
```

### Consuming repo

A repo that installs DevGod gets a local overlay and local workflow state.

For a new substantive user request, that installed overlay is expected to start with brief clarification when direction is still ambiguous. The default shape is up to four targeted questions about intended outcome, user or operator, constraints/non-goals, and done criteria, or explicit operating assumptions when the request is already clear.

Typical consuming-repo commands there:

```bash
npm run devgod:setup:git-guard
npm run devgod:verify:git-guard
npm run devgod:setup:playwright
npm run devgod:setup:local
npm run devgod:verify:playwright
npm run devgod:doctor
npm run devgod:verify:setup
npm run devgod:status
npm run devgod:coverage
npm run devgod:gaps
npm run devgod:ops
npm run devgod:report
npm run devgod:daemon
npm run devgod:supervisor
npm run devgod:supervisor-history
```

Keep repo-specific live state in the consuming repo:

- `.devgod/work/`
- `.devgod/memory/`
- `.env.devgod`
- runtime registration and review identity wiring

## 🚀 Recommended rollout path

1. Keep this repo as the package source of truth.
2. Install it into one or two real repos first.
3. Prove the local runtime, review identity, git guard, and workflow proof path there.
4. Only after that, promote any stable behavior into global Codex config.

If you want home-level Codex behavior later, use:

- `~/.codex/AGENTS.md`
- `~/.codex/agents/`

Do not start by pushing experimental package guidance into global config.

## ⏱️ Runtime and automation notes for consuming repos

After install, a target repo can use the shipped local bootstrap path:

- `npm run devgod:setup:local`
- `npm run devgod:doctor`
- `npm run devgod:verify:setup`

For UI-affecting work, the shipped browser bootstrap path is now explicit:

- `npm run devgod:setup:playwright`
- `npm run devgod:verify:playwright`

That provisions managed Chromium for the repo-owned Playwright MCP profiles under `.devgod/playwright/`.
Screenshots, traces, and videos stay task-scoped under `.devgod/work/artifacts/playwright/`; do not promote them into durable memory.

That path is the intended "make the repo operational" route when you want the packaged runtime flow.

Useful extra commands in consuming repos:

- `npm run devgod:checkpoint`
- `npm run devgod:resume`
- `npm run devgod:advance-active-task`
- `npm run devgod:reconcile`
- `npm run devgod:sync-runtime-exports`
- `npm run devgod:refresh-retrieval`
- `npm run devgod:plan-context -- --query "what still matters here?"`
- `npm run devgod:export-docs -- "summarize what we worked on today"`
- `npm run devgod:seed-happy-path-fixture -- --task-id fixture-<name>` for synthetic install-proof only
- `npm run devgod:seed-modernization-proof -- --task-id <task-id>` for local modernization-mode proof seeding
- `npm run devgod:verify:review-identity` to replay local adapter fixtures

### Delayed follow-up behavior

Installed repos now distinguish between immediate continuation and delayed follow-up:

- same-thread delayed work can become a Codex app thread automation or a CLI resume-oriented handoff
- fresh-run delayed work can become a Codex app standalone automation or a CLI scheduler handoff
- unsupported or unsafe cases fall back to explicit operator handoff instead of pretending the work can safely continue immediately

The happy-path fixture command is not live workflow proof.
It does not make `.devgod/ACTIVE` authoritative and it does not replace authenticated review evidence.

The modernization proof seed is also not a substitute for real authenticated review evidence in a target repo. It is an installed-package proof path for modernization-mode surfaces.

## 🪪 Review identity

Consuming repos can define multiple named review backends in one reviewed adapter module through `reviewIdentityAdapters` and then select one with `DEVGOD_REVIEW_IDENTITY_BACKEND`.

The operator commands surface that selection so the repo can detect ambiguous or incomplete review trust before relying on recorded approvals.

## 🔌 Optional GitNexus

GitNexus is supported as advisory evidence, not workflow authority.

Typical path:

1. install or upgrade DevGod with `--with-gitnexus`
2. run `npm install`
3. run `npm run devgod:gitnexus:analyze`

The shipped config uses `npx --no-install gitnexus mcp`.
The analyzer intentionally avoids rewriting managed `AGENTS.md` content by default.

## 🧱 Why the split matters

- global instructions are high blast-radius
- repo-local workflow state should stay reviewable and project-specific
- shared package assets should stay reusable instead of absorbing each project's live history
