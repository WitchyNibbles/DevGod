import type {
  AutonomousExecutionState,
  CoverageItemRecord,
  RuntimeTraceRecord,
  RuntimeTraceRegistrySummary,
  RuntimeTraceRegistryTargetSummary
} from "../domain/types.ts";

const riskyCoverageCategories = new Set([
  "services",
  "external_integrations",
  "authentication",
  "authorization",
  "runtime_side_effects"
]);

function traceSort(left: RuntimeTraceRecord, right: RuntimeTraceRecord): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.traceId.localeCompare(right.traceId);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isRiskyTraceCandidate(item: CoverageItemRecord): boolean {
  return (
    item.criticality === "high" ||
    item.criticality === "critical" ||
    riskyCoverageCategories.has(item.category) ||
    (item.callsiteCount ?? 0) > 0
  );
}

function summarizeTarget(targetId: string, traces: readonly RuntimeTraceRecord[]): RuntimeTraceRegistryTargetSummary {
  const sorted = [...traces].sort(traceSort);

  return {
    targetId,
    traceIds: sorted.map((trace) => trace.traceId),
    kinds: uniqueSorted(sorted.map((trace) => trace.kind)) as RuntimeTraceRegistryTargetSummary["kinds"],
    riskyTraceCount: sorted.filter((trace) => trace.risky).length,
    latestCreatedAt: sorted.at(-1)?.createdAt ?? "",
    sideEffects: uniqueSorted(sorted.flatMap((trace) => trace.sideEffects)),
    evidenceRefs: uniqueSorted(sorted.flatMap((trace) => trace.evidenceRefs))
  };
}

export function buildRuntimeTraceRegistry(
  state: AutonomousExecutionState
): RuntimeTraceRegistrySummary {
  const traces = [...(state.runtimeTraces ?? [])].sort(traceSort);
  const tracesByTarget = new Map<string, RuntimeTraceRecord[]>();

  for (const trace of traces) {
    const existing = tracesByTarget.get(trace.targetId);
    if (existing) {
      existing.push(trace);
      continue;
    }

    tracesByTarget.set(trace.targetId, [trace]);
  }

  const targets = [...tracesByTarget.entries()]
    .map(([targetId, targetTraces]) => summarizeTarget(targetId, targetTraces))
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  const tracedTargetIds = new Set(targets.map((target) => target.targetId));
  const missingTargetIdsFromGaps = state.gaps
    .filter((gap) => gap.status === "open" && gap.kind === "missing_runtime_trace")
    .map((gap) => gap.targetId);

  return {
    totalTraces: traces.length,
    riskyTraceCount: traces.filter((trace) => trace.risky).length,
    tracedTargetCount: targets.length,
    openMissingTraceGapIds: uniqueSorted(
      state.gaps
        .filter((gap) => gap.status === "open" && gap.kind === "missing_runtime_trace")
        .map((gap) => gap.id)
    ),
    riskyTargetsMissingTrace: uniqueSorted([
      ...state.coverageItems
        .filter((item) => isRiskyTraceCandidate(item))
        .map((item) => item.id)
        .filter((targetId) => !tracedTargetIds.has(targetId)),
      ...missingTargetIdsFromGaps
    ]),
    targets
  };
}
