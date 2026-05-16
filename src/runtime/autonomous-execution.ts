import type {
  AnalysisPhase,
  AutonomousExecutionSnapshot,
  AutonomousExecutionState,
  ContinuationAction,
  CoverageGapRecord,
  CoverageManifestRecord,
  CoverageSummary,
  CoverageItemRecord,
  PhaseReadinessRecord,
  TaskRecord
} from "../domain/types.ts";

export interface AutonomousNextTarget {
  targetId: string;
  source: "blocking_gap" | "progress_proof" | "checkpoint";
  rationale: string[];
  actions: ContinuationAction[];
  nextActions: string[];
}

const fullyAnalyzedStates = new Set(["fully_analyzed", "validated", "migrated", "deprecated"]);
const validatedStates = new Set(["validated", "migrated", "deprecated"]);
const tracedStates = new Set(["validated", "migrated"]);
const autonomousQualityGates = new Set([
  "coverage_ledger_required",
  "progress_proof_required",
  "checkpoint_resume_required",
  "memory_compaction_required"
]);
const gapSeverityWeight = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
} as const;

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return roundMetric(numerator / denominator);
}

function thresholdValue(
  manifest: CoverageManifestRecord | undefined,
  key: keyof CoverageManifestRecord["thresholds"],
  fallback: number
): number {
  return manifest?.thresholds[key] ?? fallback;
}

function collectCriticalItems(items: readonly CoverageItemRecord[]): CoverageItemRecord[] {
  return items.filter((item) => item.criticality === "high" || item.criticality === "critical");
}

export function runRequiresAutonomousExecution(tasks: readonly TaskRecord[]): boolean {
  return tasks.some((task) => task.packet.qualityGates.some((gate) => autonomousQualityGates.has(gate)));
}

export function createAutonomousExecutionState(input: {
  now: string;
  profile?: AutonomousExecutionState["profile"] | undefined;
  manifest?: CoverageManifestRecord | undefined;
  phase?: AnalysisPhase | undefined;
}): AutonomousExecutionState {
  return {
    enabled: true,
    profile: input.profile ?? "standard_delivery",
    phase: input.phase ?? "discovery",
    manifest: input.manifest,
    coverageItems: [],
    gaps: [],
    checkpoints: [],
    progressProofs: [],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: input.now
  };
}

export function computeCoverageSummary(state: AutonomousExecutionState): CoverageSummary {
  const criticalItems = collectCriticalItems(state.coverageItems);
  const tracedItems = criticalItems.filter(
    (item) => item.runtimeTraced === true || tracedStates.has(item.state)
  );
  const fullyAnalyzedCritical = criticalItems.filter((item) => fullyAnalyzedStates.has(item.state));
  const validatedCritical = criticalItems.filter((item) => validatedStates.has(item.state));
  const callsiteEligibleItems = criticalItems.filter((item) => (item.callsiteCount ?? 0) > 0);
  const totalCallsites = callsiteEligibleItems.reduce(
    (sum, item) => sum + Math.max(0, item.callsiteCount ?? 0),
    0
  );
  const analyzedCallsites = callsiteEligibleItems.reduce(
    (sum, item) => sum + Math.max(0, Math.min(item.callsitesAnalyzed ?? 0, item.callsiteCount ?? 0)),
    0
  );
  const openGaps = state.gaps.filter((gap) => gap.status === "open");
  const blockingGaps = openGaps.filter((gap) => gap.blocking);

  return {
    totalItems: state.coverageItems.length,
    discoveredItems: state.coverageItems.filter((item) => item.state === "discovered").length,
    partiallyAnalyzedItems: state.coverageItems.filter((item) => item.state === "partially_analyzed").length,
    fullyAnalyzedItems: state.coverageItems.filter((item) => item.state === "fully_analyzed").length,
    validatedItems: state.coverageItems.filter((item) => item.state === "validated").length,
    migratedItems: state.coverageItems.filter((item) => item.state === "migrated").length,
    blockedItems: state.coverageItems.filter((item) => item.state === "blocked").length,
    criticalItemCoverage: ratio(fullyAnalyzedCritical.length, criticalItems.length),
    criticalItemValidation: ratio(validatedCritical.length, criticalItems.length),
    callsiteCoverage: ratio(analyzedCallsites, totalCallsites),
    runtimeTraceCoverage: ratio(tracedItems.length, criticalItems.length),
    openGapCount: openGaps.length,
    blockingGapCount: blockingGaps.length
  };
}

export function computePhaseReadiness(
  state: AutonomousExecutionState,
  summary: CoverageSummary
): PhaseReadinessRecord {
  const reasons: string[] = [];

  if (!state.manifest) {
    reasons.push("coverage manifest missing");
  }

  if (state.phase === "modernization_strategy" || state.phase === "migration_sequencing" || state.phase === "final_verification" || state.phase === "done") {
    const criticalCoverageThreshold = thresholdValue(state.manifest, "criticalItemCoverage", 0.8);
    const criticalValidationThreshold = thresholdValue(state.manifest, "criticalItemValidation", 0.6);
    const callsiteThreshold = thresholdValue(state.manifest, "callsiteCoverage", 0.85);
    const runtimeTraceThreshold = thresholdValue(state.manifest, "runtimeTraceCoverage", 0.75);

    if (summary.criticalItemCoverage < criticalCoverageThreshold) {
      reasons.push(
        `critical item coverage ${summary.criticalItemCoverage} is below threshold ${criticalCoverageThreshold}`
      );
    }

    if (summary.criticalItemValidation < criticalValidationThreshold) {
      reasons.push(
        `critical item validation ${summary.criticalItemValidation} is below threshold ${criticalValidationThreshold}`
      );
    }

    if (summary.callsiteCoverage < callsiteThreshold) {
      reasons.push(`callsite coverage ${summary.callsiteCoverage} is below threshold ${callsiteThreshold}`);
    }

    if (
      (state.phase === "migration_sequencing" || state.phase === "final_verification" || state.phase === "done") &&
      summary.runtimeTraceCoverage < runtimeTraceThreshold
    ) {
      reasons.push(
        `runtime trace coverage ${summary.runtimeTraceCoverage} is below threshold ${runtimeTraceThreshold}`
      );
    }
  }

  if ((state.phase === "final_verification" || state.phase === "done") && state.progressProofs.length === 0) {
    reasons.push("final verification requires at least one progress proof");
  }

  if ((state.phase === "final_verification" || state.phase === "done") && state.checkpoints.length === 0) {
    reasons.push("final verification requires at least one checkpoint");
  }

  if (summary.blockingGapCount > 0) {
    reasons.push(`blocking gaps remain open: ${summary.blockingGapCount}`);
  }

  return {
    phase: state.phase,
    status: reasons.length === 0 ? "ready" : "blocked",
    reasons
  };
}

export function buildAutonomousExecutionSnapshot(
  state: AutonomousExecutionState
): AutonomousExecutionSnapshot {
  const coverageSummary = computeCoverageSummary(state);
  return {
    state,
    coverageSummary,
    phaseReadiness: computePhaseReadiness(state, coverageSummary),
    blockingGaps: state.gaps.filter((gap) => gap.status === "open" && gap.blocking)
  };
}

export function collectAutonomousExecutionBlockers(
  state: AutonomousExecutionState,
  tasks: readonly TaskRecord[]
): string[] {
  const snapshot = buildAutonomousExecutionSnapshot(state);
  const blockers = [...snapshot.phaseReadiness.reasons];
  const taskQualityGates = new Set(tasks.flatMap((task) => task.packet.qualityGates));

  if (taskQualityGates.has("coverage_ledger_required") && !state.manifest) {
    blockers.push("coverage ledger required but no manifest is recorded");
  }

  if (taskQualityGates.has("progress_proof_required") && state.progressProofs.length === 0) {
    blockers.push("progress proof required but none is recorded");
  }

  if (taskQualityGates.has("checkpoint_resume_required") && state.checkpoints.length === 0) {
    blockers.push("checkpoint/resume required but no checkpoint is recorded");
  }

  if (taskQualityGates.has("memory_compaction_required")) {
    const latestCheckpoint = state.checkpoints[state.checkpoints.length - 1];
    if (!latestCheckpoint?.compressedContextRef) {
      blockers.push("memory compaction required but the latest checkpoint lacks compressed context");
    }
  }

  return [...new Set(blockers)];
}

export function mergeCoverageItems(
  existing: readonly CoverageItemRecord[],
  updates: readonly CoverageItemRecord[]
): CoverageItemRecord[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of updates) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function mergeCoverageGaps(
  existing: readonly CoverageGapRecord[],
  updates: readonly CoverageGapRecord[]
): CoverageGapRecord[] {
  const byId = new Map(existing.map((gap) => [gap.id, gap]));
  for (const gap of updates) {
    byId.set(gap.id, gap);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function extractWorkflowProofTaskId(targetId: string, nextActions: readonly string[]): string | undefined {
  const normalizedTargetId = targetId.trim();
  if (!normalizedTargetId.startsWith("task:")) {
    return undefined;
  }

  const joinedActions = nextActions.join(" ").trim();
  if (!/\bworkflow-proof\b/i.test(joinedActions)) {
    return undefined;
  }

  const taskId = normalizedTargetId.slice("task:".length).trim();
  return taskId.length > 0 ? taskId : undefined;
}

export function selectAutonomousNextTarget(
  state: AutonomousExecutionState
): AutonomousNextTarget | undefined {
  const blockingGap = [...state.gaps]
    .filter((gap) => gap.status === "open" && gap.blocking)
    .sort((left, right) => {
      const severityOrder = gapSeverityWeight[right.severity] - gapSeverityWeight[left.severity];
      if (severityOrder !== 0) {
        return severityOrder;
      }
      return left.id.localeCompare(right.id);
    })[0];

  if (blockingGap) {
    const nextActions =
      blockingGap.suggestedNextActions.length > 0
        ? [...blockingGap.suggestedNextActions]
        : [`resolve ${blockingGap.id}`];
    const workflowProofTaskId = extractWorkflowProofTaskId(blockingGap.targetId, nextActions);
    const actions: ContinuationAction[] = workflowProofTaskId
      ? [{ kind: "run_workflow_proof", taskId: workflowProofTaskId }]
      : [{ kind: "resolve_blocking_gap", gapId: blockingGap.id, targetId: blockingGap.targetId }];

    return {
      targetId: blockingGap.targetId,
      source: "blocking_gap",
      rationale: [
        `blocking gap ${blockingGap.id} remains open`,
        blockingGap.description
      ],
      actions,
      nextActions
    };
  }

  const latestProgressProof = [...state.progressProofs].sort((left, right) => {
    const cycleOrder = right.cycle - left.cycle;
    if (cycleOrder !== 0) {
      return cycleOrder;
    }
    return right.createdAt.localeCompare(left.createdAt);
  })[0];
  if (latestProgressProof?.nextTarget.trim()) {
    const progressProofTarget = latestProgressProof.nextTarget.trim();
    const nextActions = latestProgressProof.whyNext?.trim()
      ? [latestProgressProof.whyNext.trim()]
      : [`continue at ${progressProofTarget}`];
    const workflowProofTaskId = extractWorkflowProofTaskId(progressProofTarget, nextActions);
    const actions: ContinuationAction[] = workflowProofTaskId
      ? [{ kind: "run_workflow_proof", taskId: workflowProofTaskId }]
      : [
          {
            kind: "resume_target",
            targetId: progressProofTarget,
            source: "progress_proof",
            sourceId: latestProgressProof.proofId
          }
        ];

    return {
      targetId: progressProofTarget,
      source: "progress_proof",
      rationale: [
        `latest progress proof ${latestProgressProof.proofId} selected the next target`,
        ...(latestProgressProof.whyNext ? [latestProgressProof.whyNext] : [])
      ],
      actions,
      nextActions
    };
  }

  const latestCheckpoint = [...state.checkpoints].sort((left, right) => {
    const createdAtOrder = right.createdAt.localeCompare(left.createdAt);
    if (createdAtOrder !== 0) {
      return createdAtOrder;
    }
    return right.checkpointId.localeCompare(left.checkpointId);
  })[0];
  const checkpointTarget = latestCheckpoint?.activeTargets[0]?.trim();
  if (latestCheckpoint && checkpointTarget) {
    const nextActions =
      latestCheckpoint.nextActions.length > 0
        ? [...latestCheckpoint.nextActions]
        : [`resume at ${checkpointTarget}`];
    const workflowProofTaskId = extractWorkflowProofTaskId(checkpointTarget, nextActions);
    const actions: ContinuationAction[] = workflowProofTaskId
      ? [{ kind: "run_workflow_proof", taskId: workflowProofTaskId }]
      : [
          {
            kind: "resume_target",
            targetId: checkpointTarget,
            source: "checkpoint",
            sourceId: latestCheckpoint.checkpointId
          }
        ];

    return {
      targetId: checkpointTarget,
      source: "checkpoint",
      rationale: [
        `latest checkpoint ${latestCheckpoint.checkpointId} still lists an active target`
      ],
      actions,
      nextActions
    };
  }

  return undefined;
}
