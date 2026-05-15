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
