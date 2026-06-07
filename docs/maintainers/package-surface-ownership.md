# Package Surface Ownership

Audience: `devgod` maintainers reviewing or changing what the installable package ships.

## Canonical source

The package surface is owned by `src/devgod/package-surface.ts`.

Two commands enforce that ownership:

- `npm run verify:package-surface`
- `npm run check:quality`

`package.json.files` is still the npm-facing manifest, but it is not the ownership source. The helper verifies that `package.json.files` matches the canonical surface exactly.

## Ownership model

The canonical helper exposes seven ownership groups:

1. `bootstrap`
   Files required to bootstrap and persist the downstream shared overlay, such as `.devgod/templates/`, `.devgod/rules/`, `.codex/config.toml`, and top-level setup files.
2. `operator_docs`
   Docs intentionally shipped because downstream installs need them during setup or operation, such as `docs/global-setup.md`.
3. `plugin_runtime`
   The packaged Codex plugin descriptors and hook entrypoints under `plugins/devgod/`.
4. `operator_scripts`
   Setup and verification scripts that downstream repos run directly from the installed package.
5. `runtime_sources`
   TypeScript modules intentionally shipped because package scripts and install/runtime flows execute them from `node_modules/devgod/src/...`.
6. `repo_local_skills`
   Repo-local skills shipped when they are referenced by default in the agent catalog, plus the explicit always-shipped exceptions from `src/devgod/repo-local-skill-surface.ts`.
7. `agent_artifacts`
   `.codex/agents/*.toml` files shipped when the agent catalog marks the role as publishing an artifact. The catalog-facing helper lives in `src/devgod/agent-artifact-verifier.ts`.

## What is not part of the shipped surface

These paths are maintainer-only and should stay out of `package.json.files` and the canonical helper:

- `docs/maintainers/`
- `evals/`
- `tests/`
- `scripts/check-coverage.ts`
- maintainer-only mutation/property tooling
- live `.devgod/work/` task state beyond shipped `README.md` placeholders

Related maintainer-only boundaries are summarized in `docs/maintainers/quality-tooling.md`.

## Update procedure

When a shipped path must change:

1. Update the owning source first.
   Static shipped path: edit the relevant ownership group in `src/devgod/package-surface.ts`.
   Repo-local skill: update the agent catalog default skills or the explicit always-shipped list in `src/devgod/repo-local-skill-surface.ts`.
   Agent artifact: update the agent catalog shipping metadata.
2. Sync `package.json.files` to match the canonical helper.
3. Run `npm run verify:package-surface`.
4. Run `node --experimental-strip-types --test tests/install.test.ts`.
5. Run `npm run check:quality`.

If a path is only useful to source-repo maintainers, do not add it to the shipped surface. Document it under `docs/maintainers/` or another maintainer-only location instead.

## Review questions

Before approving a package-surface change, check:

- Does the new path help downstream installs or only source-repo maintainers?
- Which ownership group should contain it?
- Is the same behavior already covered by a shipped directory entry?
- Does the change widen the shipped surface more than necessary?
- Did `verify:package-surface` and `tests/install.test.ts` stay green?

## Remaining gap

The repo now has explicit ownership rules, but npm still consumes a handwritten `package.json.files` array. Drift is verified early, not generated away.
