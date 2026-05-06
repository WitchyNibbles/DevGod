import type { FreshnessGateDecision } from "../runtime/freshness-gate.ts";
import { assessFreshness } from "../runtime/freshness-gate.ts";
import type { RunStatusSnapshot, TaskStatus } from "../domain/types.ts";

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
  reviewIdentity: ReviewIdentityStatusObservation;
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
  reviewIdentity: ReviewIdentityStatusObservation;
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
    reviewIdentity: input.reviewIdentity
  };
}
