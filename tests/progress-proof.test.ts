import assert from "node:assert/strict";
import test from "node:test";
import {
  hasMeaningfulProgressDelta,
  selectAutonomousNextTarget,
  validateProgressProofRecord
} from "../src/runtime/autonomous-execution.ts";

test("hasMeaningfulProgressDelta rejects zero-delta progress proofs", () => {
  assert.equal(
    hasMeaningfulProgressDelta({
      cycle: 1,
      proofId: "proof-1",
      phaseBefore: "validation",
      phaseAfter: "validation",
      evidenceRefs: ["src/core/service.ts:1"],
      coverageDelta: { validated: 0 },
      blockingGapDelta: { closed: 0, opened: 0 },
      nextTarget: "task:rewrite",
      whyNext: "narrative only",
      createdAt: "2026-05-20T10:00:00.000Z"
    }),
    false
  );
});

test("validateProgressProofRecord requires measurable deltas and next-target rationale", () => {
  const errors = validateProgressProofRecord({
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "validation",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 0 },
    blockingGapDelta: { closed: 0, opened: 0 },
    nextTarget: "task:rewrite",
    whyNext: "   ",
    createdAt: "2026-05-20T10:00:00.000Z"
  });

  assert.match(errors.join(" "), /measurable delta/i);
  assert.match(errors.join(" "), /whyNext/i);
});

test("selectAutonomousNextTarget ignores invalid progress proofs and falls back to the latest checkpoint", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-1",
        checkpointId: "cp-1",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        activeTargets: ["checkpoint:target"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["resume from checkpoint"],
        compressedContextRef: "memory://cp-1",
        createdAt: "2026-05-20T10:10:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 2,
        proofId: "proof-invalid",
        phaseBefore: "validation",
        phaseAfter: "validation",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 0 },
        blockingGapDelta: { closed: 0, opened: 0 },
        nextTarget: "proof:invalid-target",
        whyNext: "narrative only",
        createdAt: "2026-05-20T10:15:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:15:00.000Z"
  });

  assert.equal(target?.source, "checkpoint");
  assert.equal(target?.targetId, "checkpoint:target");
});
