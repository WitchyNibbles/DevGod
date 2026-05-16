import { collectAutonomousExecutionBlockers } from "../runtime/autonomous-execution.ts";
import type {
  AutonomousExecutionSnapshot,
  CheckpointRecord,
  CoverageGapRecord,
  ProgressProofRecord,
  RunExecutionPlan,
  RunStatusSnapshot
} from "../domain/types.ts";

export type AutonomousResumeStatus = "not_configured" | "ready" | "blocked";
export type AutonomousResumeSource =
  | "none"
  | "checkpoint"
  | "progress_proof"
  | "blocking_gap"
  | "execution_plan";

export interface AutonomousResumeGuidance {
  authorityLabel: "derived_only";
  status: AutonomousResumeStatus;
  source: AutonomousResumeSource;
  summary: string;
  nextTarget?: string | undefined;
  nextActions: string[];
  blockers: string[];
  checkpointId?: string | undefined;
  progressProofId?: string | undefined;
}

export interface AutonomousOperatorSummary {
  stateAuthorityLabel: "runtime_authoritative";
  resumeAuthorityLabel: "derived_only";
  configured: boolean;
  updatedAt?: string | undefined;
  profile?: AutonomousExecutionSnapshot["state"]["profile"] | undefined;
  phase?: AutonomousExecutionSnapshot["state"]["phase"] | undefined;
  manifest?: AutonomousExecutionSnapshot["state"]["manifest"] | undefined;
  coverageSummary?: AutonomousExecutionSnapshot["coverageSummary"] | undefined;
  phaseReadiness?: AutonomousExecutionSnapshot["phaseReadiness"] | undefined;
  blockers: string[];
  openGaps: CoverageGapRecord[];
  blockingGaps: CoverageGapRecord[];
  latestProgressProof?: ProgressProofRecord | undefined;
  latestCheckpoint?: CheckpointRecord | undefined;
  resume: AutonomousResumeGuidance;
}

export function buildAutonomousOperatorSummary(input: {
  snapshot: RunStatusSnapshot;
  executionPlan?: RunExecutionPlan | undefined;
}): AutonomousOperatorSummary {
  const autonomousExecution = input.snapshot.autonomousExecution;
  if (!autonomousExecution) {
    return {
      stateAuthorityLabel: "runtime_authoritative",
      resumeAuthorityLabel: "derived_only",
      configured: false,
      blockers: [],
      openGaps: [],
      blockingGaps: [],
      resume: {
        authorityLabel: "derived_only",
        status: "not_configured",
        source: "none",
        summary: "autonomous execution is not configured for this run",
        nextActions: [],
        blockers: []
      }
    };
  }

  const { state } = autonomousExecution;
  const openGaps = state.gaps.filter((gap) => gap.status === "open");
  const blockingGaps = openGaps.filter((gap) => gap.blocking);
  const blockers = collectAutonomousExecutionBlockers(state, input.snapshot.tasks);
  const latestProgressProof = latestProgressProofRecord(state.progressProofs);
  const latestCheckpoint = latestCheckpointRecord(state.checkpoints);

  return {
    stateAuthorityLabel: "runtime_authoritative",
    resumeAuthorityLabel: "derived_only",
    configured: true,
    updatedAt: state.updatedAt,
    profile: state.profile,
    phase: state.phase,
    manifest: state.manifest,
    coverageSummary: autonomousExecution.coverageSummary,
    phaseReadiness: autonomousExecution.phaseReadiness,
    blockers,
    openGaps,
    blockingGaps,
    latestProgressProof,
    latestCheckpoint,
    resume: buildResumeGuidance({
      blockers,
      blockingGaps,
      latestProgressProof,
      latestCheckpoint,
      executionPlan: input.executionPlan
    })
  };
}

function buildResumeGuidance(input: {
  blockers: string[];
  blockingGaps: readonly CoverageGapRecord[];
  latestProgressProof?: ProgressProofRecord | undefined;
  latestCheckpoint?: CheckpointRecord | undefined;
  executionPlan?: RunExecutionPlan | undefined;
}): AutonomousResumeGuidance {
  const checkpointTarget = input.latestCheckpoint?.activeTargets[0];
  const proofTarget = input.latestProgressProof?.nextTarget;
  const gapTarget = input.blockingGaps[0]?.targetId;
  const checkpointActions = input.latestCheckpoint?.nextActions ?? [];
  const gapActions = input.blockingGaps[0]?.suggestedNextActions ?? [];

  if (input.blockers.length > 0) {
    const nextActions =
      gapActions.length > 0
          ? [...gapActions]
          : checkpointActions.length > 0
            ? [...checkpointActions]
          : deriveExecutionPlanActions(input.executionPlan);
    return {
      authorityLabel: "derived_only",
      status: "blocked",
      source: input.blockingGaps.length > 0 ? "blocking_gap" : sourceForFallback(input),
      summary: input.blockers[0] ?? "autonomous continuation is blocked",
      nextTarget: gapTarget ?? proofTarget ?? checkpointTarget,
      nextActions,
      blockers: [...input.blockers],
      checkpointId: input.latestCheckpoint?.checkpointId,
      progressProofId: input.latestProgressProof?.proofId
    };
  }

  if (input.latestCheckpoint) {
    return {
      authorityLabel: "derived_only",
      status: "ready",
      source: "checkpoint",
      summary:
        checkpointActions[0] ??
        (checkpointTarget ? `resume at ${checkpointTarget}` : "resume from the latest checkpoint"),
      nextTarget: proofTarget ?? checkpointTarget,
      nextActions: checkpointActions.length > 0 ? [...checkpointActions] : deriveExecutionPlanActions(input.executionPlan),
      blockers: [],
      checkpointId: input.latestCheckpoint.checkpointId,
      progressProofId: input.latestProgressProof?.proofId
    };
  }

  if (input.latestProgressProof) {
    return {
      authorityLabel: "derived_only",
      status: "ready",
      source: "progress_proof",
      summary:
        input.latestProgressProof.whyNext?.trim() ||
        (proofTarget ? `continue at ${proofTarget}` : "continue from the latest progress proof"),
      nextTarget: proofTarget,
      nextActions:
        deriveProofActions(input.latestProgressProof).length > 0
          ? deriveProofActions(input.latestProgressProof)
          : deriveExecutionPlanActions(input.executionPlan),
      blockers: [],
      checkpointId: undefined,
      progressProofId: input.latestProgressProof.proofId
    };
  }

  const planActions = deriveExecutionPlanActions(input.executionPlan);
  return {
    authorityLabel: "derived_only",
    status: planActions.length > 0 ? "ready" : "not_configured",
    source: planActions.length > 0 ? "execution_plan" : "none",
    summary:
      planActions[0] ??
      "autonomous execution has no checkpoint or progress proof to derive resume guidance from",
    nextTarget: checkpointTarget ?? proofTarget ?? gapTarget,
    nextActions: planActions,
    blockers: []
  };
}

function sourceForFallback(input: {
  latestCheckpoint?: CheckpointRecord | undefined;
  latestProgressProof?: ProgressProofRecord | undefined;
  executionPlan?: RunExecutionPlan | undefined;
}): AutonomousResumeSource {
  if (input.latestCheckpoint) {
    return "checkpoint";
  }
  if (input.latestProgressProof) {
    return "progress_proof";
  }
  if (input.executionPlan) {
    return "execution_plan";
  }
  return "none";
}

function deriveExecutionPlanActions(plan?: RunExecutionPlan | undefined): string[] {
  if (!plan) {
    return [];
  }

  switch (plan.directive.kind) {
    case "dispatch_owner":
      return [
        `dispatch ${plan.directive.recommendation.taskId} to ${plan.directive.recommendation.targetRole ?? "owner"}`
      ];
    case "dispatch_reviews":
      return plan.directive.recommendations.map((recommendation) =>
        recommendation.targetReviewRole
          ? `request ${recommendation.targetReviewRole} for ${recommendation.taskId}`
          : `request review for ${recommendation.taskId}`
      );
    case "apply_recovery":
      return plan.directive.actions.map((action) => `apply recovery ${action.id}`);
    case "continue_analysis":
      return plan.directive.nextActions.length > 0
        ? [...plan.directive.nextActions]
        : [`continue ${plan.directive.targetId}`];
    case "blocked":
      return [...plan.directive.blockers];
    case "complete":
      return [];
    default:
      return [];
  }
}

function deriveProofActions(proof: ProgressProofRecord): string[] {
  if (proof.whyNext?.trim()) {
    return [proof.whyNext.trim()];
  }
  if (proof.nextTarget.trim().length > 0) {
    return [`continue at ${proof.nextTarget}`];
  }
  return [];
}

function latestProgressProofRecord(records: readonly ProgressProofRecord[]): ProgressProofRecord | undefined {
  return [...records].sort((left, right) => {
    const cycleOrder = right.cycle - left.cycle;
    if (cycleOrder !== 0) {
      return cycleOrder;
    }
    return right.createdAt.localeCompare(left.createdAt);
  })[0];
}

function latestCheckpointRecord(records: readonly CheckpointRecord[]): CheckpointRecord | undefined {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}
