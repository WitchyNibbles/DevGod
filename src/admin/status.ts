import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { FreshnessGateDecision } from "../runtime/freshness-gate.ts";
import { assessFreshness } from "../runtime/freshness-gate.ts";
import type {
  RunExecutionPlan,
  RunStatusSnapshot,
  RuntimeTraceRegistrySummary,
  TaskStatus
} from "../domain/types.ts";
import type { GraphifyStatusObservation } from "./graphify.ts";
import {
  buildAutonomousOperatorSummary,
  type AutonomousContinuationProvider,
  type AutonomousContinuationScheduleKind,
  type AutonomousOperatorSummary,
  type AutonomousWakeOwner
} from "./autonomous-summary.ts";
import { buildRuntimeTraceRegistry } from "../runtime/runtime-trace-registry.ts";
import {
  liveTaskRequiredHeadings,
  liveTaskRequiredNonEmptyHeadings,
  liveTaskRequiredNonEmptyReasoningHeadings,
  liveTaskRequiredReasoningHeadings
} from "../devgod/workflow-schema.ts";

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
  provider?: AutonomousContinuationProvider | undefined;
  wakeOwner?: AutonomousWakeOwner | undefined;
  scheduleKind?: AutonomousContinuationScheduleKind | undefined;
  schedule?: string | undefined;
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
    automationEnvelope?: string | undefined;
    appAutomationRequest?: string | undefined;
    cliSchedulerRequest?: string | undefined;
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
    action:
      | "enqueue_operator_continuation"
      | "enqueue_review_action"
      | "materialize_app_automation"
      | "materialize_cli_scheduler";
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

export interface TaskProofObligationTaskObservation {
  authorityLabel: "derived_only";
  taskId: string;
  exportState: "valid" | "missing" | "invalid";
  artifactPath: string;
  verificationCommand: string;
  issues: string[];
}

export interface TaskProofObligationObservation {
  authorityLabel: "derived_only";
  status: "none" | "outstanding";
  tasks: TaskProofObligationTaskObservation[];
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
  traceRegistry: {
    authorityLabel: "derived_only";
    summary?: RuntimeTraceRegistrySummary | undefined;
  };
  compaction: {
    authorityLabel: "runtime_authoritative";
    status: "missing" | "present";
    checkpointId?: string | undefined;
    ref?: string | undefined;
    summary?: string | undefined;
    sourceRefs: string[];
    generatedAt?: string | undefined;
  };
  evalPosture: {
    authorityLabel: "runtime_authoritative";
    status: "missing" | "repo_local_only" | "semi_external_ready" | "external_ready";
    labels: string[];
    repoLocalLabels: string[];
    broaderEvidenceLabels: string[];
    artifactRefs: string[];
    boundarySummary: string;
  };
  reviewControls: {
    authorityLabel: "runtime_authoritative";
    status: "missing" | "explicit";
    controls: Array<{
      controlId: string;
      actionType: string;
      enforcement: string;
      summary: string;
    }>;
  };
  daemon: {
    authorityLabel: "derived_only";
    continuation?: DaemonContinuationStatusObservation | undefined;
    handoff?: DaemonOperatorHandoffObservation | undefined;
    supervisor?: DaemonSupervisorStatusObservation | undefined;
  };
  reviewIdentity: ReviewIdentityStatusObservation;
  graphify: GraphifyStatusObservation;
  integrity: {
    authorityLabel: "derived_only";
    status: "consistent" | "contradicted" | "unavailable";
    contradictions: string[];
    runtimeState?: {
      authorityLabel: "runtime_authoritative";
      activeTaskId: string | null;
      projectStatus: string;
      lastVerifiedRunId: string | null;
      seedFailure?:
        | {
            runId: string;
            taskId: string;
            reason: string;
            failedAt?: string | undefined;
            recoveryState: "requires_reproof" | "stale_metadata";
          }
        | undefined;
      lastIntegrityRepair?:
        | {
            source: "doctor_repair" | "recover_apply" | "reconcile_runtime_state" | "sync_runtime_exports";
            kind:
              | "local_export_resync"
              | "runtime_metadata_cleanup"
              | "runtime_task_reconcile"
              | "recovery_action_apply";
            summary: string;
            repairedAt: string;
          }
        | undefined;
    } | undefined;
    localExports?: {
      authorityLabel: "derived_only";
      activeState: "active" | "idle" | "complete" | "unknown";
      activeTaskId: string | null;
      queueProjectStatus: string;
      queueCurrentTaskId: string | null;
    } | undefined;
    taskProofObligations?: TaskProofObligationObservation | undefined;
  };
}

function toRelativeArtifactPath(cwd: string, artifactPath: string): string {
  const relativePath = path.relative(cwd, artifactPath);
  return relativePath.length > 0 ? relativePath.split(path.sep).join("/") : path.basename(artifactPath);
}

function readMarkdownSectionBlock(content: string, heading: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex === -1) {
    return undefined;
  }

  const block: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().startsWith("#")) {
      break;
    }
    block.push(line);
  }

  return block.join("\n");
}

function isNonEmptySectionBlock(content: string, heading: string): boolean {
  const block = readMarkdownSectionBlock(content, heading);
  return block !== undefined && block.trim().length > 0;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inspectApprovedTaskArtifact(input: {
  cwd: string;
  task: RunStatusSnapshot["tasks"][number];
}): Promise<TaskProofObligationTaskObservation> {
  const taskId = input.task.packet.taskId;
  const taskArtifactPath = path.join(input.cwd, ".devgod", "work", "tasks", `task-${taskId}.md`);
  const artifactPath = toRelativeArtifactPath(input.cwd, taskArtifactPath);
  const issues: string[] = [];

  let taskContent: string | undefined;
  try {
    taskContent = await readFile(taskArtifactPath, "utf8");
  } catch {
    taskContent = undefined;
  }

  if (!taskContent) {
    issues.push(`approved task ${taskId} is missing exported task artifact ${artifactPath}`);
    return {
      authorityLabel: "derived_only",
      taskId,
      exportState: "missing",
      artifactPath,
      verificationCommand: `bash scripts/check-devgod-workflow-live.sh --task-id ${taskId}`,
      issues
    };
  }

  for (const heading of liveTaskRequiredHeadings) {
    if (!taskContent.includes(heading)) {
      issues.push(`missing heading ${heading} in ${artifactPath}`);
    }
  }
  for (const heading of liveTaskRequiredReasoningHeadings) {
    if (!taskContent.includes(heading)) {
      issues.push(`missing heading ${heading} in ${artifactPath}`);
    }
  }
  for (const heading of liveTaskRequiredNonEmptyHeadings) {
    if (!isNonEmptySectionBlock(taskContent, heading)) {
      issues.push(`blank section ${heading} in ${artifactPath}`);
    }
  }
  for (const heading of liveTaskRequiredNonEmptyReasoningHeadings) {
    if (!isNonEmptySectionBlock(taskContent, heading)) {
      issues.push(`blank section ${heading} in ${artifactPath}`);
    }
  }
  if (
    input.task.packet.completionStandard === "specialist_verified" ||
    input.task.packet.qualityGates.includes("completion_audit_required")
  ) {
    for (const heading of [
      "## Completion audit",
      "### Audit claim",
      "### Audit evidence expectations",
      "### Loop-back trigger"
    ]) {
      if (!taskContent.includes(heading)) {
        issues.push(`missing heading ${heading} in ${artifactPath}`);
      } else if (!isNonEmptySectionBlock(taskContent, heading)) {
        issues.push(`blank section ${heading} in ${artifactPath}`);
      }
    }
  }

  const additionalArtifactPaths: string[] = [];
  if (input.task.packet.qualityGates.includes("coverage_ledger_required")) {
    additionalArtifactPaths.push(
      `.devgod/work/coverage/coverage-${taskId}.json`,
      `.devgod/work/coverage/items-${taskId}.json`,
      `.devgod/work/coverage/gaps-${taskId}.json`,
      `.devgod/work/coverage/dependency-graph-${taskId}.json`,
      `.devgod/work/coverage/traces-${taskId}.json`
    );
  }
  if (input.task.packet.qualityGates.includes("progress_proof_required")) {
    additionalArtifactPaths.push(`.devgod/work/proofs/progress-${taskId}.json`);
  }
  if (
    input.task.packet.qualityGates.includes("checkpoint_resume_required") ||
    input.task.packet.qualityGates.includes("memory_compaction_required")
  ) {
    additionalArtifactPaths.push(`.devgod/work/checkpoints/checkpoint-${taskId}.md`);
  }

  for (const relativeArtifactPath of additionalArtifactPaths) {
    const absoluteArtifactPath = path.join(input.cwd, relativeArtifactPath);
    if (!(await fileExists(absoluteArtifactPath))) {
      issues.push(`missing exported artifact ${relativeArtifactPath} for approved task ${taskId}`);
    }
  }

  return {
    authorityLabel: "derived_only",
    taskId,
    exportState: issues.length === 0 ? "valid" : "invalid",
    artifactPath,
    verificationCommand: `bash scripts/check-devgod-workflow-live.sh --task-id ${taskId}`,
    issues
  };
}

export async function inspectTaskProofObligations(input: {
  cwd: string;
  snapshot: RunStatusSnapshot;
}): Promise<TaskProofObligationObservation> {
  const approvedTasks = input.snapshot.tasks.filter((task) => task.status === "approved");
  if (approvedTasks.length === 0) {
    return {
      authorityLabel: "derived_only",
      status: "none",
      tasks: []
    };
  }

  return {
    authorityLabel: "derived_only",
    status: "outstanding",
    tasks: await Promise.all(
      approvedTasks.map((task) =>
        inspectApprovedTaskArtifact({
          cwd: path.resolve(input.cwd),
          task
        })
      )
    )
  };
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
  graphify: GraphifyStatusObservation;
  integrity?: OperatorStatusReport["integrity"] | undefined;
  now?: string | undefined;
  staleAfterDays?: number | undefined;
}): OperatorStatusReport {
  const byStatus = emptyTaskBuckets();
  const traceRegistrySummary = input.snapshot.autonomousExecution
    ? buildRuntimeTraceRegistry(input.snapshot.autonomousExecution.state, { now: input.now })
    : undefined;
  const latestCheckpoint = input.snapshot.autonomousExecution?.state.checkpoints.at(-1);
  const externalEvals = input.snapshot.autonomousExecution?.state.externalEvals ?? [];
  const repoLocalEvalLabels = externalEvals
    .filter((record) => record.scope === "repo_local")
    .map((record) => record.label);
  const broaderEvalLabels = externalEvals
    .filter((record) => record.scope !== "repo_local")
    .map((record) => record.label);
  const evalBoundarySummary =
    externalEvals.length === 0
      ? "No eval evidence is recorded."
      : repoLocalEvalLabels.length > 0 && broaderEvalLabels.length > 0
        ? "Repo-local eval evidence and broader replay-grade or external evidence are both present; neither changes runtime-authoritative run/task truth."
        : repoLocalEvalLabels.length > 0
          ? "Repo-local eval evidence is present; treat it as derived repo-local proof, not runtime authority."
          : "Only broader replay-grade or external evidence is present; keep it separate from runtime-authoritative run/task truth.";
  const sensitiveActionControls = input.snapshot.autonomousExecution?.state.sensitiveActionControls ?? [];

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
    traceRegistry: {
      authorityLabel: "derived_only",
      summary: traceRegistrySummary
    },
    compaction: {
      authorityLabel: "runtime_authoritative",
      status:
        latestCheckpoint?.compressedContextRef &&
        latestCheckpoint.compressedContextSummary?.trim() &&
        (latestCheckpoint.compressedContextSourceRefs?.some((value) => value.trim().length > 0) ?? false)
          ? "present"
          : "missing",
      checkpointId: latestCheckpoint?.checkpointId,
      ref: latestCheckpoint?.compressedContextRef,
      summary: latestCheckpoint?.compressedContextSummary,
      sourceRefs: [...(latestCheckpoint?.compressedContextSourceRefs ?? [])],
      generatedAt: latestCheckpoint?.compressedContextGeneratedAt
    },
    evalPosture: {
      authorityLabel: "runtime_authoritative",
      status:
        externalEvals.some((record) => record.scope === "external")
          ? "external_ready"
          : externalEvals.some((record) => record.scope === "semi_external")
            ? "semi_external_ready"
            : externalEvals.length > 0
              ? "repo_local_only"
              : "missing",
      labels: externalEvals.map((record) => record.label),
      repoLocalLabels: repoLocalEvalLabels,
      broaderEvidenceLabels: broaderEvalLabels,
      artifactRefs: externalEvals.map((record) => record.artifactRef),
      boundarySummary: evalBoundarySummary
    },
    reviewControls: {
      authorityLabel: "runtime_authoritative",
      status: sensitiveActionControls.length > 0 ? "explicit" : "missing",
      controls: sensitiveActionControls.map((record) => ({
        controlId: record.controlId,
        actionType: record.actionType,
        enforcement: record.enforcement,
        summary: record.summary
      }))
    },
    daemon: {
      authorityLabel: "derived_only",
      continuation: input.daemonContinuation,
      handoff: input.daemonHandoff,
      supervisor: input.daemonSupervisor
    },
    reviewIdentity: input.reviewIdentity,
    graphify: input.graphify,
    integrity: input.integrity ?? {
      authorityLabel: "derived_only",
      status: "unavailable",
      contradictions: []
    }
  };
}
