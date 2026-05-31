# Workflow Integrity Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the workflow-trust failure class where `devgod` can strand proof-seed runs, overstate local completion, or leave cross-run locks behind without deterministic detection and repair.

**Architecture:** Treat runtime state as the only completion authority, make proof-seeding fail-safe, make export completion fail closed without proof, and harden recovery/reporting so contradictory or orphaned state becomes explicit and repairable. The work is split across research/invariant definition, runtime/service fixes, repair tooling, and adversarial verification so safety claims are backed by reproduced failure cases instead of happy-path confidence.

**Tech Stack:** TypeScript, Node CLI/admin commands, Postgres and memory stores, runtime workflow state, Node test runner, shell workflow checks.

---

## Scope Summary

This plan addresses all discovered issues, not just the first visible symptom:

- partial `seed-workflow-proof` failure can strand a `review_blocked` task with an active lock
- local `.devgod/ACTIVE` and `.devgod/work/task-queue.json` can drift into “complete” semantics ahead of runtime proof
- orphan-lock recovery currently depends on the current run ID, which is unsafe for cross-run cleanup
- status/report surfaces can show state that is locally tidy while runtime authority still contradicts it
- current tests over-index on success paths and miss interruption, contradiction, and recovery failures

## Non-Goals

- redesigning the entire workflow engine
- changing review policy semantics unrelated to authority or recovery
- broad UI work
- introducing cloud-only dependencies

## Completion Bar

Do not call this effort complete until all of these are true:

1. The Grafana-class residue state can be reproduced in tests.
2. Partial proof-seed failure either rolls back safely or lands in an explicitly recoverable state with no misleading completion.
3. Local completion/export state cannot move ahead of runtime proof.
4. Cross-run orphan locks can be repaired deterministically and safely.
5. Status/report/check tooling surfaces contradictory authority states as failures or high-signal alerts.
6. Final verification includes both happy-path and adversarial-path evidence.

## Risk Register

| Risk | Why it matters | Mitigation task(s) | Required validation |
|---|---|---|---|
| Fail-safe seed still strands locks | Leaves workflow blocked and lowers trust | Tasks 2, 3, 9 | interruption matrix tests |
| Export gating too weak | Local state can overclaim completion | Tasks 4, 10 | false-completion tests |
| Recovery too aggressive | Could release a valid live lock | Tasks 5, 11 | cross-run lock safety tests |
| Reporting still softens contradictions | Operators can miss integrity failures | Tasks 6, 12 | contradictory-authority tests |
| Repair tooling mutates state unsafely | Could hide forensic evidence | Tasks 7, 13 | dry-run and targeted repair tests |
| Regression suite incomplete | Future changes can reintroduce trust failures | Tasks 8, 14 | integrity suite and final gate |

## Task 1: Define Workflow Integrity Invariants

**Files:**
- Modify: `src/core/service.ts`
- Modify: `src/admin.ts`
- Modify: `src/admin/ops.ts`
- Create: `docs/plans/2026-05-31-workflow-integrity-hardening-implementation.md` (this plan is the parent artifact; implementation work should add a follow-on invariant note if needed)
- Test: `tests/admin.test.ts`
- Test: `tests/ops-recovery.test.ts`

**Intent:** Convert the research into explicit invariants that code and tests can enforce.

**Steps:**
1. Enumerate the authoritative state transitions for run, task, lock, proof, and export state from the current code paths.
2. Document invariant candidates in comments or test names before changing behavior.
3. Add or update tests that assert these invariants at the service/CLI layer:
   - no runtime-approved task may retain an active lock
   - no export-complete state may exist without runtime proof
   - no orphan lock may lack a recovery action
   - no proof seed may appear complete if any required review/proof step failed
4. Run targeted tests to confirm current failures or current gaps are visible before fixes land.

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "seed|workflow proof|sync runtime exports"`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts --test-name-pattern "orphan|recovery|workflow-proof"`

**Expected:** At least one failing or missing-behavior test proves the current integrity gap before implementation proceeds.

## Task 2: Build an Interruption Matrix for Proof Seeding

**Files:**
- Modify: `src/admin.ts`
- Test: `tests/admin.test.ts`

**Intent:** Prove where interruption can happen between claim, lock, handoff, review, proof, and export sync.

**Steps:**
1. Identify the exact sequence in `executeSeedWorkflowProofCommandFromArgs`.
2. Introduce test-only failure injection seams or injectable callbacks so each stage can fail independently.
3. Add failing tests for interruption after:
   - task claim
   - lock creation
   - handoff submission
   - first review
   - second review
   - third review
   - workflow proof
   - export sync
4. Record the resulting state for each interruption and classify it as:
   - safe rollback
   - safe recoverable residue
   - unsafe misleading residue

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "seed workflow proof|interruption|failure injection"`

**Expected:** Tests reproduce the dangerous residue instead of merely describing it.

## Task 3: Make Workflow Proof Seeding Fail-Safe

**Files:**
- Modify: `src/admin.ts`
- Modify: `src/core/service.ts`
- Modify: `src/store/postgres-store.ts`
- Modify: `src/store/memory-store.ts`
- Test: `tests/admin.test.ts`

**Intent:** Ensure proof-seed flows do not leave stranded `review_blocked` runs with active locks after partial failure.

**Approach options to evaluate in code review before final implementation:**
- staged seed with promotion only after all reviews and proof succeed
- compensating rollback on failure
- explicit “seed_incomplete” or equivalent recoverable state with automatic lock release

**Steps:**
1. Choose one fail-safe strategy based on the interruption matrix from Task 2.
2. Write the smallest failing test for the chosen strategy.
3. Implement minimal behavior to make the test pass.
4. Add follow-up tests for every injected interruption stage.
5. Verify that no stage can leave:
   - active lock + no reviews + locally complete-looking exports
   - review-blocked seed residue without a deterministic recovery path

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "seed workflow proof|rollback|recoverable residue"`

**Expected:** Every injected failure lands in safe rollback or explicit recoverable state.

## Task 4: Enforce Runtime-Proof Gating Before Local Completion

**Files:**
- Modify: `src/admin.ts`
- Modify: `src/devgod/task-queue.ts`
- Modify: `scripts/check-devgod-workflow-live.sh`
- Test: `tests/workflow-check.test.ts`
- Test: `tests/admin.test.ts`
- Test: `tests/task-queue-repair.test.ts`

**Intent:** Stop local exports from overclaiming completion ahead of runtime proof.

**Steps:**
1. Identify every code path that can write `.devgod/ACTIVE` or `.devgod/work/task-queue.json` into a terminal-looking state.
2. Add failing tests for:
   - setting `state=complete` without proof
   - setting `project_status=done` without proof
   - syncing complete-looking exports when runtime is still `review_blocked`
3. Implement fail-closed gating with clear error messages.
4. Keep allowed non-terminal export sync behavior intact.
5. Verify the live workflow check rejects contradictory export/runtime completion states.

**Run:**
- `node --experimental-strip-types --test tests/workflow-check.test.ts --test-name-pattern "complete|authoritative runtime proof|rejects"`
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "sync runtime exports|workflow proof"`

**Expected:** Local completion cannot be written or preserved without authoritative proof.

## Task 5: Fix Cross-Run Orphan-Lock Recovery

**Files:**
- Modify: `src/core/service.ts`
- Modify: `src/store/postgres-store.ts`
- Modify: `src/store/memory-store.ts`
- Modify: `src/store/types.ts`
- Test: `tests/ops-recovery.test.ts`
- Test: `tests/postgres-store.test.ts`

**Intent:** Make recovery release the actual orphan lock row, even when it belongs to an older run.

**Steps:**
1. Add failing tests that reproduce:
   - current run blocked by lock from older run
   - recovery action discovered from current run
   - release misses because it filters by current run ID
2. Change recovery actions to carry sufficient lock identity.
3. Update store APIs so orphan-lock release uses lock ownership, not current-run assumptions.
4. Add safety tests proving valid in-progress locks are not released.

**Run:**
- `node --experimental-strip-types --test tests/ops-recovery.test.ts --test-name-pattern "orphan lock|cross-run|release-lock"`
- `node --experimental-strip-types --test tests/postgres-store.test.ts --test-name-pattern "releaseLocksForTask|lock"`

**Expected:** Orphan locks from older runs are safely releasable; live locks remain protected.

## Task 6: Surface Contradictory Authority States Explicitly

**Files:**
- Modify: `src/admin/status.ts`
- Modify: `src/admin/report.ts`
- Modify: `src/admin/ops.ts`
- Test: `tests/status-report.test.ts`
- Test: `tests/report-command.test.ts`
- Test: `tests/ops-recovery.test.ts`

**Intent:** Make contradictions visible and high-signal instead of easy to miss.

**States to surface explicitly:**
- local exports say complete but runtime says review_blocked
- active lock exists for missing task
- proof-seed run exists with handoff but zero reviews
- runtime proof missing while task appears terminal locally

**Steps:**
1. Add failing report/status tests for each contradictory state.
2. Decide whether each contradiction should be:
   - blocking
   - alerting
   - explicitly “derived only / untrusted”
3. Implement the minimal reporting changes.
4. Re-run all report/status/ops tests.

**Run:**
- `node --experimental-strip-types --test tests/status-report.test.ts --test-name-pattern "orphan|contradict|workflow proof"`
- `node --experimental-strip-types --test tests/report-command.test.ts --test-name-pattern "workflow proof|review_blocked|orphan"`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts --test-name-pattern "orphan|operator"`

**Expected:** The system stops presenting tidy but misleading state.

## Task 7: Add Deterministic Repair Tooling

**Files:**
- Modify: `src/admin.ts`
- Modify: `src/core/service.ts`
- Test: `tests/admin.test.ts`
- Test: `tests/ops-recovery.test.ts`

**Intent:** Give operators a safe way to repair already-bad state left by older versions.

**Repair targets:**
- stranded proof-seed runs
- cross-run orphan locks
- export/runtime contradiction where exports overstate completion

**Steps:**
1. Define the repair command inputs and output contract.
2. Add dry-run tests first.
3. Add apply-path tests for targeted repairs.
4. Ensure repair output is auditable and references affected run/task/lock IDs.

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "repair|recover|workflow integrity"`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts --test-name-pattern "applyRecovery|repair"`

**Expected:** Existing bad state can be fixed deliberately without guesswork.

## Task 8: Build a Workflow Integrity Regression Suite

**Files:**
- Create: `tests/workflow-integrity.test.ts`
- Modify: `tests/admin.test.ts`
- Modify: `tests/ops-recovery.test.ts`
- Modify: `tests/workflow-check.test.ts`

**Intent:** Capture the whole trust boundary in one suite, not scattered one-off tests.

**Must reproduce:**
- partial proof-seed failure after handoff
- partial proof-seed failure after first review
- local completion attempt without proof
- cross-run orphan lock blocking a new run
- runtime review-blocked task with locally tidy exports
- old Grafana-style residue: handoff present, zero reviews, active lock

**Steps:**
1. Create the new suite with named scenarios tied to real incident classes.
2. Add a fixture/helper layer for deterministic runtime and export state setup.
3. Add assertions for both prevention and repair.
4. Add comments mapping each scenario to the invariant it protects.

**Run:**
- `node --experimental-strip-types --test tests/workflow-integrity.test.ts`

**Expected:** The exact class of failure is permanently reproducible in tests.

## Task 9: Validate Seed-Flow Risk Mitigations Against the Interruption Matrix

**Files:**
- Modify: `tests/admin.test.ts`
- Modify: `tests/workflow-integrity.test.ts`

**Intent:** Prove the fail-safe seed design handles every interruption point, not just one representative case.

**Steps:**
1. Enumerate each interruption stage from Task 2.
2. Add a direct assertion for the expected end state at each stage.
3. Confirm no stage results in:
   - active lock + no recovery action
   - export-complete + proof-missing
   - review-blocked residue with no evidence of why

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "interruption matrix"`
- `node --experimental-strip-types --test tests/workflow-integrity.test.ts --test-name-pattern "seed interruption"`

**Expected:** Risk coverage is explicit and complete.

## Task 10: Validate False-Completion Prevention End-to-End

**Files:**
- Modify: `tests/workflow-check.test.ts`
- Modify: `tests/admin.test.ts`
- Modify: `tests/workflow-integrity.test.ts`

**Intent:** Ensure the system cannot claim task completion without tests/proof.

**Steps:**
1. Add adversarial tests that attempt to:
   - write local complete state directly through supported command paths
   - sync complete-looking exports from stale runtime state
   - use workflow check with contradictory local evidence
2. Confirm each attempt is rejected with a specific reason.
3. Keep genuine approved-proof paths passing.

**Run:**
- `node --experimental-strip-types --test tests/workflow-check.test.ts --test-name-pattern "rejects.*proof|rejects.*complete"`
- `node --experimental-strip-types --test tests/workflow-integrity.test.ts --test-name-pattern "false completion"`

**Expected:** “It should never say completed without tests” becomes a tested invariant.

## Task 11: Validate Lock-Safety Invariants

**Files:**
- Modify: `tests/ops-recovery.test.ts`
- Modify: `tests/postgres-store.test.ts`
- Modify: `tests/service.test.ts`

**Intent:** Make sure lock cleanup does not solve one bug by creating another.

**Steps:**
1. Add tests for:
   - active valid lock stays active
   - orphan lock from old run is releasable
   - lock for approved task is released
   - lock for missing task is surfaced as orphan
2. Add negative tests proving valid in-progress writers are not unlocked by broad repair logic.

**Run:**
- `node --experimental-strip-types --test tests/ops-recovery.test.ts --test-name-pattern "lock"`
- `node --experimental-strip-types --test tests/postgres-store.test.ts --test-name-pattern "lock"`
- `node --experimental-strip-types --test tests/service.test.ts --test-name-pattern "lock|claimTask"`

**Expected:** Lock repair is safe, not just effective.

## Task 12: Validate Reporting Trust Language

**Files:**
- Modify: `src/admin/report.ts`
- Modify: `src/admin/ops.ts`
- Modify: `tests/report-command.test.ts`
- Modify: `tests/status-report.test.ts`

**Intent:** Ensure user-facing wording never implies authority the runtime has not granted.

**Steps:**
1. Add tests where markdown/export state looks complete but runtime does not.
2. Ensure reports use explicit language such as:
   - `runtime_authoritative`
   - `derived_only`
   - `contradiction`
   - `repair required`
3. Verify no report path uses local completion wording without proof.

**Run:**
- `node --experimental-strip-types --test tests/report-command.test.ts --test-name-pattern "authority|contradiction|complete"`
- `node --experimental-strip-types --test tests/status-report.test.ts --test-name-pattern "authority|orphan|proof"`

**Expected:** Trust boundary is visible in the language, not just hidden in code.

## Task 13: Add Repair-Flow Verification Fixtures

**Files:**
- Create: `tests/fixtures/workflow-integrity/` (or equivalent existing fixture path if the repo has a preferred location)
- Modify: `tests/admin.test.ts`
- Modify: `tests/workflow-check.test.ts`

**Intent:** Preserve realistic broken-state fixtures for future regression checks.

**Fixture scenarios:**
- stranded seed after handoff
- stranded seed after first review
- cross-run orphan lock
- export says done while runtime says review_blocked

**Steps:**
1. Create deterministic fixture builders or static fixture payloads.
2. Use them in both repair and verification tests.
3. Make fixtures small enough to understand but realistic enough to prevent shallow fixes.

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts --test-name-pattern "fixture"`
- `node --experimental-strip-types --test tests/workflow-check.test.ts --test-name-pattern "fixture|authority"`

**Expected:** Future work has reproducible bad states on demand.

## Task 14: Final Workflow Trust Verification

**Files:**
- Modify: relevant tests only if final verification reveals gaps

**Intent:** Close the effort with evidence that the whole system is safer, not just the touched unit.

**Steps:**
1. Run targeted suites from Tasks 1-13.
2. Run broader workflow-sensitive suites.
3. Run runtime proof and live workflow checks on the final hardening task.
4. If any repair command was introduced, run both dry-run and apply verification.
5. Record remaining risk explicitly if any scenario is intentionally deferred.

**Run:**
- `node --experimental-strip-types --test tests/admin.test.ts`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts`
- `node --experimental-strip-types --test tests/workflow-check.test.ts`
- `node --experimental-strip-types --test tests/status-report.test.ts`
- `node --experimental-strip-types --test tests/report-command.test.ts`
- `node --experimental-strip-types --test tests/service.test.ts --test-name-pattern "claimTask|lock|review_blocked"`
- `node --experimental-strip-types --test tests/postgres-store.test.ts --test-name-pattern "lock"`
- `node --experimental-strip-types --test tests/workflow-integrity.test.ts`
- `node --experimental-strip-types ./src/admin/devgod.ts workflow-proof --run-id latest --task-id <hardening-task-id>`
- `bash scripts/check-devgod-workflow-live.sh --task-id <hardening-task-id>`

**Expected:** Both happy-path and adversarial-path evidence pass.

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 5
5. Task 4
6. Task 6
7. Task 7
8. Task 8
9. Task 9
10. Task 10
11. Task 11
12. Task 12
13. Task 13
14. Task 14

## Sequencing Notes

- Do not implement export gating before the invariant and interruption work; otherwise we risk solving only the visible symptom.
- Do not rely on report/ops improvements as a substitute for runtime fixes.
- Keep repair tooling explicit and auditable; no silent best-effort cleanup.
- Prefer failure injection and deterministic fixtures over narrative assumptions.

## Commit Strategy

- Keep commits atomic by task or subtask.
- Use conventional messages that describe the safety slice, for example:
  - `test: reproduce workflow proof seed interruption residue`
  - `fix: make workflow proof seed fail safe`
  - `fix: release orphan locks by owner run`
  - `fix: gate local completion on runtime proof`
  - `test: add workflow integrity regression suite`

## Definition of Done

This effort is done only when:

- the original failure class is reproducible in tests
- the system prevents or repairs it deterministically
- local completion cannot outrun runtime proof
- contradictory authority states are surfaced clearly
- recovery is safe across runs
- final workflow proof and live checks pass on the hardening task
