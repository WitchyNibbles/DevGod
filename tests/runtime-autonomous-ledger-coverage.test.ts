import assert from "node:assert/strict";
import test from "node:test";
import {
  computeComprehensionSummary,
  computeCoverageSummary,
  computePhaseReadiness,
  createAutonomousExecutionState,
  mergeArchitectureDecisions,
  mergeCoverageGaps,
  mergeCoverageItems,
  mergeDuplicateFamilies,
  mergeExternalEvalRecords,
  mergeMigrationLedgerEntries,
  mergeParityRequirements,
  mergeRuntimeTraces,
  mergeSensitiveActionControls,
  mergeUnderstandingMaps,
  runRequiresAutonomousExecution,
  validateArchitectureDecisionRecord,
  validateCoverageGapRecord,
  validateCoverageItemRecord,
  validateCoverageManifestRecord,
  validateDuplicateFamilyRecord,
  validateExternalEvalRecord,
  validateMigrationLedgerEntryRecord,
  validateParityRequirementRecord,
  validateProgressProofRecord,
  validateRuntimeTraceRecord,
  validateSensitiveActionControlRecord,
  validateUnderstandingMapRecord
} from "../src/runtime/autonomous-execution.ts";
import { buildCoverageLedgerArtifacts } from "../src/runtime/coverage-ledger.ts";
import type { QualityGate, TaskRecord } from "../src/domain/types.ts";

const now = "2026-06-13T10:00:00.000Z";

function createTaskRecord(id: string, qualityGates: QualityGate[]): TaskRecord {
  return {
    id,
    runId: "run-runtime-coverage",
    workspaceId: "workspace-runtime-coverage",
    projectId: "project-runtime-coverage",
    packet: {
      taskId: `${id}-packet`,
      title: `task ${id}`,
      ownerRole: "planner",
      completionStandard: "artifact_complete",
      requiredSpecialistRoles: [],
      qualityGates,
      goal: "exercise autonomous runtime gates",
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

test("autonomous record validators reject malformed manifests, items, gaps, proofs, maps, and traces", () => {
  const manifestErrors = validateCoverageManifestRecord({
    runId: "run-invalid-manifest",
    profile: "standard_delivery",
    requiredCategories: [],
    thresholds: {
      criticalItemCoverage: 1.2,
      criticalItemValidation: -0.1,
      callsiteCoverage: Number.NaN,
      runtimeTraceCoverage: Number.POSITIVE_INFINITY,
      inventoryCompleteness: -0.5,
      businessRuleCoverage: 1.1,
      maxContradictionGapCount: 1.5,
      maxOpenBlockers: -1
    }
  });

  assert.match(manifestErrors.join("\n"), /requiredCategories/);
  assert.match(manifestErrors.join("\n"), /criticalItemCoverage/);
  assert.match(manifestErrors.join("\n"), /criticalItemValidation/);
  assert.match(manifestErrors.join("\n"), /callsiteCoverage/);
  assert.match(manifestErrors.join("\n"), /runtimeTraceCoverage/);
  assert.match(manifestErrors.join("\n"), /inventoryCompleteness/);
  assert.match(manifestErrors.join("\n"), /businessRuleCoverage/);
  assert.match(manifestErrors.join("\n"), /maxContradictionGapCount/);
  assert.match(manifestErrors.join("\n"), /maxOpenBlockers/);

  const itemErrors = validateCoverageItemRecord({
    id: "service:invalid",
    category: "services",
    state: "validated",
    criticality: "critical",
    sources: [],
    callsiteCount: 1,
    callsitesAnalyzed: 2,
    evidenceRefs: [],
    confidence: 1.5,
    gapScore: -0.1,
    lastUpdatedAt: now
  });

  assert.match(itemErrors.join("\n"), /at least one source/);
  assert.match(itemErrors.join("\n"), /at least one evidenceRef/);
  assert.match(itemErrors.join("\n"), /callsitesAnalyzed cannot exceed callsiteCount/);
  assert.match(itemErrors.join("\n"), /verificationRefs/);
  assert.match(itemErrors.join("\n"), /confidence/);
  assert.match(itemErrors.join("\n"), /gapScore/);

  const gapErrors = validateCoverageGapRecord({
    id: "gap:invalid",
    targetId: " ",
    kind: "missing_validation",
    severity: "high",
    description: "still broken",
    blocking: true,
    evidenceRefs: [],
    createdBy: " ",
    suggestedNextActions: [],
    status: "open"
  });

  assert.match(gapErrors.join("\n"), /targetId/);
  assert.match(gapErrors.join("\n"), /evidenceRefs/);
  assert.match(gapErrors.join("\n"), /createdBy/);
  assert.match(gapErrors.join("\n"), /suggestedNextActions/);

  const progressErrors = validateProgressProofRecord({
    cycle: 0,
    proofId: "proof:invalid",
    phaseBefore: "validation",
    phaseAfter: "validation",
    evidenceRefs: [],
    coverageDelta: { validated: 0 },
    blockingGapDelta: { closed: 0, opened: 0 },
    nextTarget: "task:next",
    whyNext: " ",
    createdAt: now
  });

  assert.match(progressErrors.join("\n"), /cycle must be a positive integer/);
  assert.match(progressErrors.join("\n"), /must include evidenceRefs/);
  assert.match(progressErrors.join("\n"), /must include whyNext/);
  assert.match(progressErrors.join("\n"), /measurable delta/);

  const mapErrors = validateUnderstandingMapRecord({
    kind: "unknown-map" as never,
    itemCount: -1,
    analyzedCount: 2,
    sourceRefs: [],
    evidenceRefs: [],
    updatedAt: now
  });

  assert.match(mapErrors.join("\n"), /unsupported kind/);
  assert.match(mapErrors.join("\n"), /itemCount must be a non-negative integer/);
  assert.match(mapErrors.join("\n"), /analyzedCount cannot exceed itemCount/);
  assert.match(mapErrors.join("\n"), /sourceRefs/);
  assert.match(mapErrors.join("\n"), /evidenceRefs/);

  const traceErrors = validateRuntimeTraceRecord({
    traceId: " ",
    targetId: " ",
    kind: "side_effect",
    risky: true,
    sideEffects: [],
    evidenceRefs: [],
    createdAt: now
  });

  assert.match(traceErrors.join("\n"), /traceId/);
  assert.match(traceErrors.join("\n"), /targetId/);
  assert.match(traceErrors.join("\n"), /evidenceRefs/);
  assert.match(traceErrors.join("\n"), /sideEffects/);

  assert.equal(runRequiresAutonomousExecution([createTaskRecord("task:none", [])]), false);
  assert.equal(
    runRequiresAutonomousExecution([
      createTaskRecord("task:coverage", ["coverage_ledger_required"])
    ]),
    true
  );
});

test("autonomous modernization validators reject malformed duplicate-family, architecture, migration, parity, eval, and control records", () => {
  const duplicateFamilyErrors = validateDuplicateFamilyRecord({
    familyId: " ",
    capability: " ",
    members: [
      {
        itemId: " ",
        kind: "shared_core"
      },
      {
        itemId: "service:duplicate",
        kind: "unknown"
      },
      {
        itemId: "service:duplicate",
        kind: "not-a-kind" as never
      }
    ],
    intentionalVariants: [],
    accidentalDivergences: [],
    centralizationCandidate: "shared/service.ts",
    parityRequirements: [],
    evidenceRefs: [],
    lastUpdatedAt: now
  });

  assert.match(duplicateFamilyErrors.join("\n"), /must include familyId/);
  assert.match(duplicateFamilyErrors.join("\n"), /must include capability/);
  assert.match(duplicateFamilyErrors.join("\n"), /member without itemId/);
  assert.match(duplicateFamilyErrors.join("\n"), /contains duplicate member service:duplicate/);
  assert.match(duplicateFamilyErrors.join("\n"), /unsupported kind not-a-kind/);
  assert.match(duplicateFamilyErrors.join("\n"), /must include evidenceRefs/);
  assert.match(duplicateFamilyErrors.join("\n"), /must include parityRequirements/);

  const architectureErrors = validateArchitectureDecisionRecord({
    decisionId: " ",
    title: " ",
    status: "maybe" as never,
    options: [],
    chosenOption: " ",
    boundedContexts: [],
    consistencyNeeds: [],
    rationale: [],
    evidenceRefs: [],
    lastUpdatedAt: now
  });

  assert.match(architectureErrors.join("\n"), /decisionId/);
  assert.match(architectureErrors.join("\n"), /title/);
  assert.match(architectureErrors.join("\n"), /unsupported status maybe/);
  assert.match(architectureErrors.join("\n"), /options/);
  assert.match(architectureErrors.join("\n"), /chosenOption/);
  assert.match(architectureErrors.join("\n"), /boundedContexts/);
  assert.match(architectureErrors.join("\n"), /consistencyNeeds/);
  assert.match(architectureErrors.join("\n"), /rationale/);
  assert.match(architectureErrors.join("\n"), /evidenceRefs/);

  const migrationErrors = validateMigrationLedgerEntryRecord({
    entryId: " ",
    boundedContext: " ",
    sourceModels: [],
    targetModels: [],
    strategy: "rewrite_in_place" as never,
    consistencyClass: "none" as never,
    ownership: " ",
    rolloutSteps: [],
    rollbackPlan: [],
    evidenceRefs: [],
    lastUpdatedAt: now
  });

  assert.match(migrationErrors.join("\n"), /entryId/);
  assert.match(migrationErrors.join("\n"), /boundedContext/);
  assert.match(migrationErrors.join("\n"), /sourceModels/);
  assert.match(migrationErrors.join("\n"), /targetModels/);
  assert.match(migrationErrors.join("\n"), /unsupported strategy rewrite_in_place/);
  assert.match(migrationErrors.join("\n"), /unsupported consistencyClass none/);
  assert.match(migrationErrors.join("\n"), /ownership/);
  assert.match(migrationErrors.join("\n"), /rolloutSteps/);
  assert.match(migrationErrors.join("\n"), /rollbackPlan/);
  assert.match(migrationErrors.join("\n"), /evidenceRefs/);

  const parityErrors = validateParityRequirementRecord({
    requirementId: " ",
    capability: " ",
    status: "deferred" as never,
    legacyRefs: [],
    targetRefs: [],
    acceptanceChecks: [],
    evidenceRefs: [],
    lastUpdatedAt: now
  });

  assert.match(parityErrors.join("\n"), /requirementId/);
  assert.match(parityErrors.join("\n"), /capability/);
  assert.match(parityErrors.join("\n"), /unsupported status deferred/);
  assert.match(parityErrors.join("\n"), /legacyRefs/);
  assert.match(parityErrors.join("\n"), /targetRefs/);
  assert.match(parityErrors.join("\n"), /acceptanceChecks/);
  assert.match(parityErrors.join("\n"), /evidenceRefs/);

  const evalErrors = validateExternalEvalRecord({
    evalId: " ",
    label: " ",
    scope: "repo_local",
    harness: " ",
    artifactRef: " ",
    evidenceRefs: [],
    createdAt: now
  });

  assert.match(evalErrors.join("\n"), /evalId/);
  assert.match(evalErrors.join("\n"), /label/);
  assert.match(evalErrors.join("\n"), /harness/);
  assert.match(evalErrors.join("\n"), /artifactRef/);
  assert.match(evalErrors.join("\n"), /evidenceRefs/);

  const controlErrors = validateSensitiveActionControlRecord({
    controlId: " ",
    actionType: "approval",
    enforcement: "authenticated_runtime",
    summary: " ",
    evidenceRefs: [],
    createdAt: now
  });

  assert.match(controlErrors.join("\n"), /controlId/);
  assert.match(controlErrors.join("\n"), /summary/);
  assert.match(controlErrors.join("\n"), /evidenceRefs/);
});

test("coverage summary stays finite and retry exhaustion blocks continuation without fallback", () => {
  const state = {
    ...createAutonomousExecutionState({
      now,
      profile: "standard_delivery",
      phase: "validation",
      manifest: {
        runId: "run-retry-budget",
        profile: "standard_delivery",
        requiredCategories: ["services"],
        thresholds: {
          criticalItemCoverage: 0.8,
          criticalItemValidation: 0.6,
          callsiteCoverage: 0.85,
          runtimeTraceCoverage: 0.75
        }
      }
    }),
    retryBudgetRemaining: 0
  };

  const coverage = computeCoverageSummary(state);
  const comprehension = computeComprehensionSummary(state, coverage);
  const readiness = computePhaseReadiness(state, coverage, comprehension);

  assert.deepEqual(coverage, {
    totalItems: 0,
    discoveredItems: 0,
    partiallyAnalyzedItems: 0,
    fullyAnalyzedItems: 0,
    validatedItems: 0,
    migratedItems: 0,
    blockedItems: 0,
    criticalItemCoverage: 0,
    criticalItemValidation: 0,
    callsiteCoverage: 0,
    runtimeTraceCoverage: 0,
    openGapCount: 0,
    blockingGapCount: 0
  });
  assert.equal(comprehension.readinessScope, "profile_limited");
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockerKind, "retry_budget_exhausted");
  assert.equal(readiness.transition, "hold");
  assert.equal(readiness.fallbackPhase, undefined);
  assert.match(readiness.reasons.join("\n"), /retry budget exhausted/);
});

test("merge helpers replace updated autonomous records and return deterministic ordering", () => {
  const mergedItems = mergeCoverageItems(
    [
      {
        id: "service:b",
        category: "services",
        state: "discovered",
        criticality: "medium",
        sources: ["src/b.ts:1"],
        evidenceRefs: ["src/b.ts:1"],
        lastUpdatedAt: now
      }
    ],
    [
      {
        id: "service:a",
        category: "services",
        state: "validated",
        criticality: "critical",
        sources: ["src/a.ts:1"],
        evidenceRefs: ["src/a.ts:1"],
        verificationRefs: ["tests/runtime-autonomous-ledger-coverage.test.ts"],
        lastUpdatedAt: now
      },
      {
        id: "service:b",
        category: "services",
        state: "validated",
        criticality: "high",
        sources: ["src/b.ts:1"],
        evidenceRefs: ["src/b.ts:1"],
        verificationRefs: ["tests/runtime-autonomous-ledger-coverage.test.ts"],
        lastUpdatedAt: now
      }
    ]
  );
  assert.deepEqual(mergedItems.map((item) => `${item.id}:${item.state}`), [
    "service:a:validated",
    "service:b:validated"
  ]);

  const mergedGaps = mergeCoverageGaps(
    [
      {
        id: "gap:b",
        targetId: "service:b",
        kind: "missing_validation",
        severity: "low",
        description: "older gap",
        blocking: false,
        evidenceRefs: ["src/b.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["inspect"],
        status: "open"
      }
    ],
    [
      {
        id: "gap:a",
        targetId: "service:a",
        kind: "missing_validation",
        severity: "high",
        description: "new gap",
        blocking: true,
        evidenceRefs: ["src/a.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["fix"],
        status: "open"
      },
      {
        id: "gap:b",
        targetId: "service:b",
        kind: "missing_validation",
        severity: "critical",
        description: "replacement gap",
        blocking: true,
        evidenceRefs: ["src/b.ts:1"],
        createdBy: "qa_engineer",
        suggestedNextActions: ["fix first"],
        status: "open"
      }
    ]
  );
  assert.deepEqual(mergedGaps.map((gap) => `${gap.id}:${gap.severity}`), ["gap:a:high", "gap:b:critical"]);

  const mergedMaps = mergeUnderstandingMaps(
    [
      {
        kind: "subsystems",
        itemCount: 1,
        sourceRefs: ["src/subsystems.ts:1"],
        evidenceRefs: ["src/subsystems.ts:1"],
        updatedAt: now
      }
    ],
    [
      {
        kind: "repo_map",
        itemCount: 1,
        sourceRefs: ["src/repo-map.ts:1"],
        evidenceRefs: ["src/repo-map.ts:1"],
        updatedAt: now
      },
      {
        kind: "subsystems",
        itemCount: 2,
        analyzedCount: 2,
        sourceRefs: ["src/subsystems.ts:2"],
        evidenceRefs: ["src/subsystems.ts:2"],
        updatedAt: now
      }
    ]
  );
  assert.deepEqual(mergedMaps.map((map) => `${map.kind}:${map.itemCount}`), ["repo_map:1", "subsystems:2"]);

  const mergedTraces = mergeRuntimeTraces(
    [
      {
        traceId: "trace:b",
        targetId: "service:b",
        kind: "side_effect",
        risky: false,
        sideEffects: [],
        evidenceRefs: ["src/b.ts:1"],
        createdAt: now
      }
    ],
    [
      {
        traceId: "trace:a",
        targetId: "service:a",
        kind: "side_effect",
        risky: true,
        sideEffects: ["writes state"],
        evidenceRefs: ["src/a.ts:1"],
        createdAt: now
      },
      {
        traceId: "trace:b",
        targetId: "service:b",
        kind: "integration",
        risky: true,
        sideEffects: ["calls remote system"],
        evidenceRefs: ["src/b.ts:1"],
        createdAt: now
      }
    ]
  );
  assert.deepEqual(mergedTraces.map((trace) => `${trace.traceId}:${trace.kind}`), [
    "trace:a:side_effect",
    "trace:b:integration"
  ]);

  const mergedFamilies = mergeDuplicateFamilies(
    [
      {
        familyId: "family:b",
        capability: "status",
        members: [{ itemId: "service:b", kind: "shared_core" }],
        intentionalVariants: [],
        accidentalDivergences: [],
        parityRequirements: [],
        evidenceRefs: ["src/b.ts:1"],
        lastUpdatedAt: now
      }
    ],
    [
      {
        familyId: "family:a",
        capability: "reporting",
        members: [{ itemId: "service:a", kind: "shared_core" }],
        intentionalVariants: [],
        accidentalDivergences: [],
        parityRequirements: [],
        evidenceRefs: ["src/a.ts:1"],
        lastUpdatedAt: now
      },
      {
        familyId: "family:b",
        capability: "status-replaced",
        members: [{ itemId: "service:b", kind: "shared_core" }],
        intentionalVariants: [],
        accidentalDivergences: [],
        parityRequirements: [],
        evidenceRefs: ["src/b.ts:2"],
        lastUpdatedAt: now
      }
    ]
  );
  assert.deepEqual(mergedFamilies.map((family) => `${family.familyId}:${family.capability}`), [
    "family:a:reporting",
    "family:b:status-replaced"
  ]);

  const mergedDecisions = mergeArchitectureDecisions(
    [
      {
        decisionId: "adr:b",
        title: "old",
        status: "proposed",
        options: ["old"],
        chosenOption: "old",
        boundedContexts: ["runtime"],
        consistencyNeeds: ["old"],
        rationale: ["old"],
        evidenceRefs: ["src/b.ts:1"],
        lastUpdatedAt: now
      }
    ],
    [
      {
        decisionId: "adr:a",
        title: "new",
        status: "accepted",
        options: ["new"],
        chosenOption: "new",
        boundedContexts: ["runtime"],
        consistencyNeeds: ["single source"],
        rationale: ["clear authority"],
        evidenceRefs: ["src/a.ts:1"],
        lastUpdatedAt: now
      },
      {
        decisionId: "adr:b",
        title: "replacement",
        status: "accepted",
        options: ["replacement"],
        chosenOption: "replacement",
        boundedContexts: ["runtime"],
        consistencyNeeds: ["replacement"],
        rationale: ["replacement"],
        evidenceRefs: ["src/b.ts:2"],
        lastUpdatedAt: now
      }
    ]
  );
  assert.deepEqual(mergedDecisions.map((record) => `${record.decisionId}:${record.title}`), [
    "adr:a:new",
    "adr:b:replacement"
  ]);

  const mergedMigrations = mergeMigrationLedgerEntries(
    [
      {
        entryId: "migration:b",
        boundedContext: "runtime",
        sourceModels: ["legacy_b"],
        targetModels: ["runtime_b"],
        strategy: "dual_write",
        consistencyClass: "mixed",
        ownership: "engineer",
        rolloutSteps: ["dual write"],
        rollbackPlan: ["disable dual write"],
        evidenceRefs: ["src/b.ts:1"],
        lastUpdatedAt: now
      }
    ],
    [
      {
        entryId: "migration:a",
        boundedContext: "runtime",
        sourceModels: ["legacy_a"],
        targetModels: ["runtime_a"],
        strategy: "expand_contract",
        consistencyClass: "strong",
        ownership: "engineer",
        rolloutSteps: ["expand"],
        rollbackPlan: ["revert"],
        evidenceRefs: ["src/a.ts:1"],
        lastUpdatedAt: now
      },
      {
        entryId: "migration:b",
        boundedContext: "runtime",
        sourceModels: ["legacy_b"],
        targetModels: ["runtime_b2"],
        strategy: "backfill_then_cutover",
        consistencyClass: "eventual",
        ownership: "engineer",
        rolloutSteps: ["backfill"],
        rollbackPlan: ["restore"],
        evidenceRefs: ["src/b.ts:2"],
        lastUpdatedAt: now
      }
    ]
  );
  assert.deepEqual(mergedMigrations.map((record) => `${record.entryId}:${record.strategy}`), [
    "migration:a:expand_contract",
    "migration:b:backfill_then_cutover"
  ]);

  const mergedParity = mergeParityRequirements(
    [
      {
        requirementId: "parity:b",
        capability: "status",
        status: "planned",
        legacyRefs: ["legacy:b"],
        targetRefs: ["runtime:b"],
        acceptanceChecks: ["match"],
        evidenceRefs: ["src/b.ts:1"],
        lastUpdatedAt: now
      }
    ],
    [
      {
        requirementId: "parity:a",
        capability: "reporting",
        status: "verified",
        legacyRefs: ["legacy:a"],
        targetRefs: ["runtime:a"],
        acceptanceChecks: ["verify"],
        evidenceRefs: ["src/a.ts:1"],
        lastUpdatedAt: now
      },
      {
        requirementId: "parity:b",
        capability: "status",
        status: "waived",
        legacyRefs: ["legacy:b"],
        targetRefs: ["runtime:b"],
        acceptanceChecks: ["waive"],
        evidenceRefs: ["src/b.ts:2"],
        lastUpdatedAt: now
      }
    ]
  );
  assert.deepEqual(mergedParity.map((record) => `${record.requirementId}:${record.status}`), [
    "parity:a:verified",
    "parity:b:waived"
  ]);

  const mergedEvals = mergeExternalEvalRecords(
    [
      {
        evalId: "eval:b",
        label: "baseline",
        scope: "repo_local",
        harness: "promptfoo",
        artifactRef: "artifacts/b.json",
        evidenceRefs: ["src/b.ts:1"],
        createdAt: now
      }
    ],
    [
      {
        evalId: "eval:a",
        label: "new",
        scope: "repo_local",
        harness: "promptfoo",
        artifactRef: "artifacts/a.json",
        evidenceRefs: ["src/a.ts:1"],
        createdAt: now
      },
      {
        evalId: "eval:b",
        label: "replacement",
        scope: "semi_external",
        harness: "promptfoo",
        artifactRef: "artifacts/b2.json",
        evidenceRefs: ["src/b.ts:2"],
        createdAt: now
      }
    ]
  );
  assert.deepEqual(mergedEvals.map((record) => `${record.evalId}:${record.label}`), [
    "eval:a:new",
    "eval:b:replacement"
  ]);

  const mergedControls = mergeSensitiveActionControls(
    [
      {
        controlId: "control:b",
        actionType: "approval",
        enforcement: "authenticated_runtime",
        summary: "old",
        evidenceRefs: ["src/b.ts:1"],
        createdAt: now
      }
    ],
    [
      {
        controlId: "control:a",
        actionType: "workflow_proof",
        enforcement: "operator_required",
        summary: "new",
        evidenceRefs: ["src/a.ts:1"],
        createdAt: now
      },
      {
        controlId: "control:b",
        actionType: "continuation",
        enforcement: "manager_waiver_only",
        summary: "replacement",
        evidenceRefs: ["src/b.ts:2"],
        createdAt: now
      }
    ]
  );
  assert.deepEqual(mergedControls.map((record) => `${record.controlId}:${record.summary}`), [
    "control:a:new",
    "control:b:replacement"
  ]);
});

test("coverage ledger export requires a manifest", () => {
  assert.throws(
    () =>
      buildCoverageLedgerArtifacts(
        createAutonomousExecutionState({
          now,
          profile: "standard_delivery",
          phase: "validation"
        })
      ),
    /coverage ledger export requires an autonomous execution manifest/
  );
});
