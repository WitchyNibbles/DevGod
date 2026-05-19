import type { FreshnessGateDecision } from "../runtime/freshness-gate.ts";
import { assessFreshness } from "../runtime/freshness-gate.ts";
import type { RunExecutionPlan, RunStatusSnapshot, TaskStatus } from "../domain/types.ts";
import type { GitNexusStatusObservation } from "./gitnexus.ts";
import { buildAutonomousOperatorSummary, type AutonomousOperatorSummary } from "./autonomous-summary.ts";

type StatusAuthorityLabel = "runtime_authoritative" | "derived_only";

export interface ReviewIdentityStatusObservation {
  authorityLabel: "derived_only";
  adapterConfigured: boolean;
  adapterExists: boolean;
  adapterModulePath?: string | undefined;
  selectedBackend?: string | undefined;
  availableBackends: string[];
  bindingsPresent: boolean;
  bindingsPath: string;
  bindingsUseShippedTemplate: boolean;
  liveTrustReady: boolean;
  notes: string[];
}

export interface DaemonContinuationStatusObservation {
  authorityLabel: "derived_only";
  state: "blocked" | "invalid";
  directiveKind: "continue_analysis";
  executionMode: "operator_required" | "unknown";
  targetId?: string | undefined;
  source?: "blocking_gap" | "progress_proof" | "checkpoint" | undefined;
  sourceId?: string | undefined;
  actionKind?: "resolve_blocking_gap" | "run_workflow_proof" | "resume_target" | undefined;
  summary: string;
  nextActions: string[];
  blockers: string[];
  updatedAt?: string | undefined;
}

export interface DaemonOperatorHandoffObservation {
  authorityLabel: "derived_only";
  state: "blocked" | "invalid";
  blockerKind:
    | "bootstrapping"
    | "runtime_preflight"
    | "missing_active_runtime"
    | "review_queue"
    | "review_execution_unsupported"
    | "operator_required_continuation"
    | "workflow_proof_failure"
    | "scope_expansion_required"
    | "runtime_blocked"
    | "recovery_required"
    | "runtime_task_missing"
    | "active_task_mismatch"
    | "unknown";
  reason: string;
  workspaceSlug?: string | undefined;
  projectSlug?: string | undefined;
  activeRunId?: string | null | undefined;
  activeTaskId?: string | null | undefined;
  sessionId?: string | null | undefined;
  cycle?: number | undefined;
  directiveKind?: RunExecutionPlan["directive"]["kind"] | undefined;
  nextActions: string[];
  detailFiles: {
    continuationStatus?: string | undefined;
    reviewQueueStatus?: string | undefined;
    scopeExpansionRequest?: string | undefined;
  };
  updatedAt?: string | undefined;
}

export interface DaemonSupervisorStatusObservation {
  authorityLabel: "derived_only";
  state: "completed" | "blocked" | "max_cycles_reached" | "invalid";
  blockerKind?:
    | "runtime_preflight"
    | "missing_review_actor_bindings"
    | "handoff_missing"
    | "unsupported_handoff"
    | "continuation_derivation_failed"
    | "review_derivation_failed"
    | "unknown"
    | undefined;
  reason: string;
  workspaceSlug?: string | undefined;
  projectSlug?: string | undefined;
  activeRunId?: string | null | undefined;
  activeTaskId?: string | null | undefined;
  sessionId?: string | null | undefined;
  supervisorCycles?: number | undefined;
  nextActions: string[];
  missingReviewRoles: string[];
  actions: Array<{
    cycle: number;
    action: "enqueue_operator_continuation" | "enqueue_review_action";
    targetId?: string | undefined;
    taskId?: string | undefined;
    reviewRole?: string | undefined;
    filePath: string;
    summary: string;
  }>;
  history: Array<{
    recordedAt: string;
    state: "completed" | "blocked" | "max_cycles_reached";
    activeRunId?: string | null | undefined;
    activeTaskId?: string | null | undefined;
    blockerKind?:
      | "runtime_preflight"
      | "missing_review_actor_bindings"
      | "handoff_missing"
      | "unsupported_handoff"
      | "continuation_derivation_failed"
      | "review_derivation_failed"
      | "unknown"
      | undefined;
    reason: string;
    supervisorCycles?: number | undefined;
    actionCount: number;
  }>;
  historyView: {
    scope: "run" | "all";
    runId?: string | undefined;
    limit: number;
    retainedCount: number;
    filteredCount: number;
    returnedCount: number;
    truncated: boolean;
  };
  updatedAt?: string | undefined;
}

export interface OperatorStatusReport {
  run: {
    authorityLabel: "runtime_authoritative";
    id: string;
    status: RunStatusSnapshot["run"]["status"];
    actor: string;
    updatedAt: string;
    taskCounts: Record<TaskStatus, number>;
  };
  tasks: {
    authorityLabel: "runtime_authoritative";
    byStatus: Record<TaskStatus, string[]>;
    activeLocks: Array<{
      taskId: string;
      scopePaths: string[];
    }>;
  };
  orchestration: {
    authorityLabel: "derived_only";
    blockers: string[];
    nextTaskIds: string[];
    freshness: FreshnessGateDecision;
  };
  autonomous: AutonomousOperatorSummary;
  daemon: {
    authorityLabel: "derived_only";
    continuation?: DaemonContinuationStatusObservation | undefined;
    handoff?: DaemonOperatorHandoffObservation | undefined;
    supervisor?: DaemonSupervisorStatusObservation | undefined;
  };
  reviewIdentity: ReviewIdentityStatusObservation;
  gitNexus: GitNexusStatusObservation;
}

function emptyTaskBuckets(): Record<TaskStatus, string[]> {
  return {
    ready: [],
    in_progress: [],
    review_blocked: [],
    approved: [],
    done: [],
    blocked: []
  };
}

function countTaskBuckets(byStatus: Record<TaskStatus, string[]>): Record<TaskStatus, number> {
  return {
    ready: byStatus.ready.length,
    in_progress: byStatus.in_progress.length,
    review_blocked: byStatus.review_blocked.length,
    approved: byStatus.approved.length,
    done: byStatus.done.length,
    blocked: byStatus.blocked.length
  };
}

export function buildOperatorStatusReport(input: {
  snapshot: RunStatusSnapshot;
  executionPlan?: RunExecutionPlan | undefined;
  daemonContinuation?: DaemonContinuationStatusObservation | undefined;
  daemonHandoff?: DaemonOperatorHandoffObservation | undefined;
  daemonSupervisor?: DaemonSupervisorStatusObservation | undefined;
  reviewIdentity: ReviewIdentityStatusObservation;
  gitNexus: GitNexusStatusObservation;
  now?: string | undefined;
  staleAfterDays?: number | undefined;
}): OperatorStatusReport {
  const byStatus = emptyTaskBuckets();

  for (const task of input.snapshot.tasks) {
    byStatus[task.status].push(task.packet.taskId);
  }

  const freshness = assessFreshness(
    {
      createdAt: input.snapshot.run.updatedAt,
      maxAgeDays: input.staleAfterDays ?? 1
    },
    input.now
  );

  return {
    run: {
      authorityLabel: "runtime_authoritative",
      id: input.snapshot.run.id,
      status: input.snapshot.run.status,
      actor: input.snapshot.run.actor,
      updatedAt: input.snapshot.run.updatedAt,
      taskCounts: countTaskBuckets(byStatus)
    },
    tasks: {
      authorityLabel: "runtime_authoritative",
      byStatus,
      activeLocks: input.snapshot.activeLocks.map((lock) => ({
        taskId: lock.taskId,
        scopePaths: [...lock.scopePaths]
      }))
    },
    orchestration: {
      authorityLabel: "derived_only",
      blockers: [...input.snapshot.blockers],
      nextTaskIds: [...input.snapshot.nextTaskIds],
      freshness
    },
    autonomous: buildAutonomousOperatorSummary({
      snapshot: input.snapshot,
      executionPlan: input.executionPlan
    }),
    daemon: {
      authorityLabel: "derived_only",
      continuation: input.daemonContinuation,
      handoff: input.daemonHandoff,
      supervisor: input.daemonSupervisor
    },
    reviewIdentity: input.reviewIdentity,
    gitNexus: input.gitNexus
  };
}
