import type {
  RecoveryInspectionReport,
  RoutingRecommendationReport,
  RunExecutionPlan
} from "../domain/types.ts";
import type { OperatorStatusReport } from "./status.ts";

export interface OperatorDashboardReport {
  authorityLabel: "derived_only";
  runId: string;
  status: OperatorStatusReport;
  executionPlan: RunExecutionPlan;
  routing: RoutingRecommendationReport;
  recovery: RecoveryInspectionReport;
  alerts: string[];
  nextActions: string[];
}

export function buildOperatorDashboardReport(input: {
  status: OperatorStatusReport;
  executionPlan: RunExecutionPlan;
  routing: RoutingRecommendationReport;
  recovery: RecoveryInspectionReport;
}): OperatorDashboardReport {
  const alerts: string[] = [];
  const nextActions: string[] = [];

  if (!input.status.reviewIdentity.liveTrustReady) {
    alerts.push(`review identity not live-ready: ${input.status.reviewIdentity.notes.join("; ")}`);
  }

  if (input.status.gitNexus.state === "stale") {
    alerts.push("gitnexus advisory index is stale");
  }

  if (input.status.gitNexus.state === "invalid_metadata") {
    alerts.push("gitnexus advisory metadata is invalid");
  }

  for (const issue of input.recovery.issues) {
    if (issue.kind === "stalled_task") {
      alerts.push(`stalled task: ${issue.taskId}`);
    }
    if (issue.kind === "stale_review_block") {
      alerts.push(`stale review queue: ${issue.taskId}`);
    }
    if (issue.kind === "stale_approval") {
      alerts.push(`stale approval: ${issue.taskId}`);
    }
    if (issue.kind === "orphan_lock") {
      alerts.push(`orphan lock: ${issue.lockTaskId}`);
    }
  }

  for (const recommendation of input.routing.recommendations) {
    for (const rationale of recommendation.rationale) {
      if (rationale.startsWith("reasoning-quality: ")) {
        alerts.push(`reasoning-quality: ${recommendation.taskId}: ${rationale.slice("reasoning-quality: ".length)}`);
      }
    }
  }

  for (const rationale of input.executionPlan.directive.rationale) {
    if (rationale.startsWith("reasoning-quality: ")) {
      alerts.push(rationale);
    }
  }

  if (input.status.daemon.continuation?.state === "blocked") {
    alerts.push(`daemon continuation blocked: ${input.status.daemon.continuation.summary}`);
    if (input.status.daemon.continuation.provider && input.status.daemon.continuation.provider !== "none") {
      alerts.push(
        `daemon continuation owner=${input.status.daemon.continuation.wakeOwner ?? "unknown"} provider=${input.status.daemon.continuation.provider}`
      );
    }
    if (input.status.daemon.continuation.nextActions.length > 0) {
      nextActions.push(
        ...input.status.daemon.continuation.nextActions.map(
          (action) => `operator intervention required for daemon continuation: ${action}`
        )
      );
    } else {
      nextActions.push(`operator intervention required for daemon continuation: ${input.status.daemon.continuation.summary}`);
    }
  }

  if (input.status.daemon.handoff?.detailFiles.appAutomationRequest) {
    nextActions.push(
      `apply Codex app automation request: ${input.status.daemon.handoff.detailFiles.appAutomationRequest}`
    );
  }

  if (input.status.daemon.supervisor) {
    alerts.push(
      `daemon supervisor ${input.status.daemon.supervisor.state}: ${input.status.daemon.supervisor.reason}`
    );
    if (input.status.daemon.supervisor.missingReviewRoles.length > 0) {
      alerts.push(
        `daemon supervisor missing review actors: ${input.status.daemon.supervisor.missingReviewRoles.join(", ")}`
      );
    }
    if (input.status.daemon.supervisor.nextActions.length > 0) {
      nextActions.push(...input.status.daemon.supervisor.nextActions.map((action) => `supervisor follow-up: ${action}`));
    }
    if (input.status.daemon.supervisor.history.length > 0) {
      alerts.push(
        `daemon supervisor history: ${input.status.daemon.supervisor.history
          .map((entry) => `${entry.activeRunId ?? "unknown-run"}:${entry.state}/${entry.actionCount}`)
          .join(", ")}`
      );
    }
  }

  switch (input.executionPlan.directive.kind) {
    case "dispatch_owner":
      nextActions.push(
        `route ${input.executionPlan.directive.recommendation.taskId} to ${input.executionPlan.directive.recommendation.targetRole}`
      );
      break;
    case "dispatch_reviews":
      for (const recommendation of input.executionPlan.directive.recommendations) {
        if (recommendation.targetReviewRole) {
          nextActions.push(`request ${recommendation.targetReviewRole} for ${recommendation.taskId}`);
        }
      }
      break;
    case "apply_recovery":
      for (const action of input.executionPlan.directive.actions) {
        nextActions.push(`recover ${action.id}`);
      }
      break;
    case "continue_analysis":
      if (input.status.autonomous.resume.executionMode === "operator_required") {
        alerts.push(`autonomous continuation requires operator input: ${input.status.autonomous.resume.executionSummary}`);
        if (input.status.autonomous.resume.provider !== "none") {
          alerts.push(
            `autonomous continuation owner=${input.status.autonomous.resume.wakeOwner} provider=${input.status.autonomous.resume.provider}`
          );
        }
        nextActions.push(`operator intervention required: ${input.status.autonomous.resume.executionSummary}`);
      } else {
        nextActions.push(
          input.executionPlan.directive.nextActions[0] ?? `continue ${input.executionPlan.directive.targetId}`
        );
        for (const action of input.executionPlan.directive.nextActions.slice(1)) {
          nextActions.push(action);
        }
      }
      for (const blocker of input.executionPlan.directive.blockers) {
        alerts.push(`autonomous blocker: ${blocker}`);
      }
      break;
    case "blocked":
      alerts.push(...input.executionPlan.directive.blockers.map((blocker) => `execution blocked: ${blocker}`));
      break;
    case "complete":
      nextActions.push("none");
      if (input.executionPlan.directive.rationale.some((rationale) => rationale.startsWith("reasoning-quality: "))) {
        nextActions.push("review reasoning-quality warnings before declaring the run done");
      }
      break;
  }

  if (
    (input.status.gitNexus.state === "stale" || input.status.gitNexus.state === "missing_index") &&
    input.status.gitNexus.recommendedCommand
  ) {
    nextActions.push(input.status.gitNexus.recommendedCommand);
  }

  for (const recommendation of input.routing.recommendations) {
    const hasReasoningWarning = recommendation.rationale.some((rationale) =>
      rationale.startsWith("reasoning-quality: ")
    );
    if (hasReasoningWarning) {
      nextActions.push(`strengthen reasoning evidence for ${recommendation.taskId}`);
    }
  }

  return {
    authorityLabel: "derived_only",
    runId: input.status.run.id,
    status: input.status,
    executionPlan: input.executionPlan,
    routing: input.routing,
    recovery: input.recovery,
    alerts: unique(alerts),
    nextActions: unique(nextActions)
  };
}

export function formatOperatorDashboardReport(report: OperatorDashboardReport): string {
  const lines: string[] = [];
  lines.push(`Run ${report.runId}`);
  lines.push(`status: ${report.status.run.status}`);
  lines.push(
    `tasks: ready=${report.status.run.taskCounts.ready} in_progress=${report.status.run.taskCounts.in_progress} review_blocked=${report.status.run.taskCounts.review_blocked} approved=${report.status.run.taskCounts.approved} done=${report.status.run.taskCounts.done} blocked=${report.status.run.taskCounts.blocked}`
  );
  lines.push(
    `review-identity: ${report.status.reviewIdentity.liveTrustReady ? "live-ready" : "not-ready"}`
  );
  if (report.status.reviewIdentity.selectedBackend) {
    lines.push(`review-backend: ${report.status.reviewIdentity.selectedBackend}`);
  }
  if (report.status.reviewIdentity.availableBackends.length > 0) {
    lines.push(`available-backends: ${report.status.reviewIdentity.availableBackends.join(", ")}`);
  }
  lines.push(`recovery-issues: ${report.recovery.summary.totalIssues}`);
  lines.push(`safe-recovery-actions: ${report.recovery.summary.safeActions}`);
  lines.push(`execution-directive: ${report.executionPlan.directive.kind}`);
  lines.push(`next-ready: ${report.status.orchestration.nextTaskIds.join(", ") || "none"}`);
  lines.push(`gitnexus: ${report.status.gitNexus.state}`);
  if (report.status.gitNexus.configuredScopes.length > 0) {
    lines.push(`gitnexus-config: ${report.status.gitNexus.configuredScopes.join(", ")}`);
  }
  if (report.status.gitNexus.indexedAt) {
    lines.push(`gitnexus-indexed-at: ${report.status.gitNexus.indexedAt}`);
  }
  if (report.status.daemon.continuation) {
    lines.push(
      `daemon-continuation: ${report.status.daemon.continuation.state} ${report.status.daemon.continuation.executionMode} ${report.status.daemon.continuation.targetId ?? "unknown-target"} owner=${report.status.daemon.continuation.wakeOwner ?? "unknown"} provider=${report.status.daemon.continuation.provider ?? "unknown"}`
    );
  }
  if (report.status.daemon.supervisor) {
    lines.push(
      `daemon-supervisor: ${report.status.daemon.supervisor.state}${report.status.daemon.supervisor.blockerKind ? ` ${report.status.daemon.supervisor.blockerKind}` : ""} ${report.status.daemon.supervisor.reason}`
    );
    if (report.status.daemon.supervisor.history.length > 0) {
      lines.push(
        `daemon-supervisor-history-view: ${report.status.daemon.supervisor.historyView.scope}${report.status.daemon.supervisor.historyView.runId ? `:${report.status.daemon.supervisor.historyView.runId}` : ""} returned=${report.status.daemon.supervisor.historyView.returnedCount} filtered=${report.status.daemon.supervisor.historyView.filteredCount} retained=${report.status.daemon.supervisor.historyView.retainedCount} truncated=${report.status.daemon.supervisor.historyView.truncated ? "yes" : "no"}`
      );
      lines.push(
        `daemon-supervisor-history: ${report.status.daemon.supervisor.history
          .map(
            (entry) =>
              `${entry.recordedAt}:${entry.activeRunId ?? "unknown-run"}:${entry.state}:${entry.actionCount}`
          )
          .join(", ")}`
      );
    }
  }

  if (report.alerts.length > 0) {
    lines.push("alerts:");
    for (const alert of report.alerts) {
      lines.push(`- ${alert}`);
    }
  }

  if (report.nextActions.length > 0) {
    lines.push("next-actions:");
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}
