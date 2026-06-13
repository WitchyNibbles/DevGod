import assert from "node:assert/strict";
import test from "node:test";
import { DevgodCoreService } from "../src/core/service.ts";
import {
  collectAutonomousExecutionBlockers,
  computeComprehensionSummary,
  computeCoverageSummary,
  computePhaseReadiness,
  createAutonomousExecutionState,
  mergeExternalEvalRecords,
  mergeParityRequirements,
  mergeSensitiveActionControls,
  selectAutonomousNextTarget
} from "../src/runtime/autonomous-execution.ts";
import {
  buildCoverageLedgerArtifacts,
  validateCoverageArchitectureDecisionsArtifact,
  validateCoverageDependencyGraphArtifact,
  validateCoverageDuplicateFamiliesArtifact,
  validateCoverageGapsArtifact,
  validateCoverageInvariantsArtifact,
  validateCoverageItemsArtifact,
  validateCoverageLedgerArtifacts,
  validateCoverageManifestArtifact,
  validateCoverageMigrationLedgerArtifact,
  validateCoverageParityMatrixArtifact,
  validateCoverageTracesArtifact,
  validateUnderstandingMapsArtifact
} from "../src/runtime/coverage-ledger.ts";
import type {
  AutonomousExecutionState,
  CheckpointRecord,
  CoverageGapRecord,
  CoverageItemRecord,
  CoverageManifestRecord,
  ExternalEvalRecord,
  ParityRequirementRecord,
  ProgressProofRecord,
  QualityGate,
  RuntimeTraceRecord,
  SensitiveActionControlRecord,
  TaskRecord,
  UnderstandingMapRecord
} from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

const now = "2026-06-13T10:00:00.000Z";

function manifest(overrides: Partial<CoverageManifestRecord> = {}): CoverageManifestRecord {
  return {
    runId: overrides.runId ?? "run-runtime-service",
    profile: overrides.profile ?? "legacy_rewrite",
    requiredCategories: overrides.requiredCategories ?? ["services"],
    thresholds: {
      criticalItemCoverage: overrides.thresholds?.criticalItemCoverage ?? 0.8,
      criticalItemValidation: overrides.thresholds?.criticalItemValidation ?? 0.6,
      callsiteCoverage: overrides.thresholds?.callsiteCoverage ?? 0.75,
      runtimeTraceCoverage: overrides.thresholds?.runtimeTraceCoverage ?? 0.75,
      inventoryCompleteness: overrides.thresholds?.inventoryCompleteness ?? 0.5,
      businessRuleCoverage: overrides.thresholds?.businessRuleCoverage ?? 0.3,
      maxContradictionGapCount: overrides.thresholds?.maxContradictionGapCount ?? 0,
      maxOpenBlockers: overrides.thresholds?.maxOpenBlockers ?? 0
    }
  };
}

function coverageItem(overrides: Partial<CoverageItemRecord> = {}): CoverageItemRecord {
  return {
    id: overrides.id ?? "service:runtime-proof",
    category: overrides.category ?? "services",
    state: overrides.state ?? "validated",
    criticality: overrides.criticality ?? "critical",
    ownerAgent: overrides.ownerAgent,
    sources: overrides.sources ?? ["src/core/service.ts:1"],
    entryPoints: overrides.entryPoints,
    dependencies: overrides.dependencies,
    dependents: overrides.dependents,
    callsiteCount: overrides.callsiteCount ?? 1,
    callsitesAnalyzed: overrides.callsitesAnalyzed ?? 1,
    runtimeTraced: overrides.runtimeTraced ?? true,
    behaviorSummary: overrides.behaviorSummary,
    invariants: overrides.invariants,
    businessRules: overrides.businessRules,
    sideEffects: overrides.sideEffects,
    openQuestions: overrides.openQuestions,
    evidenceRefs: overrides.evidenceRefs ?? ["tests/runtime-service-coverage.test.ts:1"],
    verificationRefs: overrides.verificationRefs ?? ["tests/runtime-service-coverage.test.ts"],
    confidence: overrides.confidence,
    gapScore: overrides.gapScore,
    lastUpdatedAt: overrides.lastUpdatedAt ?? now
  };
}

function coverageGap(overrides: Partial<CoverageGapRecord> = {}): CoverageGapRecord {
  return {
    id: overrides.id ?? "gap:runtime-proof",
    targetId: overrides.targetId ?? "service:runtime-proof",
    kind: overrides.kind ?? "missing_runtime_trace",
    severity: overrides.severity ?? "high",
    description: overrides.description ?? "runtime proof still needs trace evidence",
    blocking: overrides.blocking ?? true,
    evidenceRefs: overrides.evidenceRefs ?? ["tests/runtime-service-coverage.test.ts:1"],
    createdBy: overrides.createdBy ?? "qa_engineer",
    suggestedNextActions: overrides.suggestedNextActions ?? ["capture runtime trace"],
    status: overrides.status ?? "open"
  };
}

function progressProof(overrides: Partial<ProgressProofRecord> = {}): ProgressProofRecord {
  return {
    cycle: overrides.cycle ?? 1,
    proofId: overrides.proofId ?? "proof:runtime-proof",
    phaseBefore: overrides.phaseBefore ?? "validation",
    phaseAfter: overrides.phaseAfter ?? "done",
    evidenceRefs: overrides.evidenceRefs ?? ["tests/runtime-service-coverage.test.ts:1"],
    coverageDelta: overrides.coverageDelta ?? { validated: 1 },
    blockingGapDelta: overrides.blockingGapDelta ?? { closed: 1, opened: 0 },
    nextTarget: overrides.nextTarget ?? "task:runtime-proof",
    whyNext: overrides.whyNext ?? "run workflow-proof for runtime-proof",
    createdAt: overrides.createdAt ?? now
  };
}

function checkpoint(overrides: Partial<CheckpointRecord> = {}): CheckpointRecord {
  return {
    runId: overrides.runId ?? "run-runtime-service",
    checkpointId: overrides.checkpointId ?? "checkpoint:runtime-proof",
    authorityLabel: overrides.authorityLabel ?? "runtime_authoritative",
    phase: overrides.phase ?? "done",
    executionEpoch: overrides.executionEpoch ?? 1,
    activeTargets: overrides.activeTargets ?? ["task:runtime-proof"],
    recentEvidenceRefs: overrides.recentEvidenceRefs ?? ["tests/runtime-service-coverage.test.ts:1"],
    openGaps: overrides.openGaps ?? [],
    nextActions: overrides.nextActions ?? ["run workflow-proof for runtime-proof"],
    compressedContextRef: overrides.compressedContextRef,
    compressedContextSummary: overrides.compressedContextSummary,
    compressedContextSourceRefs: overrides.compressedContextSourceRefs,
    compressedContextGeneratedAt: overrides.compressedContextGeneratedAt,
    createdAt: overrides.createdAt ?? now
  };
}

function understandingMap(overrides: Partial<UnderstandingMapRecord> = {}): UnderstandingMapRecord {
  return {
    kind: overrides.kind ?? "repo_map",
    itemCount: overrides.itemCount ?? 1,
    analyzedCount: overrides.analyzedCount ?? 1,
    sourceRefs: overrides.sourceRefs ?? ["src/core/service.ts:1"],
    evidenceRefs: overrides.evidenceRefs ?? ["tests/runtime-service-coverage.test.ts:1"],
    updatedAt: overrides.updatedAt ?? now
  };
}

function taskRecord(id: string, qualityGates: QualityGate[]): TaskRecord {
  return {
    id,
    runId: "run-runtime-service",
    workspaceId: "workspace-runtime-service",
    projectId: "project-runtime-service",
    packet: {
      taskId: `${id}-packet`,
      title: `task ${id}`,
      ownerRole: "planner",
      completionStandard: "artifact_complete",
      requiredSpecialistRoles: [],
      qualityGates,
      goal: "exercise autonomous runtime blockers",
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
    createdAt: now,
    updatedAt: now
  };
}

function createState(overrides: Partial<AutonomousExecutionState> = {}): AutonomousExecutionState {
  return {
    ...createAutonomousExecutionState({
      now,
      profile: overrides.profile,
      manifest: overrides.manifest,
      phase: overrides.phase
    }),
    manifest: overrides.manifest,
    coverageItems: overrides.coverageItems ?? [],
    gaps: overrides.gaps ?? [],
    checkpoints: overrides.checkpoints ?? [],
    progressProofs: overrides.progressProofs ?? [],
    understandingMaps: overrides.understandingMaps ?? [],
    runtimeTraces: overrides.runtimeTraces ?? [],
    duplicateFamilies: overrides.duplicateFamilies ?? [],
    architectureDecisions: overrides.architectureDecisions ?? [],
    migrationLedger: overrides.migrationLedger ?? [],
    parityMatrix: overrides.parityMatrix ?? [],
    externalEvals: overrides.externalEvals ?? [],
    sensitiveActionControls: overrides.sensitiveActionControls ?? [],
    pendingInvestigations: overrides.pendingInvestigations ?? [],
    executionEpoch: overrides.executionEpoch ?? 1,
    retryBudgetRemaining: overrides.retryBudgetRemaining,
    updatedAt: overrides.updatedAt ?? now
  };
}

async function createRun(service: DevgodCoreService) {
  return service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod-runtime-service",
    actor: "planner",
    title: "Runtime coverage fixture",
    request: "Exercise autonomous runtime coverage branches"
  });
}

test("collectAutonomousExecutionBlockers reports invalid manifests and each compaction blocker variant", () => {
  const gates: QualityGate[] = [
    "coverage_ledger_required",
    "progress_proof_required",
    "checkpoint_resume_required",
    "memory_compaction_required"
  ];
  const invalidManifestState = createState({
    profile: "modernization_program",
    phase: "final_verification",
    manifest: {
      runId: "run-invalid",
      profile: "modernization_program",
      requiredCategories: [],
      thresholds: {
        criticalItemCoverage: 0.9
      }
    }
  });

  const invalidManifestBlockers = collectAutonomousExecutionBlockers(
    invalidManifestState,
    [taskRecord("task:invalid-manifest", gates)]
  );

  assert.ok(
    invalidManifestBlockers.some((blocker) => blocker.includes("coverage manifest is invalid"))
  );
  assert.ok(
    invalidManifestBlockers.includes("progress proof required but none is valid")
  );
  assert.ok(
    invalidManifestBlockers.includes("checkpoint/resume required but no checkpoint is recorded")
  );
  assert.ok(
    invalidManifestBlockers.includes(
      "memory compaction required but the latest checkpoint lacks compressed context"
    )
  );
  assert.ok(
    invalidManifestBlockers.includes(
      "rewrite recommendation blocked: critical repo-understanding threshold not met"
    )
  );

  const missingSummaryBlockers = collectAutonomousExecutionBlockers(
    createState({
      manifest: manifest(),
      checkpoints: [
        checkpoint({
          compressedContextRef: "memory://checkpoint",
          compressedContextSummary: "   ",
          compressedContextSourceRefs: ["memory://checkpoint"]
        })
      ]
    }),
    [taskRecord("task:missing-summary", ["memory_compaction_required"])]
  );
  assert.ok(
    missingSummaryBlockers.includes(
      "memory compaction required but the latest checkpoint lacks compressed context summary"
    )
  );

  const missingProvenanceBlockers = collectAutonomousExecutionBlockers(
    createState({
      manifest: manifest(),
      checkpoints: [
        checkpoint({
          compressedContextRef: "memory://checkpoint",
          compressedContextSummary: "runtime context",
          compressedContextSourceRefs: ["   "]
        })
      ]
    }),
    [taskRecord("task:missing-provenance", ["memory_compaction_required"])]
  );
  assert.ok(
    missingProvenanceBlockers.includes(
      "memory compaction required but the latest checkpoint lacks compressed context provenance"
    )
  );
});

test("computePhaseReadiness distinguishes retry exhaustion from a clean done-phase completion", () => {
  const readyState = createState({
    profile: "debug_heavy",
    phase: "done",
    manifest: manifest({
      profile: "debug_heavy",
      thresholds: {
        criticalItemCoverage: 0.5,
        criticalItemValidation: 0.5,
        callsiteCoverage: 0.5,
        runtimeTraceCoverage: 0.5,
        inventoryCompleteness: 0.25,
        businessRuleCoverage: 0,
        maxContradictionGapCount: 1,
        maxOpenBlockers: 0
      }
    }),
    coverageItems: [coverageItem()],
    understandingMaps: [
      understandingMap({ kind: "repo_map" }),
      understandingMap({ kind: "subsystems" }),
      understandingMap({ kind: "route_map" }),
      understandingMap({ kind: "runtime_side_effects" })
    ],
    progressProofs: [progressProof()],
    checkpoints: [
      checkpoint({
        compressedContextRef: "memory://checkpoint",
        compressedContextSummary: "runtime context",
        compressedContextSourceRefs: ["memory://checkpoint"]
      })
    ]
  });

  const readyCoverage = computeCoverageSummary(readyState);
  const readyComprehension = computeComprehensionSummary(readyState, readyCoverage);
  const ready = computePhaseReadiness(readyState, readyCoverage, readyComprehension);

  assert.equal(ready.status, "ready");
  assert.equal(ready.transition, "complete");
  assert.equal(ready.blockerKind, "none");
  assert.equal(ready.nextPhase, undefined);

  const retryState = createState({
    phase: "validation",
    retryBudgetRemaining: 0
  });
  const retryCoverage = computeCoverageSummary(retryState);
  const retryComprehension = computeComprehensionSummary(retryState, retryCoverage);
  const retry = computePhaseReadiness(retryState, retryCoverage, retryComprehension);

  assert.equal(retry.status, "blocked");
  assert.equal(retry.blockerKind, "retry_budget_exhausted");
  assert.equal(retry.fallbackPhase, undefined);
  assert.equal(retry.transition, "hold");
  assert.ok(
    retry.reasons.includes("retry budget exhausted for the current autonomous phase")
  );
});

test("selectAutonomousNextTarget breaks checkpoint and progress-proof ties deterministically", () => {
  const checkpointTarget = selectAutonomousNextTarget(
    createState({
      phase: "validation",
      checkpoints: [
        checkpoint({
          checkpointId: "checkpoint:a",
          createdAt: "2026-06-13T09:00:00.000Z",
          activeTargets: ["task:alpha"],
          nextActions: []
        }),
        checkpoint({
          checkpointId: "checkpoint:z",
          createdAt: "2026-06-13T09:00:00.000Z",
          activeTargets: ["task:omega"],
          nextActions: []
        })
      ]
    })
  );

  assert.equal(checkpointTarget?.source, "checkpoint");
  assert.equal(checkpointTarget?.targetId, "task:omega");
  assert.deepEqual(checkpointTarget?.nextActions, ["resume at task:omega"]);

  const progressTarget = selectAutonomousNextTarget(
    createState({
      progressProofs: [
        progressProof({
          proofId: "proof:older",
          cycle: 2,
          nextTarget: "task:older",
          whyNext: "continue runtime analysis for older proof",
          createdAt: "2026-06-13T08:59:00.000Z"
        }),
        progressProof({
          proofId: "proof:newer",
          cycle: 2,
          nextTarget: "task:newer",
          whyNext: "continue runtime analysis for newer proof",
          createdAt: "2026-06-13T09:01:00.000Z"
        })
      ]
    })
  );

  assert.equal(progressTarget?.source, "progress_proof");
  assert.equal(progressTarget?.targetId, "task:newer");
  assert.deepEqual(progressTarget?.nextActions, ["continue runtime analysis for newer proof"]);
});

test("merge modernization helpers replace updates and sort parity, eval, and control records", () => {
  const mergedParity = mergeParityRequirements(
    [
      {
        requirementId: "parity:b",
        capability: "status",
        status: "planned",
        legacyRefs: ["legacy:b"],
        targetRefs: ["target:b"],
        acceptanceChecks: ["check b"],
        evidenceRefs: ["evidence:b"],
        lastUpdatedAt: now
      }
    ],
    [
      {
        requirementId: "parity:a",
        capability: "status",
        status: "verified",
        legacyRefs: ["legacy:a"],
        targetRefs: ["target:a"],
        acceptanceChecks: ["check a"],
        evidenceRefs: ["evidence:a"],
        lastUpdatedAt: now
      },
      {
        requirementId: "parity:b",
        capability: "status",
        status: "verified",
        legacyRefs: ["legacy:b2"],
        targetRefs: ["target:b2"],
        acceptanceChecks: ["check b2"],
        evidenceRefs: ["evidence:b2"],
        lastUpdatedAt: now
      }
    ]
  );
  assert.deepEqual(
    mergedParity.map((record) => `${record.requirementId}:${record.status}`),
    ["parity:a:verified", "parity:b:verified"]
  );

  const mergedEvals = mergeExternalEvalRecords(
    [
      {
        evalId: "eval:b",
        label: "B",
        scope: "repo_local",
        harness: "vitest",
        artifactRef: "artifact:b",
        evidenceRefs: ["evidence:b"],
        createdAt: now
      }
    ],
    [
      {
        evalId: "eval:a",
        label: "A",
        scope: "external",
        harness: "promptfoo",
        artifactRef: "artifact:a",
        evidenceRefs: ["evidence:a"],
        createdAt: now
      }
    ]
  );
  assert.deepEqual(mergedEvals.map((record) => record.evalId), ["eval:a", "eval:b"]);

  const mergedControls = mergeSensitiveActionControls(
    [
      {
        controlId: "control:b",
        actionType: "continuation",
        enforcement: "authenticated_runtime",
        summary: "runtime only",
        evidenceRefs: ["evidence:b"],
        createdAt: now
      }
    ],
    [
      {
        controlId: "control:a",
        actionType: "workflow_proof",
        enforcement: "operator_required",
        summary: "operator must approve",
        evidenceRefs: ["evidence:a"],
        createdAt: now
      }
    ]
  );
  assert.deepEqual(mergedControls.map((record) => record.controlId), ["control:a", "control:b"]);
});

test("coverage ledger artifacts round-trip through validators with full runtime evidence", () => {
  const state = createState({
    manifest: manifest({
      profile: "modernization_program",
      requiredCategories: ["services", "tests"]
    }),
    coverageItems: [
      coverageItem({
        id: "service:runtime-proof",
        category: "services",
        dependencies: ["test:runtime-proof"],
        invariants: ["runtime proof remains authoritative"],
        businessRules: ["approved tasks require runtime proof"],
        sideEffects: ["writes coverage ledger"],
        openQuestions: ["none"],
        confidence: 0.9,
        gapScore: 0
      }),
      coverageItem({
        id: "test:runtime-proof",
        category: "tests",
        state: "fully_analyzed",
        criticality: "medium",
        sources: ["tests/runtime-service-coverage.test.ts:1"],
        dependents: ["service:runtime-proof"],
        evidenceRefs: ["tests/runtime-service-coverage.test.ts:1"],
        verificationRefs: undefined,
        runtimeTraced: false
      })
    ],
    gaps: [coverageGap({ kind: "missing_validation", severity: "medium", blocking: false })],
    understandingMaps: [understandingMap(), understandingMap({ kind: "runtime_side_effects" })],
    runtimeTraces: [
      {
        traceId: "trace:runtime-proof",
        targetId: "service:runtime-proof",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes coverage ledger"],
        evidenceRefs: ["tests/runtime-service-coverage.test.ts:1"],
        createdAt: now
      }
    ],
    duplicateFamilies: [
      {
        familyId: "family:runtime-proof",
        capability: "runtime-proof",
        members: [{ itemId: "service:runtime-proof", kind: "shared_core", role: "runtime" }],
        intentionalVariants: ["cli"],
        accidentalDivergences: [],
        centralizationCandidate: "src/core/service.ts",
        parityRequirements: ["parity:runtime-proof"],
        evidenceRefs: ["tests/runtime-service-coverage.test.ts:1"],
        verificationRefs: ["tests/runtime-service-coverage.test.ts"],
        lastUpdatedAt: now
      }
    ],
    architectureDecisions: [
      {
        decisionId: "adr:runtime-proof",
        title: "Keep runtime proof authoritative",
        status: "accepted",
        options: ["file proof", "runtime proof"],
        chosenOption: "runtime proof",
        boundedContexts: ["workflow"],
        consistencyNeeds: ["single runtime truth"],
        rationale: ["prevents stale local approval"],
        evidenceRefs: ["tests/runtime-service-coverage.test.ts:1"],
        verificationRefs: ["tests/runtime-service-coverage.test.ts"],
        lastUpdatedAt: now
      }
    ],
    migrationLedger: [
      {
        entryId: "migration:runtime-proof",
        boundedContext: "workflow",
        sourceModels: ["local proof"],
        targetModels: ["runtime proof"],
        strategy: "expand_contract",
        consistencyClass: "strong",
        ownership: "backend_engineer",
        rolloutSteps: ["enable runtime proof"],
        rollbackPlan: ["disable runtime proof"],
        evidenceRefs: ["tests/runtime-service-coverage.test.ts:1"],
        verificationRefs: ["tests/runtime-service-coverage.test.ts"],
        lastUpdatedAt: now
      }
    ],
    parityMatrix: [
      {
        requirementId: "parity:runtime-proof",
        capability: "runtime-proof",
        status: "verified",
        legacyRefs: ["legacy/proof.md"],
        targetRefs: ["runtime://proof"],
        acceptanceChecks: ["proof matches runtime state"],
        evidenceRefs: ["tests/runtime-service-coverage.test.ts:1"],
        verificationRefs: ["tests/runtime-service-coverage.test.ts"],
        lastUpdatedAt: now
      }
    ]
  });

  const artifacts = buildCoverageLedgerArtifacts(state, { generatedAt: "2026-06-13T10:05:00.000Z" });

  assert.deepEqual(validateCoverageManifestArtifact(artifacts.manifest), []);
  assert.deepEqual(validateCoverageItemsArtifact(artifacts.items), []);
  assert.deepEqual(validateCoverageGapsArtifact(artifacts.gaps), []);
  assert.deepEqual(validateCoverageTracesArtifact(artifacts.traces), []);
  assert.deepEqual(validateUnderstandingMapsArtifact(artifacts.understanding_maps), []);
  assert.deepEqual(validateCoverageInvariantsArtifact(artifacts.invariants), []);
  assert.deepEqual(validateCoverageDuplicateFamiliesArtifact(artifacts.duplicate_families), []);
  assert.deepEqual(
    validateCoverageArchitectureDecisionsArtifact(artifacts.architecture_decisions),
    []
  );
  assert.deepEqual(validateCoverageMigrationLedgerArtifact(artifacts.migration_ledger), []);
  assert.deepEqual(validateCoverageParityMatrixArtifact(artifacts.parity_matrix), []);
  assert.deepEqual(
    validateCoverageDependencyGraphArtifact(artifacts.dependency_graph, artifacts.items),
    []
  );
  assert.deepEqual(validateCoverageLedgerArtifacts(artifacts), []);
  assert.ok(
    artifacts.dependency_graph.nodes.some(
      (node) => node.id === "test:runtime-proof" && node.source === "coverage_item"
    )
  );
});

test("service runtime methods reject invalid records and normalize captured trace evidence", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await createRun(service);

  assert.equal(await service.getAutonomousExecutionState(run.id), undefined);

  await assert.rejects(
    service.configureAutonomousExecution(run.id, {
      manifest: {
        runId: "run-invalid",
        profile: "legacy_rewrite",
        requiredCategories: [],
        thresholds: {
          criticalItemCoverage: 1.2
        }
      }
    }),
    /Invalid coverage manifest/
  );

  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "runtime_tracing",
    manifest: manifest(),
    pendingInvestigations: ["trace checkout path"]
  });

  const configured = await service.getAutonomousExecutionState(run.id);
  assert.equal(configured?.phase, "runtime_tracing");
  assert.deepEqual(configured?.pendingInvestigations, ["trace checkout path"]);

  await assert.rejects(
    service.upsertCoverageItems(run.id, [
      coverageItem({
        sources: [],
        evidenceRefs: [],
        verificationRefs: undefined,
        callsiteCount: 1,
        callsitesAnalyzed: 2
      })
    ]),
    /Invalid coverage item/
  );
  await assert.rejects(
    service.upsertUnderstandingMaps(run.id, [
      understandingMap({ kind: "unknown-map" as never, itemCount: 1, analyzedCount: 2, sourceRefs: [], evidenceRefs: [] })
    ]),
    /Invalid understanding map/
  );
  await assert.rejects(
    service.upsertRuntimeTraces(run.id, [
      {
        traceId: "",
        targetId: "",
        kind: "side_effect",
        risky: true,
        sideEffects: [],
        evidenceRefs: [],
        createdAt: now
      }
    ]),
    /Invalid runtime trace/
  );
  await assert.rejects(
    service.upsertDuplicateFamilies(run.id, [
      {
        familyId: "",
        capability: "",
        members: [],
        intentionalVariants: [],
        accidentalDivergences: [],
        parityRequirements: [],
        evidenceRefs: [],
        lastUpdatedAt: now
      }
    ]),
    /Invalid duplicate family/
  );
  await assert.rejects(
    service.upsertArchitectureDecisions(run.id, [
      {
        decisionId: "",
        title: "",
        status: "accepted",
        options: [],
        chosenOption: "",
        boundedContexts: [],
        consistencyNeeds: [],
        rationale: [],
        evidenceRefs: [],
        lastUpdatedAt: now
      }
    ]),
    /Invalid architecture decision/
  );
  await assert.rejects(
    service.upsertMigrationLedgerEntries(run.id, [
      {
        entryId: "",
        boundedContext: "",
        sourceModels: [],
        targetModels: [],
        strategy: "expand_contract",
        consistencyClass: "strong",
        ownership: "",
        rolloutSteps: [],
        rollbackPlan: [],
        evidenceRefs: [],
        lastUpdatedAt: now
      }
    ]),
    /Invalid migration ledger entry/
  );
  await assert.rejects(
    service.upsertParityRequirements(run.id, [
      {
        requirementId: "",
        capability: "",
        status: "planned",
        legacyRefs: [],
        targetRefs: [],
        acceptanceChecks: [],
        evidenceRefs: [],
        lastUpdatedAt: now
      }
    ]),
    /Invalid parity requirement/
  );
  await assert.rejects(
    service.upsertExternalEvals(run.id, [
      {
        evalId: "",
        label: "",
        scope: "repo_local",
        harness: "",
        artifactRef: "",
        evidenceRefs: [],
        createdAt: now
      }
    ]),
    /Invalid external eval/
  );
  await assert.rejects(
    service.upsertSensitiveActionControls(run.id, [
      {
        controlId: "",
        actionType: "workflow_proof",
        enforcement: "authenticated_runtime",
        summary: "",
        evidenceRefs: [],
        createdAt: now
      }
    ]),
    /Invalid sensitive action control/
  );
  await assert.rejects(
    service.upsertCoverageGaps(run.id, [
      coverageGap({ targetId: "", evidenceRefs: [], createdBy: "", suggestedNextActions: [] })
    ]),
    /Invalid coverage gap/
  );

  await service.upsertCoverageItems(run.id, [
    coverageItem({
      id: "service:traceable",
      runtimeTraced: false,
      sideEffects: undefined
    })
  ]);
  await service.upsertCoverageGaps(run.id, [
    coverageGap({
      id: "gap:traceable",
      targetId: "service:traceable",
      kind: "missing_runtime_trace"
    })
  ]);

  await service.captureRuntimeTrace(run.id, {
    traceId: "   ",
    targetId: "service:traceable",
    kind: "side_effect",
    risky: true,
    sideEffects: ["persist workflow proof", "persist workflow proof", "sync exports"],
    evidenceRefs: ["evidence:1", "evidence:1", "evidence:2"]
  });
  await service.importRuntimeTrace(run.id, {
    traceId: "trace:imported",
    targetId: "service:traceable",
    kind: "integration",
    risky: false,
    sideEffects: ["sync exports", "sync exports"],
    evidenceRefs: ["evidence:2", "evidence:3"]
  });

  const traced = await service.getAutonomousExecutionState(run.id);
  assert.equal(traced?.coverageItems[0]?.runtimeTraced, true);
  assert.equal(traced?.gaps.find((gap) => gap.id === "gap:traceable")?.status, "closed");
  assert.ok(traced?.runtimeTraces);

  const capturedTrace = traced.runtimeTraces.find((trace) => trace.authorityLabel === "runtime_capture");
  assert.ok(capturedTrace?.traceId.startsWith("trace:"));
  assert.deepEqual(capturedTrace?.sideEffects, ["persist workflow proof", "sync exports"]);
  assert.deepEqual(capturedTrace?.evidenceRefs, ["evidence:1", "evidence:2"]);

  const importedTrace = traced.runtimeTraces.find((trace) => trace.traceId === "trace:imported");
  assert.equal(importedTrace?.authorityLabel, "operator_import");
  assert.deepEqual(importedTrace?.sideEffects, ["sync exports"]);
  assert.deepEqual(importedTrace?.evidenceRefs, ["evidence:2", "evidence:3"]);
});
