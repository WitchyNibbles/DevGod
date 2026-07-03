import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAutonomousExecutionBlockers,
  computeComprehensionSummary,
  computeCoverageSummary,
  computePhaseReadiness,
  createAutonomousExecutionState,
  hasMeaningfulProgressDelta,
  selectAutonomousNextTarget,
  validateProgressProofRecord
} from "../src/runtime/autonomous-execution.ts";
import type {
  AutonomousExecutionState,
  QualityGate,
  TaskRecord,
  UnderstandingMapKind
} from "../src/domain/types.ts";

const standardDeliveryUnderstandingKinds: readonly UnderstandingMapKind[] = [
  "repo_map",
  "subsystems",
  "route_map",
  "integration_map",
  "config_coupling",
  "runtime_side_effects"
];

const legacyRewriteUnderstandingKinds: readonly UnderstandingMapKind[] = [
  "repo_map",
  "subsystems",
  "route_map",
  "model_map",
  "integration_map",
  "authz_map",
  "config_coupling",
  "runtime_side_effects"
];

function createTaskRecord(qualityGates: QualityGate[]): TaskRecord {
  return {
    id: `task:${qualityGates.join("+") || "none"}`,
    runId: "run-test",
    workspaceId: "workspace-test",
    projectId: "project-test",
    packet: {
      taskId: "task-packet",
      title: "autonomous execution test task",
      ownerRole: "planner",
      completionStandard: "artifact_complete",
      requiredSpecialistRoles: [],
      qualityGates,
      goal: "exercise autonomous execution gates",
      inputs: [],
      outputs: [],
      dependencies: [],
      allowedWriteScope: [],
      outOfScope: [],
      acceptanceCriteria: [],
      verificationSteps: [],
      requiredReviews: [],
      securityChecks: [],
      antiPatterns: [],
      rollbackNotes: "none",
      handoffFormat: "inline"
    },
    status: "ready",
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z"
  };
}

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

test("validateProgressProofRecord allows terminal proofs with measurable deltas and no next target", () => {
  const errors = validateProgressProofRecord({
    cycle: 2,
    proofId: "proof-terminal",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "   ",
    whyNext: "",
    createdAt: "2026-05-20T10:05:00.000Z"
  });

  assert.deepEqual(errors, []);
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

test("selectAutonomousNextTarget prefers a fresh checkpoint over a valid progress proof", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-2",
        checkpointId: "cp-fresh",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        executionEpoch: 3,
        activeTargets: ["checkpoint:fresh"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["resume from fresh checkpoint"],
        compressedContextRef: "memory://cp-fresh",
        createdAt: "2026-05-20T10:20:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 7,
        proofId: "proof-valid",
        phaseBefore: "validation",
        phaseAfter: "validation",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "proof:resume",
        whyNext: "progress proof also points to more work",
        createdAt: "2026-05-20T10:21:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 3,
    updatedAt: "2026-05-20T10:21:00.000Z"
  });

  assert.equal(target?.source, "checkpoint");
  assert.equal(target?.targetId, "checkpoint:fresh");
});

test("selectAutonomousNextTarget skips stale checkpoints and uses the latest valid progress proof", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-3",
        checkpointId: "cp-stale",
        authorityLabel: "runtime_authoritative",
        phase: "inventory",
        executionEpoch: 1,
        activeTargets: ["checkpoint:stale"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["resume from stale checkpoint"],
        compressedContextRef: "memory://cp-stale",
        createdAt: "2026-05-20T10:25:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 8,
        proofId: "proof-fresh",
        phaseBefore: "validation",
        phaseAfter: "validation",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "proof:fresh",
        whyNext: "checkpoint is stale but proof remains current",
        createdAt: "2026-05-20T10:26:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 2,
    updatedAt: "2026-05-20T10:26:00.000Z"
  });

  assert.equal(target?.source, "progress_proof");
  assert.equal(target?.targetId, "proof:fresh");
});

test("standard_delivery stays phase-ready while rewrite readiness remains profile-limited", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "standard_delivery",
    phase: "final_verification",
    manifest: {
      runId: "run-standard",
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [
      {
        id: "service:status",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/admin/status.ts:1"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: true,
        businessRules: ["runtime proof required"],
        evidenceRefs: ["src/admin/status.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T10:00:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [
      {
        runId: "run-standard",
        checkpointId: "cp-standard",
        authorityLabel: "runtime_authoritative",
        phase: "final_verification",
        executionEpoch: 1,
        activeTargets: ["task:status"],
        recentEvidenceRefs: ["src/admin/status.ts:1"],
        openGaps: [],
        nextActions: ["finish verification"],
        compressedContextRef: "memory://cp-standard",
        compressedContextSummary: "status verification complete",
        compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:05:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 1,
        proofId: "proof-standard",
        phaseBefore: "validation",
        phaseAfter: "final_verification",
        evidenceRefs: ["src/admin/status.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "",
        whyNext: "",
        createdAt: "2026-05-20T10:06:00.000Z"
      }
    ],
    understandingMaps: standardDeliveryUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/admin/status.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T10:04:00.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-standard",
        targetId: "service:status",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes report"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:03:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    retryBudgetRemaining: 1,
    updatedAt: "2026-05-20T10:06:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);
  const blockers = collectAutonomousExecutionBlockers(state, [
    createTaskRecord(["progress_proof_required", "checkpoint_resume_required"])
  ]);

  assert.equal(coverage.criticalItemCoverage, 1);
  assert.equal(comprehension.readinessScope, "profile_limited");
  assert.equal(comprehension.rewriteReadiness, "profile_limited");
  assert.match(comprehension.profileLimitations[0] ?? "", /task-scoped/);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.transition, "advance");
  assert.deepEqual(blockers, []);
});

test("computePhaseReadiness flags a stale checkpoint even when final verification evidence is otherwise complete", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "standard_delivery",
    phase: "final_verification",
    manifest: {
      runId: "run-stale",
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [
      {
        id: "service:stale",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/admin/status.ts:1"],
        callsiteCount: 1,
        callsitesAnalyzed: 1,
        runtimeTraced: true,
        businessRules: ["verification preserved"],
        evidenceRefs: ["src/admin/status.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T10:30:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [
      {
        runId: "run-stale",
        checkpointId: "cp-stale-readiness",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        executionEpoch: 1,
        activeTargets: ["task:status"],
        recentEvidenceRefs: ["src/admin/status.ts:1"],
        openGaps: [],
        nextActions: ["resume verification"],
        compressedContextRef: "memory://cp-stale-readiness",
        compressedContextSummary: "verification snapshot",
        compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:31:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 2,
        proofId: "proof-stale-readiness",
        phaseBefore: "validation",
        phaseAfter: "final_verification",
        evidenceRefs: ["src/admin/status.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "",
        whyNext: "",
        createdAt: "2026-05-20T10:32:00.000Z"
      }
    ],
    understandingMaps: standardDeliveryUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/admin/status.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T10:30:30.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-stale-readiness",
        targetId: "service:stale",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes report"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:30:15.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 2,
    retryBudgetRemaining: 1,
    updatedAt: "2026-05-20T10:32:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockerKind, "stale_checkpoint");
  assert.equal(readiness.staleCheckpoint, true);
  assert.equal(readiness.transition, "fallback");
  assert.match(readiness.reasons.join("\n"), /latest checkpoint cp-stale-readiness is stale/i);
});

test("legacy_rewrite uses profile fallback thresholds when the manifest leaves them unspecified", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "legacy_rewrite",
    phase: "migration_sequencing",
    manifest: {
      runId: "run-legacy",
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {}
    },
    coverageItems: [
      {
        id: "service:rewrite",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: true,
        businessRules: ["preserve rewrite contract"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T10:40:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [
      {
        runId: "run-legacy",
        checkpointId: "cp-legacy",
        authorityLabel: "runtime_authoritative",
        phase: "migration_sequencing",
        executionEpoch: 1,
        activeTargets: ["task:rewrite"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["continue migration sequencing"],
        compressedContextRef: "memory://cp-legacy",
        compressedContextSummary: "rewrite sequencing is current",
        compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:41:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 3,
        proofId: "proof-legacy",
        phaseBefore: "modernization_strategy",
        phaseAfter: "migration_sequencing",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "task:rewrite",
        whyNext: "migration sequencing is the next bounded step",
        createdAt: "2026-05-20T10:42:00.000Z"
      }
    ],
    understandingMaps: legacyRewriteUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/core/service.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T10:40:30.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-legacy",
        targetId: "service:rewrite",
        kind: "side_effect",
        risky: true,
        sideEffects: ["mutates data store"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:40:15.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:42:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);

  assert.equal(comprehension.readinessScope, "broad");
  assert.equal(comprehension.rewriteReadiness, "ready");
  assert.deepEqual(comprehension.missingEvidence, []);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.transition, "advance");
});

test("collectAutonomousExecutionBlockers aggregates missing proof checkpoint and memory compaction blockers", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "standard_delivery",
    phase: "final_verification",
    manifest: {
      runId: "run-gates",
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [
      {
        id: "service:gates",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 1,
        callsitesAnalyzed: 1,
        runtimeTraced: true,
        businessRules: ["keep checkpoint metadata intact"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T10:50:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [],
    progressProofs: [],
    understandingMaps: standardDeliveryUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/core/service.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T10:50:30.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-gates",
        targetId: "service:gates",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes checkpoint"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T10:50:15.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T10:51:00.000Z"
  };

  const blockers = collectAutonomousExecutionBlockers(state, [
    createTaskRecord([
      "progress_proof_required",
      "checkpoint_resume_required",
      "memory_compaction_required"
    ])
  ]);

  assert.match(blockers.join("\n"), /progress proof required but none is valid/i);
  assert.match(blockers.join("\n"), /checkpoint\/resume required but no checkpoint is recorded/i);
  assert.match(
    blockers.join("\n"),
    /memory compaction required but the latest checkpoint lacks compressed context/i
  );
});

test("collectAutonomousExecutionBlockers emits a resumability handoff blocker for final proof failures", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "modernization_program",
    phase: "final_verification",
    manifest: {
      runId: "run-resumability",
      profile: "modernization_program",
      requiredCategories: [],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.85
      }
    },
    coverageItems: [
      {
        id: "service:resumability",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: true,
        businessRules: ["rely on runtime checkpoint"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T10:55:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [],
    progressProofs: [],
    understandingMaps: [],
    runtimeTraces: [],
    pendingInvestigations: [],
    executionEpoch: 2,
    updatedAt: "2026-05-20T10:56:00.000Z"
  };

  const blockers = collectAutonomousExecutionBlockers(
    state,
    [createTaskRecord(["progress_proof_required", "checkpoint_resume_required"])]
  );

  assert.match(blockers.join("\n"), /final proof requires a resumability handoff before approval/i);
});

test("modernization_program blockers capture invalid manifest, missing proof state, and blocked rewrite readiness", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "modernization_program",
    phase: "modernization_strategy",
    manifest: {
      runId: "run-modernization",
      profile: "modernization_program",
      requiredCategories: [],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    },
    coverageItems: [
      {
        id: "service:rewrite",
        category: "services",
        state: "partially_analyzed",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 3,
        callsitesAnalyzed: 1,
        runtimeTraced: false,
        evidenceRefs: ["src/core/service.ts:1"],
        lastUpdatedAt: "2026-05-20T10:00:00.000Z"
      }
    ],
    gaps: [
      {
        id: "gap-contradiction",
        targetId: "service:rewrite",
        kind: "contradicting_evidence",
        severity: "critical",
        description: "runtime and export evidence disagree",
        blocking: true,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["reconcile runtime state"],
        status: "open"
      }
    ],
    checkpoints: [
      {
        runId: "run-modernization",
        checkpointId: "cp-modernization",
        authorityLabel: "runtime_authoritative",
        phase: "modernization_strategy",
        executionEpoch: 1,
        activeTargets: ["service:rewrite"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: ["gap-contradiction"],
        nextActions: ["continue analysis"],
        createdAt: "2026-05-20T10:01:00.000Z"
      }
    ],
    progressProofs: [],
    understandingMaps: [],
    runtimeTraces: [],
    pendingInvestigations: [],
    executionEpoch: 2,
    retryBudgetRemaining: 0,
    updatedAt: "2026-05-20T10:10:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);
  const blockers = collectAutonomousExecutionBlockers(state, [
    createTaskRecord([
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required",
      "memory_compaction_required"
    ])
  ]);

  assert.equal(coverage.blockingGapCount, 1);
  assert.equal(comprehension.rewriteReadiness, "blocked");
  assert.ok(comprehension.missingArtifactKinds.length > 0);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockerKind, "retry_budget_exhausted");
  assert.match(blockers.join("\n"), /coverage manifest is invalid/);
  assert.match(blockers.join("\n"), /progress proof required but none is valid/);
  assert.match(blockers.join("\n"), /memory compaction required but the latest checkpoint lacks compressed context/);
  assert.match(blockers.join("\n"), /rewrite recommendation blocked/);
});

test("computeComprehensionSummary surfaces open runtime trace gaps and inventory gaps during modernization strategy", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "modernization_program",
    phase: "modernization_strategy",
    manifest: {
      runId: "run-missing-traces",
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    },
    coverageItems: [
      {
        id: "service:traces",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: false,
        businessRules: ["capture trace coverage"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T11:00:00.000Z"
      }
    ],
    gaps: [
      {
        id: "gap:trace-open",
        targetId: "service:traces",
        kind: "missing_runtime_trace",
        severity: "medium",
        description: "Runtime capture is still missing.",
        blocking: false,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["capture the missing trace"],
        status: "open"
      },
      {
        id: "gap:inventory-open",
        targetId: "service:traces",
        kind: "missing_inventory",
        severity: "medium",
        description: "Inventory coverage still needs to be reconciled.",
        blocking: false,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["refresh the inventory map"],
        status: "open"
      }
    ],
    checkpoints: [],
    progressProofs: [],
    understandingMaps: [],
    runtimeTraces: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:01:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);

  assert.equal(comprehension.rewriteReadiness, "blocked");
  assert.match(comprehension.missingEvidence.join("\n"), /open runtime trace gaps: gap:trace-open/i);
  assert.match(
    comprehension.missingEvidence.join("\n"),
    /inventory gap open: Inventory coverage still needs to be reconciled/i
  );
});

test("computePhaseReadiness marks contradiction loops before generic missing-evidence blockers", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: "run-contradiction",
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.8,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    },
    coverageItems: [
      {
        id: "service:contradiction",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 2,
        callsitesAnalyzed: 2,
        runtimeTraced: true,
        businessRules: ["keep contradiction evidence visible"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T11:10:00.000Z"
      }
    ],
    gaps: [
      {
        id: "gap:contradiction-soft",
        targetId: "service:contradiction",
        kind: "contradicting_evidence",
        severity: "medium",
        description: "Two sources still disagree.",
        blocking: false,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["resolve the contradiction"],
        status: "open"
      }
    ],
    checkpoints: [
      {
        runId: "run-contradiction",
        checkpointId: "cp-contradiction",
        authorityLabel: "runtime_authoritative",
        phase: "final_verification",
        executionEpoch: 1,
        activeTargets: ["service:contradiction"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: ["gap:contradiction-soft"],
        nextActions: ["finish final verification"],
        compressedContextRef: "memory://cp-contradiction",
        compressedContextSummary: "checkpoint is current",
        compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T11:11:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 4,
        proofId: "proof-contradiction",
        phaseBefore: "validation",
        phaseAfter: "final_verification",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "",
        whyNext: "",
        createdAt: "2026-05-20T11:12:00.000Z"
      }
    ],
    understandingMaps: legacyRewriteUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/core/service.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T11:10:30.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-contradiction",
        targetId: "service:contradiction",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes audit state"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T11:10:15.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:12:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);

  assert.equal(coverage.blockingGapCount, 0);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockerKind, "contradiction_loop");
  assert.match(readiness.reasons.join("\n"), /contradiction gap count 1 exceeds threshold 0/i);
});

test("computePhaseReadiness routes blocking-gap failures back to the previous phase", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "standard_delivery",
    phase: "final_verification",
    manifest: {
      runId: "run-blocking-gap",
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [
      {
        id: "service:blocking-gap",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 1,
        callsitesAnalyzed: 1,
        runtimeTraced: true,
        businessRules: ["keep blocking gaps authoritative"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T11:20:00.000Z"
      }
    ],
    gaps: [
      {
        id: "gap:blocking",
        targetId: "service:blocking-gap",
        kind: "missing_validation",
        severity: "high",
        description: "Validation still needs to land.",
        blocking: true,
        evidenceRefs: ["src/core/service.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["finish validation"],
        status: "open"
      }
    ],
    checkpoints: [
      {
        runId: "run-blocking-gap",
        checkpointId: "cp-blocking-gap",
        authorityLabel: "runtime_authoritative",
        phase: "final_verification",
        executionEpoch: 1,
        activeTargets: ["service:blocking-gap"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: ["gap:blocking"],
        nextActions: ["finish validation"],
        compressedContextRef: "memory://cp-blocking-gap",
        compressedContextSummary: "checkpoint is current",
        compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T11:21:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 5,
        proofId: "proof-blocking-gap",
        phaseBefore: "validation",
        phaseAfter: "final_verification",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 0, opened: 1 },
        nextTarget: "service:blocking-gap",
        whyNext: "finish validation before advancing",
        createdAt: "2026-05-20T11:22:00.000Z"
      }
    ],
    understandingMaps: standardDeliveryUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/core/service.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T11:20:30.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-blocking-gap",
        targetId: "service:blocking-gap",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes validation state"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T11:20:15.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:22:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);

  assert.equal(readiness.blockerKind, "blocking_gap");
  assert.equal(readiness.transition, "fallback");
  assert.equal(readiness.fallbackPhase, "regression_detection");
  assert.match(readiness.reasons.join("\n"), /blocking gaps remain open: 1/i);
});

test("computePhaseReadiness marks a ready done phase as complete", () => {
  const state: AutonomousExecutionState = {
    enabled: true,
    profile: "standard_delivery",
    phase: "done",
    manifest: {
      runId: "run-done",
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [
      {
        id: "service:done",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/core/service.ts:1"],
        callsiteCount: 1,
        callsitesAnalyzed: 1,
        runtimeTraced: true,
        businessRules: ["preserve done-state readiness"],
        evidenceRefs: ["src/core/service.ts:1"],
        verificationRefs: ["tests/progress-proof.test.ts"],
        lastUpdatedAt: "2026-05-20T11:30:00.000Z"
      }
    ],
    gaps: [],
    checkpoints: [
      {
        runId: "run-done",
        checkpointId: "cp-done",
        authorityLabel: "runtime_authoritative",
        phase: "done",
        executionEpoch: 1,
        activeTargets: ["service:done"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["archive completion state"],
        compressedContextRef: "memory://cp-done",
        compressedContextSummary: "completion context is compacted",
        compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T11:31:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 6,
        proofId: "proof-done",
        phaseBefore: "final_verification",
        phaseAfter: "done",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "",
        whyNext: "",
        createdAt: "2026-05-20T11:32:00.000Z"
      }
    ],
    understandingMaps: standardDeliveryUnderstandingKinds.map((kind) => ({
      kind,
      itemCount: 1,
      analyzedCount: 1,
      sourceRefs: ["src/core/service.ts:1"],
      evidenceRefs: ["tests/progress-proof.test.ts"],
      updatedAt: "2026-05-20T11:30:30.000Z"
    })),
    runtimeTraces: [
      {
        traceId: "trace-done",
        targetId: "service:done",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes completion state"],
        evidenceRefs: ["tests/progress-proof.test.ts"],
        createdAt: "2026-05-20T11:30:15.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:32:00.000Z"
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.blockerKind, "none");
  assert.equal(readiness.nextPhase, undefined);
  assert.equal(readiness.transition, "complete");
});

test("collectAutonomousExecutionBlockers keeps coverage-ledger and memory-compaction defects distinct", () => {
  const blockersWithoutManifest = collectAutonomousExecutionBlockers(
    createAutonomousExecutionState({
      now: "2026-05-20T11:40:00.000Z"
    }),
    [createTaskRecord(["coverage_ledger_required"])]
  );

  assert.match(blockersWithoutManifest.join("\n"), /coverage manifest missing/i);
  assert.match(blockersWithoutManifest.join("\n"), /coverage ledger required but no manifest is recorded/i);

  const blockersWithoutSummary = collectAutonomousExecutionBlockers(
    {
      enabled: true,
      profile: "standard_delivery",
      phase: "validation",
      coverageItems: [],
      gaps: [],
      checkpoints: [
        {
          runId: "run-summary",
          checkpointId: "cp-summary",
          authorityLabel: "runtime_authoritative",
          phase: "validation",
          executionEpoch: 1,
          activeTargets: ["service:summary"],
          recentEvidenceRefs: ["src/core/service.ts:1"],
          openGaps: [],
          nextActions: ["resume validation"],
          compressedContextRef: "memory://cp-summary",
          compressedContextSummary: "   ",
          compressedContextSourceRefs: ["tests/progress-proof.test.ts"],
          createdAt: "2026-05-20T11:41:00.000Z"
        }
      ],
      progressProofs: [],
      pendingInvestigations: [],
      executionEpoch: 1,
      updatedAt: "2026-05-20T11:41:00.000Z"
    },
    [createTaskRecord(["memory_compaction_required"])]
  );

  assert.match(
    blockersWithoutSummary.join("\n"),
    /memory compaction required but the latest checkpoint lacks compressed context summary/i
  );

  const blockersWithoutProvenance = collectAutonomousExecutionBlockers(
    {
      enabled: true,
      profile: "standard_delivery",
      phase: "validation",
      coverageItems: [],
      gaps: [],
      checkpoints: [
        {
          runId: "run-provenance",
          checkpointId: "cp-provenance",
          authorityLabel: "runtime_authoritative",
          phase: "validation",
          executionEpoch: 1,
          activeTargets: ["service:provenance"],
          recentEvidenceRefs: ["src/core/service.ts:1"],
          openGaps: [],
          nextActions: ["resume validation"],
          compressedContextRef: "memory://cp-provenance",
          compressedContextSummary: "context is compacted",
          compressedContextSourceRefs: [],
          createdAt: "2026-05-20T11:42:00.000Z"
        }
      ],
      progressProofs: [],
      pendingInvestigations: [],
      executionEpoch: 1,
      updatedAt: "2026-05-20T11:42:00.000Z"
    },
    [createTaskRecord(["memory_compaction_required"])]
  );

  assert.match(
    blockersWithoutProvenance.join("\n"),
    /memory compaction required but the latest checkpoint lacks compressed context provenance/i
  );
});

test("selectAutonomousNextTarget breaks checkpoint ties by id and progress-proof ties by recency", () => {
  const checkpointTarget = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-checkpoint-tie",
        checkpointId: "cp-a",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        executionEpoch: 1,
        activeTargets: ["task:checkpoint-a"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["run workflow-proof now"],
        createdAt: "2026-05-20T11:50:00.000Z"
      },
      {
        runId: "run-checkpoint-tie",
        checkpointId: "cp-z",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        executionEpoch: 1,
        activeTargets: ["task:checkpoint-z"],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: ["run workflow-proof now"],
        createdAt: "2026-05-20T11:50:00.000Z"
      }
    ],
    progressProofs: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:50:00.000Z"
  });

  assert.equal(checkpointTarget?.source, "checkpoint");
  assert.equal(checkpointTarget?.targetId, "task:checkpoint-z");
  assert.deepEqual(checkpointTarget?.actions, [{ kind: "run_workflow_proof", taskId: "checkpoint-z" }]);

  const progressProofTarget = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-progress-proof-fallback",
        checkpointId: "cp-empty",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        executionEpoch: 1,
        activeTargets: ["   "],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: [],
        createdAt: "2026-05-20T11:51:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 7,
        proofId: "proof-older",
        phaseBefore: "validation",
        phaseAfter: "validation",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "task:proof-older",
        whyNext: "run workflow-proof before resuming",
        createdAt: "2026-05-20T11:52:00.000Z"
      },
      {
        cycle: 7,
        proofId: "proof-newer",
        phaseBefore: "validation",
        phaseAfter: "validation",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "task:proof-newer",
        whyNext: "run workflow-proof before resuming",
        createdAt: "2026-05-20T11:53:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:53:00.000Z"
  });

  assert.equal(progressProofTarget?.source, "progress_proof");
  assert.equal(progressProofTarget?.targetId, "task:proof-newer");
  assert.deepEqual(progressProofTarget?.actions, [{ kind: "run_workflow_proof", taskId: "proof-newer" }]);
});

test("selectAutonomousNextTarget returns undefined when no resumable checkpoint or progress-proof target remains", () => {
  const target = selectAutonomousNextTarget({
    enabled: true,
    profile: "legacy_rewrite",
    phase: "validation",
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-no-target",
        checkpointId: "cp-no-target",
        authorityLabel: "runtime_authoritative",
        phase: "validation",
        executionEpoch: 1,
        activeTargets: ["   "],
        recentEvidenceRefs: ["src/core/service.ts:1"],
        openGaps: [],
        nextActions: [],
        createdAt: "2026-05-20T11:54:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 8,
        proofId: "proof-terminal-no-target",
        phaseBefore: "validation",
        phaseAfter: "final_verification",
        evidenceRefs: ["src/core/service.ts:1"],
        coverageDelta: { validated: 1 },
        blockingGapDelta: { closed: 1, opened: 0 },
        nextTarget: "",
        whyNext: "",
        createdAt: "2026-05-20T11:55:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-20T11:55:00.000Z"
  });

  assert.equal(target, undefined);
});
