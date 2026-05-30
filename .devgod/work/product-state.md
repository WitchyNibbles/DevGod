# Product State

## Product Goal

Keep `devgod` trustworthy in consuming repos by improving integration awareness, evidence-gathering skepticism, and installation reliability.

## Global Acceptance Criteria

- existing consuming-repo Grafana configuration is detectable by shared `devgod` behavior
- managed debugging and research behavior avoids premature “no evidence” conclusions when broader investigation is warranted
- packaged install and upgrade flows remain deterministic and replayable for consuming repos
- verification includes installed-repo-style evidence, not only source-repo unit coverage

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Repo-aware Grafana detection | in_progress | intake brief and pending implementation for shared repo signal detection |
| Skeptical research and debugging guidance | in_progress | managed kernel and skill/prompt surfaces under review |
| Reliable consuming-repo install verification | in_progress | install harness and Grafana-enabled verification path under review |

## Current Milestone

Implement and verify Grafana detection, skepticism hardening, and install-path reliability for consuming repos.

## Completed Milestones

- scoped intake and risk triage for the Grafana, research, and install reliability concerns
- approved design direction to fix owning layers in package code plus installed-repo verification

## Current Task

`2026-05-29-grafana-research-install-hardening`

## Next Task

`write approved design artifact, create implementation plan, then execute the package changes with verification`

## Blockers

- no blocker yet; workflow state mismatch was identified and is being reconciled

## Reasoning Debt

- existing install tests suggest some reliability already exists, so implementation should focus on the real gap between packaged capability and operator-visible behavior
- Grafana detection must distinguish “repo is configured for Grafana” from “Grafana MCP is currently callable in this exact session”

## Verification Summary

- shallow inspection confirms Grafana install wiring, Grafana config parsing, and installed-repo harnesses already exist
- shallow inspection also suggests the missing behavior is repo-aware discovery and stronger skeptical investigation guidance, not absence of Grafana client support

## Review Summary

- no review artifacts yet for this active slice

## Last Updated

2026-05-29
