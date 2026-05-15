import type {
  AnalysisPhase,
  AutonomousExecutionSnapshot,
  AutonomousExecutionState,
  CoverageGapRecord,
  CoverageManifestRecord,
  CoverageSummary,
  CoverageItemRecord,
  PhaseReadinessRecord,
  TaskRecord
} from "../domain/types.ts";

const fullyAnalyzedStates = new Set(["fully_analyzed", "validated", "migrated", "deprecated"]);
const validatedStates = new Set(["validated", "migrated", "deprecated"]);
const tracedStates = new Set(["validated", "migrated"]);
const autonomousQualityGates = new Set([
  "coverage_ledger_required",
  "progress_proof_required",
  "checkpoint_resume_required",
  "memory_compaction_required"
]);

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
