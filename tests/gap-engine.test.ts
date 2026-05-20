import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutonomousExecutionSnapshot,
  isGapBlocking,
  validateCoverageGapRecord
} from "../src/runtime/autonomous-execution.ts";

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
