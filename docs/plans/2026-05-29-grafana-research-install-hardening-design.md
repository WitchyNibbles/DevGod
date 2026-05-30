# Grafana Detection, Skeptical Research, and Install Reliability Design

## Goal

Improve `devgod` in consuming repos so it can recognize existing Grafana configuration, push broader evidence gathering during debugging and research, and prove that packaged installation works reliably through the Codex-facing install path.

## Problem Summary

Three operator-visible issues are coupled but live in different layers:

1. Grafana support exists, but the installed package does not appear sufficiently aware of existing repo-local Grafana configuration unless the operator restates it.
2. Research and debugging guidance includes bounded skepticism language, but the shipped behavior can still stop too early and report “no other cases” after a narrow pass.
3. Existing tests suggest installer support is fairly mature, but the completion bar here is stronger: prove the installed consuming-repo path, not just the source-repo logic.

## Design Principles

- keep detection mechanics deterministic and code-backed
- keep behavior expectations in shipped package guidance, not ad hoc chat corrections
- preserve install reversibility and upgrade compatibility
- verify installed-repo behavior with replayable harnesses
- distinguish repo configuration from live tool/session availability

## Recommended Approach

### 1. Add repo-aware Grafana detection

Introduce a shared detection surface that can answer questions like:

- does this consuming repo have Grafana-related `.env.devgod` keys?
- does its `.codex/config.toml` wire a Grafana MCP server?
- does `package.json` carry the managed `devgod:grafana:mcp` script?

This should produce structured detection results rather than a single boolean where possible, so later callers can tell the difference between:

- no Grafana evidence
- partial Grafana setup
- repo-configured Grafana
- repo-configured Grafana plus managed MCP wiring

### 2. Surface Grafana awareness in managed package behavior

Update the managed kernel text that gets installed into consuming repos so it no longer frames Grafana use only as “optional MCP server configured.” Instead, it should tell `devgod` to treat repo-local Grafana configuration as a signal to use Grafana-backed evidence when available and useful.

This is intentionally not the same as granting hidden tool authority. The behavior should say:

- detect repo-local Grafana setup
- prefer Grafana evidence when relevant
- if config is partial or the tool is unavailable, say that explicitly instead of pretending Grafana does not exist

### 3. Harden skeptical investigation guidance

Strengthen the shipped guidance in the managed kernel and relevant skills so debugging and research do not stop after one thin path when the task is ambiguous or the claim is broad.

The expected behavior change is:

- separate current evidence from current search scope
- record at least one broader or alternate hypothesis when the first pass is weak
- avoid strong negative claims like “no other cases” unless the search boundary is explicitly established
- use Grafana logs as counter-evidence when the repo is configured and the task is incident-like

### 4. Strengthen install verification on the real operator path

Keep the existing installer architecture, but extend verification around the packaged consuming-repo flow:

- unit coverage for repo-aware Grafana detection
- regression coverage for managed guidance content
- installed-repo harness verification for Grafana-aware paths
- verification that fresh installs and upgrades continue to work when Grafana is absent

## Alternatives Considered

### Prompt-only change

Rejected as insufficient. It may help behavior, but it cannot reliably detect existing repo configuration or prove install reliability.

### Installer-only hardening

Rejected as incomplete. It improves setup confidence but does not fix the runtime/operator-visible behavior gap.

### Full runtime-enforced skepticism checks

Deferred. A deeper runtime contract could eventually enforce stronger investigation requirements, but that would be a larger compatibility surface than needed for this slice.

## Owning Layers

- shared detection logic: `src/grafana/` and callers in install/runtime-facing surfaces
- managed consuming-repo guidance: `src/install/merge.ts` and any shipped skill/kernel content it controls
- installer and verification: `src/install/cli.ts`, harness scripts, and install tests
- regression coverage: `tests/grafana-config.test.ts`, `tests/install.test.ts`, and installed-repo harness coverage

## Risks

- over-detecting Grafana from weak signals and implying a tool is callable when it is not
- broadening managed guidance without strong tests, causing drift later
- breaking upgrade behavior for existing consuming repos

## Mitigations

- return structured detection with explicit states
- keep install behavior backward-compatible and additive
- verify both Grafana-enabled and Grafana-absent paths

## Verification Plan

- focused tests for detection states and config parsing
- focused install tests for init/upgrade/verify behavior with detected Grafana state
- installed-repo harness run covering the packaged Codex-facing path
- workflow proof/live checks after implementation

## Rollback

If the new detection layer proves noisy, revert callers to the previous boolean install-only detection path while keeping unaffected installer behavior intact.
