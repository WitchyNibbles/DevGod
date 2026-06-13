import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutonomousExecutionSnapshot,
  createAutonomousExecutionState,
  isGapBlocking,
  selectAutonomousNextTarget,
  validateCoverageGapRecord
} from "../src/runtime/autonomous-execution.ts";

test("createAutonomousExecutionState seeds the default discovery state", () => {
  const state = createAutonomousExecutionState({
    now: "2026-05-20T09:55:00.000Z"
  });

  assert.equal(state.enabled, true);
  assert.equal(state.profile, "standard_delivery");
  assert.equal(state.phase, "discovery");
  assert.equal(state.manifest, undefined);
  assert.equal(state.executionEpoch, 1);
  assert.deepEqual(state.coverageItems, []);
  assert.deepEqual(state.gaps, []);
  assert.deepEqual(state.checkpoints, []);
  assert.deepEqual(state.progressProofs, []);
  assert.deepEqual(state.pendingInvestigations, []);
  assert.equal(state.updatedAt, "2026-05-20T09:55:00.000Z");
});

test("isGapBlocking treats open critical gaps as blocking even when the boolean flag is stale", () => {
  assert.equal(
    isGapBlocking({
      id: "gap:critical-open",
      targetId: "task:rewrite",
      kind: "contradicting_evidence",
      severity: "critical",
      description: "Critical contradiction remains unresolved.",
      blocking: false,
      evidenceRefs: ["src/core/service.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["reconcile the contradiction"],
      status: "open"
    }),
    true
  );
});

test("buildAutonomousExecutionSnapshot includes critical open gaps in blockingGaps", () => {
  const snapshot = buildAutonomousExecutionSnapshot({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: "run-1",
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    },
    coverageItems: [],
    gaps: [
      {
        id: "gap:critical-open",
        targetId: "task:rewrite",
        kind: "contradicting_evidence",
        severity: "critical",
        description: "Critical contradiction remains unresolved.",
        blocking: false,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["reconcile the contradiction"],
        status: "open"
      }
    ],
    checkpoints: [],
    progressProofs: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:00:00.000Z"
  });

  assert.deepEqual(snapshot.blockingGaps.map((gap) => gap.id), ["gap:critical-open"]);
});

test("validateCoverageGapRecord rejects open gaps without evidence or next actions", () => {
  const errors = validateCoverageGapRecord({
    id: "gap:missing-evidence",
    targetId: "task:rewrite",
    kind: "missing_validation",
    severity: "high",
    description: "Gap lacks enough detail.",
    blocking: true,
    evidenceRefs: [],
    createdBy: "qa_engineer",
    suggestedNextActions: [],
    status: "open"
  });

  assert.match(errors.join(" "), /evidenceRefs/i);
  assert.match(errors.join(" "), /suggestedNextActions/i);
});

test("selectAutonomousNextTarget prioritizes tied critical blocking gaps by id and infers workflow-proof actions", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [
      {
        id: "gap:b",
        targetId: "task:rewrite-b",
        kind: "missing_validation",
        severity: "critical",
        description: "Second critical gap.",
        blocking: true,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["run workflow-proof before resuming"],
        status: "open"
      },
      {
        id: "gap:a",
        targetId: "task:rewrite-a",
        kind: "missing_validation",
        severity: "critical",
        description: "First critical gap.",
        blocking: true,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["run workflow-proof before resuming"],
        status: "open"
      }
    ],
    checkpoints: [],
    progressProofs: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:00:00.000Z"
  });

  assert.equal(target?.source, "blocking_gap");
  assert.equal(target?.targetId, "task:rewrite-a");
  assert.deepEqual(target?.actions, [{ kind: "run_workflow_proof", taskId: "rewrite-a" }]);
  assert.deepEqual(target?.nextActions, ["run workflow-proof before resuming"]);
});

test("selectAutonomousNextTarget falls back to a concrete gap-resolution action when no suggested actions exist", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [
      {
        id: "gap:manual-resolution",
        targetId: "service:rewrite",
        kind: "missing_validation",
        severity: "high",
        description: "Manual resolution is still required.",
        blocking: true,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: [],
        status: "open"
      }
    ],
    checkpoints: [],
    progressProofs: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:05:00.000Z"
  });

  assert.equal(target?.source, "blocking_gap");
  assert.deepEqual(target?.actions, [
    {
      kind: "resolve_blocking_gap",
      gapId: "gap:manual-resolution",
      targetId: "service:rewrite"
    }
  ]);
  assert.deepEqual(target?.nextActions, ["resolve gap:manual-resolution"]);
});
