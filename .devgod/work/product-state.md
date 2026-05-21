# Product State

## Product Goal

Refresh the package docs so README and supporting docs accurately describe the shipped `2026-05-21` DevGod state, the current command surface, and the distinction between package-source and installed-repo behavior.

## Global Acceptance Criteria

- `README.md` reflects the current package mission, current shipped capabilities, and the actual source-repo command surface
- `docs/current-state.md` reflects the `2026-05-21` package state, including modernization mode and hook hardening
- `docs/global-setup.md` matches the current source-repo versus installed-repo command split without stale script names

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| README reflects current package state and commands | done | `README.md` |
| current-state snapshot reflects shipped 2026-05-21 capabilities | done | `docs/current-state.md` |
| setup docs reflect current source-vs-installed command split | done | `docs/global-setup.md` |

## Current Milestone

Documentation current-state refresh

## Completed Milestones

- modernization mode rollout
- hook autonomy handoff hardening

## Current Task

`2026-05-21-docs-current-state-refresh`

## Next Task

`none`

## Blockers

- none

## Reasoning Debt

- docs that describe runtime-complete redesign claims still need to be kept synchronized with the actual package surface rather than milestone-local workflow snapshots
- source-repo and installed-repo command names diverge intentionally, so docs must continue to call that out explicitly

## Verification Summary

- reviewed `README.md`, `docs/current-state.md`, and `docs/global-setup.md` against `package.json` scripts
- reviewed command and capability descriptions against `src/admin/devgod.ts` and `src/install/merge.ts`

## Review Summary

- docs now describe the `2026-05-21` shipped package state instead of the older `2026-05-20` snapshot
- source-repo and installed-repo command surfaces are now separated using the actual script names that ship today

## Last Updated

2026-05-21
